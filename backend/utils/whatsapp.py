"""
WhatsApp integration via GreenAPI.

Handles:
  - Text messages (textMessage / extendedTextMessage)
  - Voice notes (audioMessage) — transcribed via Gemini 1.5 Flash
  - Location sharing (locationMessage) — nearest hospital lookup
  - Sending text replies back via GreenAPI sendMessage
  - Background tasks for AI pipeline processing
"""

import httpx
import json
import google.generativeai as genai

from config.settings import settings
from utils.logger import logger

genai.configure(api_key=settings.GEMINI_API_KEY)

GREENAPI_SEND_URL = (
    "https://api.green-api.com/waInstance{id}/sendMessage/{token}"
)

# Appended to triage replies (text + audio) to guide users to location/web
WEBAPP_FOOTER = (
    "\n\n🏥 Apne qareebi aspatal dekhne ke liye, WhatsApp par apni "
    "'Location' (📍) bhejen, ya hamari website visit karen: "
    "https://shifa-73fg.onrender.com"
)

DISCLAIMER = "\n\n⚠️ یہ صرف عمومی معلومات ہے — ڈاکٹر سے ضرور ملیں۔"


# ---------------------------------------------------------------------------
# Payload parsing — returns (chat_id, message_type, data)
# ---------------------------------------------------------------------------

def parse_incoming_message(payload: dict) -> tuple[str, str, dict] | None:
    """
    Parse a GreenAPI webhook payload.

    Returns:
        (chat_id, message_type, extra_data)  where message_type is one of:
            "text"     — extra_data = {"text": "..."}
            "audio"    — extra_data = {"download_url": "..."}
            "location" — extra_data = {"latitude": float, "longitude": float}
        or None if the payload should be ignored.
    """
    type_webhook = payload.get("typeWebhook")
    if type_webhook != "incomingMessageReceived":
        return None

    sender_data = payload.get("senderData", {})
    chat_id = sender_data.get("chatId", "")
    if not chat_id:
        return None

    message_data = payload.get("messageData", {})
    type_message = message_data.get("typeMessage", "")

    # --- Text messages (mobile + desktop + quoted replies) ---
    if type_message in ("textMessage", "extendedTextMessage"):
        text = (
            message_data.get("textMessageData", {}).get("textMessage")
            or message_data.get("extendedTextMessageData", {}).get("text")
            or ""
        ).strip()
        if not text:
            logger.warning("WhatsApp text from %s is empty; dropping.", chat_id)
            return None
        logger.info("WhatsApp TEXT from %s — len=%d", chat_id, len(text))
        return chat_id, "text", {"text": text}

    # --- Voice notes ---
    if type_message == "audioMessage":
        download_url = message_data.get("fileMessageData", {}).get("downloadUrl", "")
        if not download_url:
            logger.warning("WhatsApp audio from %s has no downloadUrl; dropping.", chat_id)
            return None
        logger.info("WhatsApp AUDIO from %s — url present", chat_id)
        return chat_id, "audio", {"download_url": download_url}

    # --- Location ---
    if type_message == "locationMessage":
        loc_data = message_data.get("locationMessageData", {})
        lat = loc_data.get("latitude")
        lng = loc_data.get("longitude")
        if lat is None or lng is None:
            logger.warning("WhatsApp location from %s missing coords; dropping.", chat_id)
            return None
        logger.info("WhatsApp LOCATION from %s — (%.4f, %.4f)", chat_id, lat, lng)
        return chat_id, "location", {"latitude": float(lat), "longitude": float(lng)}

    # --- Unsupported (images, stickers, contacts, etc.) — silently ignore ---
    logger.info("WhatsApp %s from %s — unsupported, ignoring.", type_message, chat_id)
    return None


# ---------------------------------------------------------------------------
# Send reply
# ---------------------------------------------------------------------------

async def send_whatsapp_reply(chat_id: str, message: str) -> None:
    """Send a text message back to the user via GreenAPI sendMessage."""
    url = GREENAPI_SEND_URL.format(
        id=settings.GREENAPI_ID_INSTANCE,
        token=settings.GREENAPI_API_TOKEN,
    )
    body = {"chatId": chat_id, "message": message}

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, json=body)
            resp.raise_for_status()
            logger.info("WhatsApp reply sent to %s (status %d)", chat_id, resp.status_code)
    except Exception as exc:
        logger.error("Failed to send WhatsApp reply to %s: %s", chat_id, exc)


# ---------------------------------------------------------------------------
# Voice note → text transcription via Gemini
# ---------------------------------------------------------------------------

async def transcribe_voice_note(download_url: str) -> str:
    """
    Download a WhatsApp voice note (.ogg) and use Gemini 1.5 Flash
    to transcribe / analyze the patient's spoken Urdu symptoms.

    Returns the transcribed text, or an error message.
    """
    try:
        # Step 1: Download the audio file
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.get(download_url)
            resp.raise_for_status()
            audio_bytes = resp.content

        logger.info("Voice note downloaded — %d bytes", len(audio_bytes))

        # Step 2: Send to Gemini for transcription / symptom extraction
        model = genai.GenerativeModel("gemini-1.5-flash")

        prompt = (
            "You are a medical assistant in Pakistan. "
            "The following audio is a patient speaking in Urdu about their symptoms. "
            "Transcribe what the patient said into Urdu text. "
            "If the audio is unclear, do your best to capture the key symptoms mentioned. "
            "Respond ONLY with the Urdu transcription — nothing else."
        )

        response = model.generate_content([
            prompt,
            {"mime_type": "audio/ogg", "data": audio_bytes},
        ])

        transcribed = response.text.strip()
        logger.info("Voice note transcribed — len=%d", len(transcribed))
        return transcribed

    except Exception as exc:
        logger.error("Voice note transcription failed: %s", exc)
        return ""


# ---------------------------------------------------------------------------
# Background task: process text (or transcribed audio) → reply
# ---------------------------------------------------------------------------

async def process_and_reply(chat_id: str, text: str) -> None:
    """
    Background task: run the Shifa AI pipeline on the user's text,
    then send the Urdu response back via WhatsApp.
    """
    logger.info("WhatsApp pipeline start — chat_id=%s, text_len=%d", chat_id, len(text))

    try:
        from agents.orchestrator import run_pipeline
        from agents.triage_agent import evaluate_triage

        # Step 1: Triage — check if clarification is needed
        triage = await evaluate_triage(latest_input=text, history=[])

        if triage.get("status") == "clarification_needed":
            reply = triage.get(
                "question_urdu",
                "آپ کی تکلیف کے بارے میں مزید بتائیں۔",
            )
        else:
            # Step 2: Full pipeline (no GPS — use Islamabad defaults)
            result = await run_pipeline(
                urdu_text=text,
                latitude=33.6844,
                longitude=73.0479,
                history=[],
            )
            reply = result.get(
                "response_text_urdu",
                "معذرت، ابھی جواب تیار نہیں ہو سکا۔ براہ کرم دوبارہ کوشش کریں۔",
            )

    except Exception as exc:
        logger.error("WhatsApp pipeline error for %s: %s", chat_id, exc)
        reply = (
            "معاف کیجئے، ابھی نظام میں خرابی ہے۔ "
            "براہ کرم کچھ دیر بعد دوبارہ کوشش کریں۔"
        )

    await send_whatsapp_reply(chat_id, reply + DISCLAIMER + WEBAPP_FOOTER)


# ---------------------------------------------------------------------------
# Background task: process voice note → transcribe → triage → reply
# ---------------------------------------------------------------------------

async def process_audio_and_reply(chat_id: str, download_url: str) -> None:
    """
    Background task: download voice note, transcribe via Gemini,
    run through triage pipeline, reply via WhatsApp.
    """
    logger.info("WhatsApp audio pipeline start — chat_id=%s", chat_id)

    # Acknowledge receipt
    await send_whatsapp_reply(
        chat_id,
        "🎙️ آپ کی آواز موصول ہوئی — تجزیہ ہو رہا ہے، براہ کرم انتظار کریں..."
    )

    transcribed = await transcribe_voice_note(download_url)

    if not transcribed:
        await send_whatsapp_reply(
            chat_id,
            "معذرت، آواز واضح نہیں تھی۔ براہ کرم دوبارہ بولیں یا اردو میں لکھ کر بھیجیں۔"
        )
        return

    # Run through the same triage pipeline as text
    await process_and_reply(chat_id, transcribed)


# ---------------------------------------------------------------------------
# Background task: process location → hospital search → reply
# ---------------------------------------------------------------------------

async def process_location_and_reply(
    chat_id: str, latitude: float, longitude: float
) -> None:
    """
    Background task: search for nearby hospitals using the user's
    shared WhatsApp location and reply with results.
    """
    logger.info(
        "WhatsApp location pipeline — chat_id=%s, lat=%.4f, lng=%.4f",
        chat_id, latitude, longitude,
    )

    try:
        from tools.places_search import places_search

        hospitals = await places_search(latitude, longitude)

        if not hospitals:
            await send_whatsapp_reply(
                chat_id,
                "معذرت، آپ کے قریب کوئی ہسپتال نہیں مل سکا۔"
                + DISCLAIMER
            )
            return

        # Format hospital list for WhatsApp
        lines = ["🏥 *آپ کے قریبی ہسپتال:*\n"]
        for i, h in enumerate(hospitals, 1):
            name = h.get("name", "Unknown")
            address = h.get("address", "")
            lat = h.get("lat", 0)
            lng = h.get("lng", 0)
            maps_link = f"https://www.google.com/maps/search/?api=1&query={lat},{lng}"
            lines.append(f"{i}. *{name}*")
            if address:
                lines.append(f"   📍 {address}")
            lines.append(f"   🗺️ {maps_link}\n")

        reply = "\n".join(lines)
        await send_whatsapp_reply(chat_id, reply + DISCLAIMER)

    except Exception as exc:
        logger.error("WhatsApp location pipeline error for %s: %s", chat_id, exc)
        await send_whatsapp_reply(
            chat_id,
            "معذرت، ہسپتال تلاش کرنے میں مسئلہ ہوا۔ براہ کرم دوبارہ کوشش کریں۔"
            + DISCLAIMER
        )

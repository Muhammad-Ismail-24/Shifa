"""
WhatsApp integration via GreenAPI.

Handles:
  - Text messages (textMessage / extendedTextMessage)
  - Voice notes (audioMessage) — transcribed via the centralized model router
  - Location sharing (locationMessage) — nearest hospital lookup
  - Sending text replies back via GreenAPI sendMessage
  - Background tasks for AI pipeline processing
"""

import asyncio
import httpx
import json
import os
import tempfile

from config.settings import settings
from utils.logger import logger
from utils.ai_client import generate_with_retry
from utils.model_router import ModelRouter, Phase

GREENAPI_SEND_URL = (
    "https://api.green-api.com/waInstance{id}/sendMessage/{token}"
)

# sendFileByUpload: one multipart POST that both uploads the file and
# dispatches it to the chat as a media message.
GREENAPI_SEND_FILE_URL = (
    "https://api.green-api.com/waInstance{id}/sendFileByUpload/{token}"
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


async def send_whatsapp_audio(chat_id: str, audio_bytes: bytes) -> None:
    """
    Send an .mp3 voice reply via GreenAPI sendFileByUpload.

    The file must exist on disk for httpx to stream it as multipart form
    data; the temp file is deleted afterwards whether the send succeeded
    or not.
    """
    url = GREENAPI_SEND_FILE_URL.format(
        id=settings.GREENAPI_ID_INSTANCE,
        token=settings.GREENAPI_API_TOKEN,
    )

    fd, tmp_path = tempfile.mkstemp(suffix=".mp3")
    try:
        with os.fdopen(fd, "wb") as fh:
            fh.write(audio_bytes)

        async with httpx.AsyncClient(timeout=90.0) as client:
            with open(tmp_path, "rb") as fh:
                resp = await client.post(
                    url,
                    data={"chatId": chat_id, "fileName": "shifa_reply.mp3"},
                    files={"file": ("shifa_reply.mp3", fh, "audio/mpeg")},
                )
            resp.raise_for_status()
            logger.info("WhatsApp audio sent to %s (status %d)", chat_id, resp.status_code)
    except Exception as exc:
        logger.error("Failed to send WhatsApp audio to %s: %s", chat_id, exc)
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            # Already gone or never created — nothing to clean up.
            pass


# ---------------------------------------------------------------------------
# Voice note → text transcription via the centralized model router
# ---------------------------------------------------------------------------

# Strict dictation prompt: original language (Urdu or English), no filler.
VOICE_TRANSCRIPTION_PROMPT = (
    "You are a medical transcription assistant in Pakistan. "
    "Transcribe the attached audio exactly as spoken, in the original language "
    "(Urdu or English). Output ONLY the transcription — no greetings, no "
    "commentary, no conversational filler."
)


async def transcribe_voice_note(download_url: str) -> str:
    """
    Download a WhatsApp voice note (.ogg) and transcribe it through the
    centralized model router (Phase.TRANSCRIPTION).

    Returns the transcribed text, or "" if the download or transcription
    fails.
    """
    try:
        # Step 1: Download the audio file
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.get(download_url)
            resp.raise_for_status()
            audio_bytes = resp.content

        logger.info("Voice note downloaded — %d bytes", len(audio_bytes))

        # Step 2: Transcribe via the centralized router — audio-capable
        # flash models, fallback chain.  No artificial timeout: audio
        # transcription legitimately takes 20-45 s with model fallback,
        # and generate_with_retry already handles retries and model
        # pivoting internally.  The SDK's own connection lifespan is the
        # ultimate safety net.
        models = ModelRouter.route(Phase.TRANSCRIPTION)
        logger.info("Transcribing voice note via routed models: %s", ", ".join(models))

        transcribed = await generate_with_retry(
            prompt=VOICE_TRANSCRIPTION_PROMPT,
            media_data=[{"mime_type": "audio/ogg", "data": audio_bytes}],
            phase=Phase.TRANSCRIPTION,
        )

        text = transcribed.strip()
        logger.info("Voice note transcribed — len=%d", len(text))
        return text

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

    The reply goes out as audio + text. Triage questions and emergency
    directives are dictated verbatim; after a diagnosis only the short
    empathetic voice_summary is dictated — the long clinical payload is
    text-only by design.
    """
    logger.info("WhatsApp pipeline start — chat_id=%s, text_len=%d", chat_id, len(text))

    text_to_speak: str | None = None

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
            # A triage question is spoken exactly as asked.
            text_to_speak = reply
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
            if result.get("is_emergency"):
                # An emergency directive must be dictated exactly as written.
                text_to_speak = reply
            else:
                # Diagnosis: dictate only the short summary — never the
                # medicines/hospitals detail that follows as text.
                text_to_speak = result.get("voice_summary") or reply

    except Exception as exc:
        logger.error("WhatsApp pipeline error for %s: %s", chat_id, exc)
        reply = (
            "معاف کیجئے، ابھی نظام میں خرابی ہے۔ "
            "براہ کرم کچھ دیر بعد دوبارہ کوشش کریں۔"
        )
        text_to_speak = reply

    # Audio first so the voice note and the text land together. TTS is strictly
    # optional: a missing ELEVENLABS_API_KEY or a failed upload must never cost
    # the patient the text message.
    try:
        from utils.tts import generate_speech

        audio_bytes = await generate_speech(text_to_speak)
        await send_whatsapp_audio(chat_id, audio_bytes)
    except Exception as exc:
        logger.error(
            "WhatsApp TTS failed for %s — sending text only: %s",
            chat_id, exc,
        )

    await send_whatsapp_reply(chat_id, reply + DISCLAIMER + WEBAPP_FOOTER)


# ---------------------------------------------------------------------------
# Background task: process voice note → transcribe → triage → reply
# ---------------------------------------------------------------------------

async def process_audio_and_reply(chat_id: str, download_url: str) -> None:
    """
    Background task: download voice note, transcribe via the model router,
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
            "معذرت، میں آپ کی وائس نوٹ پر کارروائی نہیں کر سکا۔ "
            "براہ کرم اپنی علامات ٹائپ کر کے بھیجیں۔"
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

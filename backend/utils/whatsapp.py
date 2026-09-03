"""
WhatsApp integration via GreenAPI.

Handles:
  - Parsing incoming webhook payloads from GreenAPI.
  - Sending text replies back to the user via GreenAPI sendMessage.
  - Background task that runs the AI pipeline and sends the response.
"""

import httpx

from config.settings import settings
from utils.logger import logger


GREENAPI_SEND_URL = (
    "https://api.green-api.com/waInstance{id}/sendMessage/{token}"
)


def parse_incoming_message(payload: dict) -> tuple[str, str] | None:
    """
    Extract (chat_id, text) from a GreenAPI webhook payload.

    Returns None if the payload is not a usable text message
    (e.g. status updates, media messages, outgoing echoes).
    """
    # Only process incoming text messages
    type_webhook = payload.get("typeWebhook")
    if type_webhook != "incomingMessageReceived":
        return None

    sender_data = payload.get("senderData", {})
    chat_id = sender_data.get("chatId", "")

    message_data = payload.get("messageData", {})
    text_message_data = message_data.get("textMessageData")
    if not text_message_data:
        # Not a text message (could be image, video, etc.) — skip
        return None

    text = text_message_data.get("textMessage", "").strip()
    if not text or not chat_id:
        return None

    return chat_id, text


async def send_whatsapp_reply(chat_id: str, message: str) -> None:
    """
    Send a text message back to the user via GreenAPI sendMessage endpoint.
    """
    url = GREENAPI_SEND_URL.format(
        id=settings.GREENAPI_ID_INSTANCE,
        token=settings.GREENAPI_API_TOKEN,
    )

    body = {
        "chatId": chat_id,
        "message": message,
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, json=body)
            resp.raise_for_status()
            logger.info(
                "WhatsApp reply sent to %s (status %d)", chat_id, resp.status_code
            )
    except Exception as exc:
        logger.error("Failed to send WhatsApp reply to %s: %s", chat_id, exc)


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
            # Step 2: Full pipeline (no GPS for WhatsApp — use Islamabad defaults)
            result = await run_pipeline(
                urdu_text=text,
                latitude=33.6844,   # Islamabad default
                longitude=73.0479,  # Islamabad default
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

    # Add safety disclaimer to every reply
    disclaimer = "\n\n⚠️ یہ صرف عمومی معلومات ہے — ڈاکٹر سے ضرور ملیں۔"
    await send_whatsapp_reply(chat_id, reply + disclaimer)


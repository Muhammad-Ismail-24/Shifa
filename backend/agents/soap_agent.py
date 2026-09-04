"""
SOAP Note Generator — produces a compact English clinical handoff note
from triage session data using Gemini.

Used by: orchestrator.py (after pipeline completion, before returning response)
"""

import json
import google.generativeai as genai

from config.settings import settings
from utils.logger import logger
from utils.ai_client import generate_with_retry

genai.configure(api_key=settings.GEMINI_API_KEY)

SOAP_PROMPT = """\
You are a clinical documentation assistant. Given the following triage session \
data from a healthcare AI assistant in Pakistan, produce a compact SOAP note \
in English suitable for a doctor to quickly review.

Format the note EXACTLY as plain text (no markdown, no bullet points, no JSON):

S (Subjective):
[Patient-reported symptoms and history in 2-3 sentences]

O (Objective):
[Extracted clinical observations or vital indicators. If none available, write "No objective vitals recorded — AI triage only."]

A (Assessment):
[Top probable conditions with confidence levels]

P (Plan):
[Recommended OTC relief, emergency indicators, and suggested medical specialty to consult]

Keep the entire note under 500 characters so it fits inside a QR code.
Respond ONLY with the plain-text SOAP note — nothing else.
"""


async def generate_soap_note(
    diseases: list,
    medicines: list | dict,
    symptoms: list | None = None,
    original_text: str = "",
) -> str | None:
    """
    Generate a compact English SOAP note from triage session data.

    Returns the plain-text SOAP note, or None if generation fails.
    """
    try:
        session_data = {
            "patient_complaint_urdu": original_text,
            "extracted_symptoms": symptoms or [],
            "identified_diseases": diseases,
            "recommended_medicines": (
                medicines if isinstance(medicines, list)
                else medicines.get("medicines", []) if isinstance(medicines, dict)
                else []
            ),
        }

        prompt_text = f"{SOAP_PROMPT}\n\nTriage Session Data:\n{json.dumps(session_data, ensure_ascii=False, indent=2)}"
        response_text = await generate_with_retry(prompt=prompt_text)

        soap_text = response_text.strip()

        # Truncate to 500 chars if needed (QR code limit for reliable scanning)
        if len(soap_text) > 500:
            soap_text = soap_text[:497] + "..."

        logger.info("SOAP note generated (%d chars)", len(soap_text))
        return soap_text

    except Exception as exc:
        logger.error("SOAP note generation failed: %s", exc)
        return None


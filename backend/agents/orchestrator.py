# Main pipeline: triage → extract → RAG → tools → compose

import asyncio
import json
import re
import unicodedata
from config.prompts import EMERGENCY_KEYWORDS
from config.settings import settings
from agents.triage_agent import evaluate_triage
from agents.symptom_extractor import extract_symptoms
from agents.disease_identifier import identify_diseases
from agents.response_composer import compose_response
from utils.logger import logger

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DISCLAIMER_URDU = (
    "یہ صرف عمومی معلومات ہے۔ یہ ایپ ڈاکٹر کا متبادل نہیں۔ ڈاکٹر سے ضرور ملیں۔"
)

CLARIFICATION_DISCLAIMER = (
    "براہ کرم اپنی علامات کے بارے میں مزید بتائیں۔"
)

EMERGENCY_RESPONSE_URDU = "فوری طور پر ہسپتال جائیں"


# ---------------------------------------------------------------------------
# Urdu normalization — standardize characters before any matching
# ---------------------------------------------------------------------------

# Map Arabic-form characters to their standard Urdu equivalents
_CHAR_MAP = str.maketrans({
    "\u064A": "\u06CC",   # Arabic yaa  ي → Urdu yaa  ی
    "\u0643": "\u06A9",   # Arabic kaf  ك → Urdu kaf  ک
    "\u0647": "\u06C1",   # Arabic haa  ه → Urdu gol-haa ہ  (context-dependent)
    "\u06BE": "\u06C1",   # do-chashmee haa ھ → Urdu haa ہ
})


def normalize_urdu(text: str) -> str:
    """
    Normalize Urdu text for reliable keyword matching.

    1. Unicode NFC normalization
    2. Strip zero-width non-joiners (U+200C) and zero-width joiners (U+200D)
    3. Map common Arabic character variants to standard Urdu forms
    4. Collapse runs of whitespace into a single space
    """
    # NFC canonical composition
    text = unicodedata.normalize("NFC", text)

    # Remove zero-width characters that break substring matching
    text = text.replace("\u200C", "")   # ZWNJ
    text = text.replace("\u200D", "")   # ZWJ

    # Standardize Arabic ↔ Urdu character variants
    text = text.translate(_CHAR_MAP)

    # Collapse whitespace
    text = re.sub(r"\s+", " ", text).strip()

    return text


# ---------------------------------------------------------------------------
# Helper — emergency keyword check
# ---------------------------------------------------------------------------

# The keyword list in config/prompts.py is written in natural Urdu spelling,
# but run_pipeline() normalizes the patient's text before matching. Both sides
# must go through the same transform or keywords containing ھ / ي / ك can never
# match. Normalized once at import — the list is static.
_NORMALIZED_EMERGENCY_KEYWORDS = [normalize_urdu(k).lower() for k in EMERGENCY_KEYWORDS]


def _is_emergency(text: str) -> bool:
    """Return True if the patient's input contains any emergency keyword."""
    text_lower = normalize_urdu(text).lower()
    for keyword in _NORMALIZED_EMERGENCY_KEYWORDS:
        if keyword in text_lower:
            return True
    return False


# ---------------------------------------------------------------------------
# Main pipeline — called by Sufiyan's main.py
# ---------------------------------------------------------------------------

async def run_pipeline(
    urdu_text: str,
    latitude: float,
    longitude: float,
    history: list[dict],
) -> dict:
    """
    Run the full Shifa AI pipeline.

    Steps:
        0. Normalize Urdu input → emergency keyword check
        1. Triage Agent → proceed or ask clarifying question
        1b. Fire places_search concurrently in the background
        2. Symptom extraction from Urdu text
        3. Disease identification via symptoms + RAG
        4. Medicine lookup (Sufiyan's tool)
        5. Await hospital search + compose response

    Args:
        urdu_text:  Raw Urdu text from the patient (STT output).
        latitude:   Patient GPS latitude.
        longitude:  Patient GPS longitude.
        history:    Conversation history — list of {role, content} dicts.
                    Empty list on the first turn.

    Returns:
        dict matching Sufiyan's Pydantic response model:
        {
            "diseases":            list[dict],
            "medicines":           list,
            "hospitals":           list,
            "response_text_urdu":  str,
            "is_emergency":        bool,
            "disclaimer_urdu":     str,
        }
    """

    # ------------------------------------------------------------------
    # Step 0: Normalize Urdu + emergency check
    # ------------------------------------------------------------------
    urdu_text = normalize_urdu(urdu_text)

    if _is_emergency(urdu_text):
        logger.warning("EMERGENCY keyword detected — short-circuiting pipeline.")

        # Try to find nearby hospitals even in emergency
        hospitals = []
        try:
            from tools.places_search import places_search
            hospitals = await places_search(latitude, longitude)
        except Exception as e:
            logger.error(f"Hospital search failed during emergency: {e}")

        return {
            "diseases": [],
            "medicines": [],
            "hospitals": hospitals,
            "response_text_urdu": EMERGENCY_RESPONSE_URDU,
            "is_emergency": True,
            "disclaimer_urdu": DISCLAIMER_URDU,
        }

    # ------------------------------------------------------------------
    # Step 1: Triage — do we have enough context to diagnose?
    # ------------------------------------------------------------------
    logger.info("Running triage evaluation...")
    try:
        triage = await evaluate_triage(latest_input=urdu_text, history=history)
    except Exception as e:
        logger.error(f"Triage evaluation failed: {e}")
        # Default to proceed if triage fails — better to attempt diagnosis
        triage = {"status": "proceed"}

    if triage.get("status") == "clarification_needed":
        logger.info("Triage: clarification needed — returning question.")
        return {
            "diseases": [],
            "medicines": [],
            "hospitals": [],
            "response_text_urdu": triage.get(
                "question_urdu",
                "آپ کی تکلیف کے بارے میں مزید بتائیں۔",
            ),
            "is_emergency": False,
            "disclaimer_urdu": CLARIFICATION_DISCLAIMER,
        }

    # ------------------------------------------------------------------
    # Step 1b: Fire hospital search in the background immediately
    #          (runs concurrently while we do Steps 2–4)
    # ------------------------------------------------------------------
    hospital_task: asyncio.Task | None = None
    try:
        from tools.places_search import places_search

        async def _fetch_hospitals() -> list:
            return await places_search(latitude, longitude)

        hospital_task = asyncio.create_task(_fetch_hospitals())
        logger.info("Hospital search launched in background.")
    except Exception as e:
        logger.error(f"Could not launch hospital search: {e}")

    # ------------------------------------------------------------------
    # Step 2: Extract symptoms from Urdu text
    # ------------------------------------------------------------------
    logger.info("Extracting symptoms...")
    try:
        symptoms = await extract_symptoms(urdu_text)
    except Exception as e:
        logger.error(f"Symptom extraction failed: {e}")
        symptoms = []

    if not symptoms:
        logger.warning("No symptoms extracted — asking for clarification.")
        # Cancel the background hospital task — we don't need it
        if hospital_task and not hospital_task.done():
            hospital_task.cancel()
        return {
            "diseases": [],
            "medicines": [],
            "hospitals": [],
            "response_text_urdu": (
                "معذرت، آپ کی بات واضح نہیں ہوئی۔ "
                "اپنی تکلیف کے بارے میں مزید بتائیں۔"
            ),
            "is_emergency": False,
            "disclaimer_urdu": CLARIFICATION_DISCLAIMER,
        }

    # ------------------------------------------------------------------
    # Step 3: Identify diseases from symptoms + RAG context
    # ------------------------------------------------------------------
    logger.info(f"Identifying diseases for symptoms: {symptoms}")
    try:
        diseases = await identify_diseases(symptoms)
    except Exception as e:
        logger.error(f"Disease identification failed: {e}")
        diseases = []

    # ------------------------------------------------------------------
    # Step 4: Medicine lookup (Sufiyan's tool — synchronous)
    # ------------------------------------------------------------------
    logger.info("Looking up medicines...")
    medicines_data = {}
    try:
        from tools.medicine_lookup import medicine_lookup
        top_disease = diseases[0]["disease"] if diseases else "Unknown"
        medicines_data = medicine_lookup(top_disease)
    except Exception as e:
        logger.error(f"Medicine lookup failed: {e}")
        medicines_data = {"medicines": [], "disclaimer_urdu": DISCLAIMER_URDU}

    # ------------------------------------------------------------------
    # Step 5: Await the background hospital search
    # ------------------------------------------------------------------
    hospitals = []
    if hospital_task is not None:
        try:
            hospitals = await hospital_task
            logger.info(f"Hospital search returned {len(hospitals)} results.")
        except Exception as e:
            logger.error(f"Hospital search failed: {e}")

    # ------------------------------------------------------------------
    # Step 6: Compose final Urdu response
    # ------------------------------------------------------------------
    logger.info("Composing final Urdu response...")
    try:
        response_text = await compose_response(diseases, medicines_data, hospitals)
    except Exception as e:
        logger.error(f"Response composition failed: {e}")
        response_text = (
            "آپ کی علامات سے بیماری کا اندازہ لگایا گیا ہے۔ "
            "براہ کرم جلد ڈاکٹر سے ملیں۔ "
            "یہ صرف عمومی معلومات ہے — ڈاکٹر سے ضرور ملیں۔"
        )

    # ------------------------------------------------------------------
    # Return final structured response
    # ------------------------------------------------------------------
    logger.info("Pipeline complete — returning response.")
    return {
        "diseases": diseases,
        "medicines": (
            medicines_data.get("medicines", [])
            if isinstance(medicines_data, dict) else []
        ),
        "hospitals": hospitals,
        "response_text_urdu": response_text,
        "is_emergency": False,
        "disclaimer_urdu": (
            medicines_data.get("disclaimer_urdu", DISCLAIMER_URDU)
            if isinstance(medicines_data, dict) else DISCLAIMER_URDU
        ),
    }

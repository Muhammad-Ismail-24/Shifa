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
# Phase B — the slow lookups, run in parallel off the critical path
# ---------------------------------------------------------------------------

async def run_phase_b(
    top_disease: str,
    latitude: float,
    longitude: float,
) -> dict:
    """
    Fetch medicines and nearby hospitals concurrently.

    Split out of the main pipeline so the patient hears Shifa's answer as soon
    as the diagnosis is ready instead of waiting on a Places round-trip.

    FAILURE ISOLATION IS THE POINT OF THIS FUNCTION. The two lookups are
    independent, and one failing must never cost the patient the other. Each
    runs inside its own try/except, `gather(return_exceptions=True)` catches
    anything that still escapes (a BaseException-adjacent error, an import
    failure), and the outcome of each is reported separately rather than
    flattened into an empty list.

    That distinction matters clinically: an empty medicine list means "nothing
    to suggest for this condition", while a failed lookup means "we do not
    know". Showing the second as the first tells a patient there is no
    treatment when in fact a lookup timed out.

    Returns:
        {
            "medicines":        list,
            "hospitals":        list,
            "disclaimer_urdu":  str,
            "medicines_status": "ok" | "failed",
            "hospitals_status": "ok" | "failed",
        }
    """

    async def _medicines() -> dict:
        from tools.medicine_lookup import medicine_lookup

        # medicine_lookup is synchronous; off-thread so it cannot block the
        # event loop while places_search is in flight.
        return await asyncio.to_thread(medicine_lookup, top_disease)

    async def _hospitals() -> list:
        from tools.places_search import places_search

        return await places_search(latitude, longitude)

    # return_exceptions=True: without it, the first lookup to raise cancels the
    # gather and the other lookup's result is thrown away even though it
    # succeeded. That is exactly the failure this function must not have.
    medicines_raw, hospitals_raw = await asyncio.gather(
        _medicines(), _hospitals(), return_exceptions=True
    )

    # ---- medicines ----
    medicines: list = []
    disclaimer = DISCLAIMER_URDU
    medicines_status = "ok"

    if isinstance(medicines_raw, BaseException):
        logger.error(
            "Phase B: medicine lookup failed for %r — %r",
            top_disease, medicines_raw, exc_info=medicines_raw,
        )
        medicines_status = "failed"
    elif isinstance(medicines_raw, dict):
        found = medicines_raw.get("medicines", [])
        medicines = found if isinstance(found, list) else []
        disclaimer = medicines_raw.get("disclaimer_urdu") or DISCLAIMER_URDU
    else:
        # The tool broke its own contract. Treated as a failure, not as "none":
        # we genuinely do not know what it would have returned.
        logger.error(
            "Phase B: medicine lookup returned %s, expected dict — treating as failed.",
            type(medicines_raw).__name__,
        )
        medicines_status = "failed"

    # ---- hospitals ----
    hospitals: list = []
    hospitals_status = "ok"

    if isinstance(hospitals_raw, BaseException):
        logger.error(
            "Phase B: hospital search failed at (%s, %s) — %r",
            latitude, longitude, hospitals_raw, exc_info=hospitals_raw,
        )
        hospitals_status = "failed"
    elif isinstance(hospitals_raw, list):
        hospitals = hospitals_raw
    else:
        logger.error(
            "Phase B: hospital search returned %s, expected list — treating as failed.",
            type(hospitals_raw).__name__,
        )
        hospitals_status = "failed"

    logger.info(
        "Phase B complete — medicines: %s (%d), hospitals: %s (%d).",
        medicines_status, len(medicines), hospitals_status, len(hospitals),
    )

    return {
        "medicines": medicines,
        "hospitals": hospitals,
        "disclaimer_urdu": disclaimer,
        "medicines_status": medicines_status,
        "hospitals_status": hospitals_status,
    }


# ---------------------------------------------------------------------------
# Phase A — everything the patient hears, and nothing else
# ---------------------------------------------------------------------------

async def run_pipeline_phase_a(
    urdu_text: str,
    latitude: float,
    longitude: float,
    history: list[dict],
) -> dict:
    """
    Run the conversational half of the Shifa pipeline.

    Steps:
        0. Normalize Urdu input → emergency keyword check
        1. Symptom extraction (triage already ran in main.py)
        2. Disease identification via symptoms + RAG
        3. Compose the Urdu response text

    Medicines and hospitals are deliberately NOT fetched here — they are the two
    slowest calls in the pipeline and the patient does not need to wait on them
    to hear an answer. The caller starts run_phase_b() as a background task and
    serves it from GET /results/{session_id}.

    Args:
        urdu_text:  Raw Urdu text from the patient (STT output).
        latitude:   Patient GPS latitude.
        longitude:  Patient GPS longitude.
        history:    Conversation history — list of {role, content} dicts.
                    Empty list on the first turn.

    Returns:
        {
            "diseases":            list[dict],
            "medicines":           [],      # always empty in Phase A
            "hospitals":           [],      # always empty in Phase A
            "response_text_urdu":  str,
            "is_emergency":        bool,
            "disclaimer_urdu":     str,
            "needs_phase_b":       bool,    # internal: should the caller run Phase B?
            "top_disease":         str,     # internal: Phase B input
        }
    """

    # ------------------------------------------------------------------
    # Step 0: Normalize Urdu + emergency check
    # ------------------------------------------------------------------
    urdu_text = normalize_urdu(urdu_text)

    if _is_emergency(urdu_text):
        logger.warning("EMERGENCY keyword detected — short-circuiting pipeline.")
        return {
            "diseases": [],
            "medicines": [],
            "hospitals": [],
            "response_text_urdu": EMERGENCY_RESPONSE_URDU,
            "is_emergency": True,
            "disclaimer_urdu": DISCLAIMER_URDU,
            "needs_phase_b": False,
            "top_disease": "",
        }

    # ------------------------------------------------------------------
    # Step 1: Extract symptoms from Urdu text
    # ------------------------------------------------------------------
    logger.info("Extracting symptoms...")
    try:
        symptoms = await extract_symptoms(urdu_text)
    except Exception as e:
        logger.error(f"Symptom extraction failed: {e}")
        symptoms = []

    if not symptoms:
        logger.warning("No symptoms extracted — asking for clarification.")
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
            "needs_phase_b": False,
            "top_disease": "",
        }

    # ------------------------------------------------------------------
    # Step 2: Identify diseases from symptoms + RAG context
    # ------------------------------------------------------------------
    logger.info(f"Identifying diseases for symptoms: {symptoms}")
    try:
        diseases = await identify_diseases(symptoms)
    except Exception as e:
        logger.error(f"Disease identification failed: {e}")
        diseases = []

    # ------------------------------------------------------------------
    # Step 3: Compose the Urdu response
    #
    # Composed from the diagnosis alone. The medicine and hospital detail lands
    # in the results panel a moment later; repeating it in the spoken reply
    # would mean holding the reply back until both lookups returned, which is
    # the latency this split exists to remove.
    # ------------------------------------------------------------------
    logger.info("Composing Urdu response (Phase A)...")
    try:
        response_text = await compose_response(diseases, {"medicines": []}, [])
    except Exception as e:
        logger.error(f"Response composition failed: {e}")
        response_text = (
            "آپ کی علامات سے بیماری کا اندازہ لگایا گیا ہے۔ "
            "براہ کرم جلد ڈاکٹر سے ملیں۔ "
            "یہ صرف عمومی معلومات ہے — ڈاکٹر سے ضرور ملیں۔"
        )

    logger.info("Phase A complete — returning conversational response.")
    return {
        "diseases": diseases,
        "medicines": [],
        "hospitals": [],
        "response_text_urdu": response_text,
        "is_emergency": False,
        "disclaimer_urdu": DISCLAIMER_URDU,
        "needs_phase_b": bool(diseases),
        "top_disease": diseases[0]["disease"] if diseases else "Unknown",
    }


# ---------------------------------------------------------------------------
# SOAP note generation — called after Phase B completes (full data available)
# ---------------------------------------------------------------------------

async def _generate_soap_note_safe(
    diseases: list,
    medicines: list | dict,
    symptoms: list | None = None,
    original_text: str = "",
) -> str | None:
    """
    Generate a compact English SOAP note for clinical handoff.

    Wrapped in a try/except so SOAP note failure never breaks the pipeline.
    """
    try:
        from agents.soap_agent import generate_soap_note

        return await generate_soap_note(
            diseases=diseases,
            medicines=medicines,
            symptoms=symptoms,
            original_text=original_text,
        )
    except Exception as e:
        logger.error(f"SOAP note generation failed: {e}")
        return None


# ---------------------------------------------------------------------------
# Single-shot pipeline — Phase A + Phase B awaited together
# ---------------------------------------------------------------------------

async def run_pipeline(
    urdu_text: str,
    latitude: float,
    longitude: float,
    history: list[dict],
) -> dict:
    """
    Run the whole pipeline and wait for everything.

    Kept for callers that want one blocking call with the complete result — the
    original documented contract. The HTTP path uses the two-phase split
    instead; see run_pipeline_phase_a() and run_phase_b().

    Also generates a SOAP note for clinical handoff once the full data is
    available (diseases + medicines). The two-phase HTTP path generates the
    SOAP note via a separate enrichment mechanism.
    """
    result = await run_pipeline_phase_a(urdu_text, latitude, longitude, history)

    # Keys that exist only to hand Phase A's decision to the HTTP layer, plus
    # the per-lookup status flags that belong to the two-phase contract. This
    # wrapper's return shape is the original single-shot one and must not grow
    # fields callers were never told about.
    internal = {"needs_phase_b", "top_disease", "medicines_status", "hospitals_status"}

    if result.get("needs_phase_b"):
        phase_b = await run_phase_b(result["top_disease"], latitude, longitude)
        result = {**result, **phase_b}

        # Generate SOAP note concurrently is not possible here since Phase B
        # already completed, but we can generate it now with full data.
        soap_note = await _generate_soap_note_safe(
            diseases=result.get("diseases", []),
            medicines=result.get("medicines", []),
            original_text=urdu_text,
        )
        result["soap_note_english"] = soap_note
    elif result.get("is_emergency"):
        # An emergency still deserves the nearest hospital, even though the
        # spoken reply does not wait for it. Medicines are deliberately NOT
        # merged: suggesting a painkiller next to "go to hospital now" invites
        # the patient to treat the symptom instead of going.
        phase_b = await run_phase_b("Unknown", latitude, longitude)
        result = {**result, "hospitals": phase_b["hospitals"]}

    return {k: v for k, v in result.items() if k not in internal}


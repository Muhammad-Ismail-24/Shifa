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
from utils.ai_client import generate_with_retry
from utils.logger import logger
from utils.model_router import Phase

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
# Voice summary — what Phase B says out loud
#
# Dictated when the final results land (web dashboard + WhatsApp). Deliberately
# short: the long clinical detail (medicines, hospitals, SOAP) is for reading,
# never for dictation.
# ---------------------------------------------------------------------------

VOICE_SUMMARY_PROMPT = (
    "Based on this diagnosis: {diagnosis}, write a very brief, empathetic "
    "2-sentence summary in {language}. Say something like: "
    "'Please don't worry, based on your symptoms it looks like [Condition]. "
    "I have listed the medicines and nearby hospitals for you below.' "
    "Do not include markdown. Output ONLY the two sentences."
)

# Spoken when the LLM call fails or times out. A canned fallback is safer
# than dictating the full clinical payload.
VOICE_SUMMARY_FALLBACK_URDU = (
    "Ghabraen nahin. Aap ki alamaton ke mutabiq shifa ne ilaaj tayyar kar "
    "liya hai — neeche dawaein aur qareebi aspatal diye gaye hain."
)

VOICE_SUMMARY_FALLBACK_EN = (
    "Please don't worry. Based on your symptoms, I have prepared the "
    "medicines and nearby hospitals for you below."
)

# Arabic-script ranges — a rough but reliable "did the patient write Urdu"
# check. Roman-Urdu and English inputs both contain no such characters.
_URDU_SCRIPT_RE = re.compile(r"[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]")


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
    *,
    diseases: list | None = None,
    symptoms: list | None = None,
    original_text: str = "",
) -> dict:
    """
    Fetch medicines, nearby hospitals, SOAP note, and voice summary
    concurrently.

    Split out of the main pipeline so the patient hears Shifa's answer as soon
    as the diagnosis is ready instead of waiting on a Places round-trip.

    All four tasks — medicines, hospitals, SOAP note, and voice summary — are
    fired in a single asyncio.gather() after the diagnosis is available.
    FAILURE ISOLATION: each task runs inside its own try/except, and
    return_exceptions=True ensures one failing never cancels the others.

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
            "soap_note_english": str | None,
            "voice_summary":    str,   # short spoken summary, never None
        }
    """

    async def _medicines() -> dict:
        from tools.medicine_lookup import medicine_lookup

        # medicine_lookup is synchronous; off-thread so it cannot block the
        # event loop while other tasks are in flight.
        return await asyncio.to_thread(medicine_lookup, top_disease)

    async def _hospitals() -> list:
        from tools.places_search import places_search

        return await places_search(latitude, longitude)

    async def _soap_task():
        """Generate SOAP note if diseases are available; None otherwise."""
        if not diseases:
            return None
        return await _generate_soap_note_safe(
            diseases=diseases,
            medicines=[],
            symptoms=symptoms,
            original_text=original_text,
        )

    async def _voice_task():
        """Generate the short spoken summary."""
        return await _generate_voice_summary_safe(
            diagnosis=top_disease,
            original_text=original_text,
        )

    # Fire all four tasks concurrently — the diagnosis (top_disease) is the
    # only shared dependency and is already available from Phase A.
    medicines_raw, hospitals_raw, soap_note, voice_summary = await asyncio.gather(
        _medicines(), _hospitals(), _soap_task(), _voice_task(),
        return_exceptions=True,
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

    # ---- SOAP note (ran concurrently above; unwrap BaseException) ----
    if isinstance(soap_note, BaseException):
        logger.error(
            "Phase B: SOAP note generation failed — %r",
            soap_note, exc_info=soap_note,
        )
        soap_note = None

    # ---- Voice summary (ran concurrently above; unwrap BaseException) ----
    if isinstance(voice_summary, BaseException):
        logger.error(
            "Phase B: voice summary generation failed — %r",
            voice_summary, exc_info=voice_summary,
        )
        language = "Roman Urdu" if _URDU_SCRIPT_RE.search(original_text) else "English"
        voice_summary = (
            VOICE_SUMMARY_FALLBACK_URDU
            if language == "Roman Urdu"
            else VOICE_SUMMARY_FALLBACK_EN
        )

    return {
        "medicines": medicines,
        "hospitals": hospitals,
        "disclaimer_urdu": disclaimer,
        "medicines_status": medicines_status,
        "hospitals_status": hospitals_status,
        "soap_note_english": soap_note,
        "voice_summary": voice_summary,
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
        # Carried through to the session store so /results can persist to
        # medical_history when the user is authenticated.
        "symptoms": symptoms,
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


async def _generate_voice_summary_safe(
    diagnosis: str,
    original_text: str = "",
) -> str:
    """
    Generate the short empathetic summary that Phase B dictates.

    Never raises and never returns None: the pipeline result must always
    carry something safe to say out loud, because dictating the full clinical
    payload to a patient is exactly what this feature exists to prevent.
    """
    language = "Roman Urdu" if _URDU_SCRIPT_RE.search(original_text) else "English"
    prompt = VOICE_SUMMARY_PROMPT.format(diagnosis=diagnosis, language=language)

    try:
        summary = await generate_with_retry(
            prompt=prompt,
            phase=Phase.VOICE_SUMMARY,
        )
        summary = (summary or "").strip()
        if summary:
            return summary
    except Exception as exc:
        logger.error("Voice summary generation failed (%s) — using fallback.", exc)

    return (
        VOICE_SUMMARY_FALLBACK_URDU
        if language == "Roman Urdu"
        else VOICE_SUMMARY_FALLBACK_EN
    )


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
        # diseases + original_text go in so run_phase_b can generate both the
        # SOAP note and the spoken voice_summary itself — one LLM call each,
        # no duplicated work in this wrapper.
        phase_b = await run_phase_b(
            result["top_disease"],
            latitude,
            longitude,
            diseases=result.get("diseases", []),
            original_text=urdu_text,
        )
        result = {**result, **phase_b}
    elif result.get("is_emergency"):
        # An emergency still deserves the nearest hospital, even though the
        # spoken reply does not wait for it. Medicines are deliberately NOT
        # merged: suggesting a painkiller next to "go to hospital now" invites
        # the patient to treat the symptom instead of going.
        phase_b = await run_phase_b("Unknown", latitude, longitude)
        result = {**result, "hospitals": phase_b["hospitals"]}

    return {k: v for k, v in result.items() if k not in internal}


# Turn 2: Urdu text → symptoms list

import asyncio
import logging
from config.prompts import SYMPTOM_EXTRACTION_PROMPT
from utils.ai_client import generate_with_retry
from utils.model_router import Phase, sanitize_json, safe_json_parse
from rag.retriever import retrieve

logger = logging.getLogger(__name__)

# Truncated JSON means "we do not know". The orchestrator already turns an
# empty list into a gentle clarification question instead of a crash.
SYMPTOM_PARSE_FALLBACK: list = []

async def extract_symptoms(urdu_text: str) -> list[str]:
    """
    Extract structured English symptom names from raw Urdu patient text.

    Uses RAG glossary context to map colloquial Urdu → medical terms.

    Args:
        urdu_text: Raw Urdu text from the patient.

    Returns:
        List of English symptom strings, e.g. ["fever", "headache", "vomiting"]
    """
    # Get relevant glossary context from RAG.
    # retrieve() is synchronous (blocking embedding + Qdrant HTTP calls),
    # so offload it to a worker thread — Render's single-CPU event loop
    # must never stall while other requests wait.
    try:
        context_chunks = await asyncio.to_thread(retrieve, urdu_text, 5)
        context = "\n".join(context_chunks)
    except Exception as e:
        logger.warning(f"RAG retrieval failed, falling back to empty context: {e}")
        context = ""

    prompt = (
        f"{SYMPTOM_EXTRACTION_PROMPT}\n\n"
        f"Glossary context:\n{context}\n\n"
        f"Patient said:\n{urdu_text}"
    )

    raw_response = await generate_with_retry(
        prompt,
        phase=Phase.SYMPTOM_EXTRACTION,
    )
    parsed = safe_json_parse(sanitize_json(raw_response), SYMPTOM_PARSE_FALLBACK)
    if not isinstance(parsed, list):
        logger.warning(
            "Symptom extraction returned %s, expected list — using empty fallback.",
            type(parsed).__name__,
        )
        return []
    return parsed


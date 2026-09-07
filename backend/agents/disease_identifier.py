# Turn 3: symptoms + RAG chunks   → diseases

import asyncio
import logging
from config.prompts import DISEASE_IDENTIFICATION_PROMPT
from utils.ai_client import generate_with_retry
from utils.model_router import Phase, sanitize_json, safe_json_parse
from rag.retriever import retrieve

logger = logging.getLogger(__name__)

# An unparseable disease list means "we could not determine". The orchestrator
# already handles an empty list with a generic, safe Urdu response.
DISEASE_PARSE_FALLBACK: list = []

async def identify_diseases(symptoms: list[str]) -> list[dict]:
    """
    Identify the 2–3 most probable diseases given extracted symptoms.

    Uses RAG medical context and Pakistan-specific disease knowledge.

    Args:
        symptoms: List of English symptom strings.

    Returns:
        List of dicts: [{"disease": str, "confidence": str, "urdu": str}]
    """
    query = " ".join(symptoms)
    try:
        # retrieve() is synchronous (blocking embedding + Qdrant HTTP calls);
        # offload it so the event loop is never stalled.
        context_chunks = await asyncio.to_thread(retrieve, query, 5)
        context = "\n".join(context_chunks)
    except Exception as e:
        logger.warning(f"RAG retrieval failed, falling back to empty context: {e}")
        context = ""

    prompt = (
        f"{DISEASE_IDENTIFICATION_PROMPT}\n\n"
        f"Medical context:\n{context}\n\n"
        f"Symptoms: {symptoms}"
    )

    raw_response = await generate_with_retry(
        prompt,
        phase=Phase.DISEASE_IDENTIFICATION,
    )
    parsed = safe_json_parse(sanitize_json(raw_response), DISEASE_PARSE_FALLBACK)
    if not isinstance(parsed, list):
        logger.warning(
            "Disease identification returned %s, expected list — using empty fallback.",
            type(parsed).__name__,
        )
        return []
    return parsed


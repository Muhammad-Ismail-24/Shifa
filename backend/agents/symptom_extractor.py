# Turn 2: Urdu text → symptoms list

import json
import logging
from config.prompts import SYMPTOM_EXTRACTION_PROMPT
from utils.ai_client import generate_with_retry
from rag.retriever import retrieve

logger = logging.getLogger(__name__)

async def extract_symptoms(urdu_text: str) -> list[str]:
    """
    Extract structured English symptom names from raw Urdu patient text.

    Uses RAG glossary context to map colloquial Urdu → medical terms.

    Args:
        urdu_text: Raw Urdu text from the patient.

    Returns:
        List of English symptom strings, e.g. ["fever", "headache", "vomiting"]
    """
    # Get relevant glossary context from RAG
    try:
        context_chunks = retrieve(urdu_text, k=5)
        context = "\n".join(context_chunks)
    except Exception as e:
        logger.warning(f"RAG retrieval failed, falling back to empty context: {e}")
        context = ""

    prompt = (
        f"{SYMPTOM_EXTRACTION_PROMPT}\n\n"
        f"Glossary context:\n{context}\n\n"
        f"Patient said:\n{urdu_text}"
    )

    raw_response = await generate_with_retry(prompt)
    raw = raw_response.strip().removeprefix('```json').removesuffix('```').strip()
    return json.loads(raw)


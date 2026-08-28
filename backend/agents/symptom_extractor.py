# Turn 2: Urdu text → symptoms list

import json
from config.prompts import SYMPTOM_EXTRACTION_PROMPT
from utils.model_router import generate_content_with_fallback_async
from rag.retriever import retrieve


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
        import logging
        logging.getLogger(__name__).warning(f"RAG retrieval failed, falling back to empty context: {e}")
        context = ""

    prompt = (
        f"{SYMPTOM_EXTRACTION_PROMPT}\n\n"
        f"Glossary context:\n{context}\n\n"
        f"Patient said:\n{urdu_text}"
    )

    raw = await generate_content_with_fallback_async(
        prompt,
        generation_config={"response_mime_type": "application/json"}
    )
    return json.loads(raw)

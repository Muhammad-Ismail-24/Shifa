# Turn 2: Urdu text → symptoms list

import json
from config.prompts import SYMPTOM_EXTRACTION_PROMPT
from utils.llm_router import generate_json_with_fallback
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
    context_chunks = retrieve(urdu_text, k=5)
    context = "\n".join(context_chunks)

    prompt = (
        f"{SYMPTOM_EXTRACTION_PROMPT}\n\n"
        f"Glossary context:\n{context}\n\n"
        f"Patient said:\n{urdu_text}"
    )

    raw = await generate_json_with_fallback(prompt)
    return json.loads(raw)

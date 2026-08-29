# Turn 3: symptoms + RAG chunks → diseases

import json
from config.prompts import DISEASE_IDENTIFICATION_PROMPT
from utils.ai_client import generate_with_retry
from rag.retriever import retrieve

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
    context_chunks = retrieve(query, k=5)
    context = "\n".join(context_chunks)

    prompt = (
        f"{DISEASE_IDENTIFICATION_PROMPT}\n\n"
        f"Medical context:\n{context}\n\n"
        f"Symptoms: {symptoms}"
    )

    raw_response = await generate_with_retry(prompt)
    raw = raw_response.strip().removeprefix('```json').removesuffix('```').strip()
    return json.loads(raw)


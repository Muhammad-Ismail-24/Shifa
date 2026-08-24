# Gemini text-embedding-004 wrapper

import google.generativeai as genai
from config.settings import settings

genai.configure(api_key=settings.GEMINI_API_KEY)


def embed(text: str) -> list[float]:
    """Return a 768-dim vector embedding for the given text using Gemini."""
    result = genai.embed_content(
        model="models/text-embedding-004",
        content=text,
        task_type="retrieval_document",
    )
    return result["embedding"]


def embed_query(text: str) -> list[float]:
    """Return a 768-dim vector embedding optimised for retrieval queries."""
    result = genai.embed_content(
        model="models/text-embedding-004",
        content=text,
        task_type="retrieval_query",
    )
    return result["embedding"]

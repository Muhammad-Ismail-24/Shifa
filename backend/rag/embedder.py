# Gemini text-embedding wrapper

import google.generativeai as genai
from config.settings import settings
import logging

logger = logging.getLogger(__name__)

genai.configure(api_key=settings.GEMINI_API_KEY)


def embed(text: str) -> list[float]:
    """Return a 768-dim vector embedding for the given text using Gemini."""
    try:
        result = genai.embed_content(
            model="models/gemini-embedding-2",
            content=text,
            task_type="retrieval_document",
            output_dimensionality=768,
        )
        return result["embedding"]
    except Exception as e:
        logger.error(f"Embedding failed for document: {e}")
        raise


def embed_query(text: str) -> list[float]:
    """Return a 768-dim vector embedding optimised for retrieval queries."""
    try:
        result = genai.embed_content(
            model="models/gemini-embedding-2",
            content=text,
            task_type="retrieval_query",
            output_dimensionality=768,
        )
        return result["embedding"]
    except Exception as e:
        logger.error(f"Embedding failed for query: {e}")
        raise

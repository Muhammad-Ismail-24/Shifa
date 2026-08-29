# Gemini text-embedding wrapper

import time
from google import genai
from google.genai import types
from config.settings import settings
import logging

logger = logging.getLogger(__name__)

client = genai.Client(api_key=settings.GEMINI_API_KEY)


def embed(text: str) -> list[float]:
    """Return a 768-dim vector embedding for the given text using Gemini."""
    try:
        result = client.models.embed_content(
            model="gemini-embedding-2",
            contents=text,
            config=types.EmbedContentConfig(
                task_type="RETRIEVAL_DOCUMENT",
                output_dimensionality=768,
            )
        )
        return result.embeddings[0].values
    except Exception as e:
        logger.error(f"Embedding failed for document: {e}")
        raise


def embed_batch(texts: list[str]) -> list[list[float]]:
    """Return a list of 768-dim vector embeddings for the given texts."""
    for attempt in range(5):
        try:
            result = client.models.embed_content(
                model="gemini-embedding-2",
                contents=texts,
                config=types.EmbedContentConfig(
                    task_type="RETRIEVAL_DOCUMENT",
                    output_dimensionality=768,
                )
            )
            return [e.values for e in result.embeddings]
        except Exception as e:
            if "429" in str(e):
                logger.warning(f"Rate limit hit, waiting 30 seconds... (Attempt {attempt+1}/5)")
                time.sleep(30)
            else:
                logger.error(f"Batch embedding failed: {e}")
                raise
    raise RuntimeError("Failed to embed batch after multiple attempts due to rate limits.")


def embed_query(text: str) -> list[float]:
    """Return a 768-dim vector embedding optimised for retrieval queries."""
    try:
        result = client.models.embed_content(
            model="gemini-embedding-2",
            contents=text,
            config=types.EmbedContentConfig(
                task_type="RETRIEVAL_QUERY",
                output_dimensionality=768,
            )
        )
        return result.embeddings[0].values
    except Exception as e:
        logger.error(f"Embedding failed for query: {e}")
        raise

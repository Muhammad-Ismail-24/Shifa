import re
import google.generativeai as genai
from config.settings import settings
import logging

logger = logging.getLogger(__name__)

genai.configure(api_key=settings.GEMINI_API_KEY)

FALLBACK_MODELS = [
    "models/gemini-3.5-flash-lite",
    "models/gemini-3.1-flash-lite",
    "models/gemini-2.5-flash-lite",
    "models/gemini-3.7-flash",
    "models/gemini-3.6-flash",
]


def sanitize_json(raw: str) -> str:
    """
    Strip markdown code fences and surrounding whitespace from an LLM response
    so that ``json.loads()`` can parse it reliably.

    Handles all common patterns:
        ```json\n{...}\n```
        ```\n[...]\n```
        Bare JSON with leading/trailing whitespace
    """
    text = raw.strip()

    # Strip ```json ... ``` or ``` ... ``` fencing (greedy across newlines)
    text = re.sub(r"^```(?:json)?\s*\n?", "", text, count=1)
    text = re.sub(r"\n?```\s*$", "", text, count=1)

    return text.strip()


async def generate_content_with_fallback_async(prompt: str, **kwargs) -> str:
    """
    Generate content with a strict fallback sequence asynchronously.
    If a 429 Quota Exceeded error is encountered, it retries with the next model.
    """
    last_error = None
    for model_name in FALLBACK_MODELS:
        try:
            model = genai.GenerativeModel(model_name, **kwargs)
            response = await model.generate_content_async(prompt)
            return response.text
        except Exception as e:
            if "429" in str(e):
                logger.warning(f"Rate limit hit for model {model_name}, trying next model in fallback sequence...")
                last_error = e
                continue
            else:
                logger.error(f"Generation failed for model {model_name}: {e}")
                raise e

    logger.error("All fallback models failed due to rate limits.")
    raise last_error


async def generate_json_with_fallback_async(prompt: str) -> str:
    """
    Generate a JSON response with model fallback and output sanitization.

    Two layers of defense against malformed JSON:
      1. ``response_mime_type="application/json"`` forces the model to emit
         raw JSON (no markdown, no preamble).
      2. ``sanitize_json()`` strips any residual markdown fencing that some
         models may still emit despite the MIME constraint.

    Returns:
        A sanitized JSON string ready for ``json.loads()``.
    """
    raw = await generate_content_with_fallback_async(
        prompt,
        generation_config={"response_mime_type": "application/json"},
    )
    return sanitize_json(raw)


# Centralized async LLM router with multi-model fallback
#
# Every Gemini call in the pipeline goes through this single function.
# It enforces native JSON mode and automatically falls back through
# cheaper / less-loaded models when RPM limits are hit.

import google.generativeai as genai
from google.api_core.exceptions import ResourceExhausted
from config.settings import settings
from utils.logger import logger

genai.configure(api_key=settings.gemini_api_key)

# ---------------------------------------------------------------------------
# Fallback sequence: cheapest/fastest first → most capable last.
# If a model returns 429 ResourceExhausted we move to the next one.
# ---------------------------------------------------------------------------

FALLBACK_MODELS = [
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-3.5-flash",
    "gemini-3.1-flash",
    "gemini-1.5-flash",
]


async def generate_json_with_fallback(prompt: str) -> str:
    """
    Send a prompt to Gemini and return the raw JSON string response.

    - Uses ``response_mime_type: application/json`` so the model is
      forced to return valid JSON (no markdown fencing, no preamble).
    - Loops through FALLBACK_MODELS; on a 429 ResourceExhausted it
      logs a warning and tries the next model.
    - Raises RuntimeError if every model in the list is exhausted.

    Args:
        prompt: The fully-assembled prompt string (system + context + input).

    Returns:
        Raw JSON string from the model — ready for ``json.loads()``.
    """
    last_error: Exception | None = None

    for model_name in FALLBACK_MODELS:
        try:
            model = genai.GenerativeModel(
                model_name,
                generation_config={"response_mime_type": "application/json"},
            )
            response = await model.generate_content_async(prompt)
            logger.info(f"LLM response received from {model_name}")
            return response.text

        except ResourceExhausted as exc:
            logger.warning(
                f"Rate-limited on {model_name} (429 ResourceExhausted) "
                f"— falling back to next model."
            )
            last_error = exc
            continue

    raise RuntimeError(
        "All fallback models exhausted — could not generate a response. "
        f"Last error: {last_error}"
    )

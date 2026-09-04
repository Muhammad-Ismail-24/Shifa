import re
import asyncio
from google import genai
from google.genai import types
from config.settings import settings
import logging

logger = logging.getLogger(__name__)

# Initialize the new SDK client
client = genai.Client(api_key=settings.GEMINI_API_KEY)

FALLBACK_MODELS = [
    "gemini-3.1-flash-lite",   # 500 RPD, 15 RPM
    "gemini-3.5-flash-lite",   # 500 RPD, 15 RPM
    "gemini-3.5-flash",        # 20 RPD, 5 RPM
    "gemini-3.7-flash",        # 20 RPD, 5 RPM
    "gemini-2.5-flash-lite",   # 20 RPD, 10 RPM
]

def sanitize_json(raw: str) -> str:
    text = raw.strip()
    text = re.sub(r"^```(?:json)?\s*\n?", "", text, count=1)
    text = re.sub(r"\n?```\s*$", "", text, count=1)
    return text.strip()

async def generate_content_with_fallback_async(prompt: str, response_mime_type: str = None) -> str:
    last_error = None
    max_retries = 3
    retries = 0

    config = types.GenerateContentConfig(
        response_mime_type=response_mime_type
    ) if response_mime_type else None

    for model_name in FALLBACK_MODELS:
        try:
            # Add a 5.0-second timeout for the API call to prevent hanging
            response = await asyncio.wait_for(
                client.aio.models.generate_content(
                    model=model_name,
                    contents=prompt,
                    config=config
                ),
                timeout=5.0
            )
            return response.text
        except asyncio.TimeoutError as e:
            logger.warning(f"Timeout for model {model_name}, trying next model in fallback sequence...")
            last_error = e
            continue
        except Exception as e:
            if "429" in str(e):
                logger.warning(f"Rate limit hit for model {model_name}, trying next model in fallback sequence...")
                last_error = e
                continue
            else:
                logger.error(f"Generation failed for model {model_name}: {e}")
                last_error = e
                continue

    logger.error("Maximum retries reached across fallback sequence.")
    raise last_error

async def generate_json_with_fallback_async(prompt: str) -> str:
    raw = await generate_content_with_fallback_async(
        prompt,
        response_mime_type="application/json"
    )
    return sanitize_json(raw)


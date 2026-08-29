# Turn 6: all outputs → final Urdu response

import json
from config.prompts import RESPONSE_COMPOSER_PROMPT
from utils.ai_client import generate_with_retry

async def compose_response(
    diseases: list[dict],
    medicines: dict,
    hospitals: list[dict],
) -> str:
    """
    Compose the final Urdu response text for TTS playback.

    Args:
        diseases: List of disease dicts from disease_identifier.
        medicines: Medicine data dict from medicine_lookup tool.
        hospitals: List of hospital dicts from places_search tool.

    Returns:
        Complete Urdu response string ready for TTS.
    """
    nearest = hospitals[0] if hospitals else {
        "name": "not found",
        "distance_km": "unknown",
    }

    data_payload = json.dumps(
        {
            "diseases": diseases,
            "medicines": medicines,
            "nearest_hospital": nearest,
        },
        ensure_ascii=False,
    )

    prompt = f"{RESPONSE_COMPOSER_PROMPT}\n\nData:\n{data_payload}"

    raw_response = await generate_with_retry(prompt)
    raw = raw_response.strip().removeprefix('```json').removesuffix('```').strip()

    # Parse the JSON response to extract the Urdu text
    try:
        parsed = json.loads(raw)
        return parsed.get("response_urdu", raw)
    except (json.JSONDecodeError, AttributeError):
        # Fallback: return raw text if JSON parsing fails
        return raw


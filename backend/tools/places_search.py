"""
Gemini function-call tool — searches nearby hospitals via SerpAPI Google Maps.
"""

import httpx

from config.settings import settings
from utils.logger import logger

_SERPAPI_URL = "https://serpapi.com/search.json"


async def places_search(latitude: float, longitude: float) -> list[dict]:
    """
    Search for nearby hospitals using SerpAPI Google Maps engine.

    Args:
        latitude:  GPS latitude of the user's location.
        longitude: GPS longitude of the user's location.

    Returns:
        Up to 3 hospitals as {"name", "lat", "lng", "address", "distance_km"},
        or an empty list if the request fails.
    """
    params = {
        "engine": "google_maps",
        "q": "hospital OR clinic OR dispensary",
        "ll": f"@{latitude},{longitude},14z",
        "type": "search",
        "api_key": settings.SERPAPI_KEY,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(_SERPAPI_URL, params=params)
            response.raise_for_status()
            data = response.json()
            results = data.get("local_results", [])
            logger.info(
                "SerpAPI returned %d results for (%.4f, %.4f)",
                len(results),
                latitude,
                longitude,
            )
            
            parsed_results = []
            for place in results[:3]:
                parsed_results.append({
                    "name": place.get("title", ""),
                    "lat": place.get("gps_coordinates", {}).get("latitude", 0.0),
                    "lng": place.get("gps_coordinates", {}).get("longitude", 0.0),
                    "address": place.get("address", ""),
                    "distance_km": None
                })
            return parsed_results
    except httpx.HTTPStatusError as exc:
        logger.error("SerpAPI HTTP error: %s", exc)
        return []
    except httpx.RequestError as exc:
        logger.error("SerpAPI request failed: %s", exc)
        return []

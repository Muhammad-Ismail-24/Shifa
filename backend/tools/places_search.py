"""
Gemini function-call tool — searches nearby hospitals via Google Places API.
"""

import httpx

from config.settings import settings
from utils.logger import logger

_PLACES_NEARBY_URL = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"


async def places_search(latitude: float, longitude: float) -> list[dict]:
    """
    Search for nearby hospitals using the Google Places Nearby Search API.

    Args:
        latitude:  GPS latitude of the user's location.
        longitude: GPS longitude of the user's location.

    Returns:
        The JSON response from the Google Places API, or an error dict
        if the request fails.
    """
    params = {
        "location": f"{latitude},{longitude}",
        "radius": 5000,  # 5 km search radius
        "type": "hospital",
        "key": settings.GOOGLE_PLACES_API_KEY,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(_PLACES_NEARBY_URL, params=params)
            response.raise_for_status()
            data = response.json()
            results = data.get("results", [])
            logger.info(
                "Places API returned %d results for (%.4f, %.4f)",
                len(results),
                latitude,
                longitude,
            )
            
            parsed_results = []
            for place in results[:3]:
                parsed_results.append({
                    "name": place.get("name", ""),
                    "lat": place.get("geometry", {}).get("location", {}).get("lat", 0.0),
                    "lng": place.get("geometry", {}).get("location", {}).get("lng", 0.0),
                    "address": place.get("vicinity", ""),
                    "distance_km": None
                })
            return parsed_results
    except httpx.HTTPStatusError as exc:
        logger.error("Places API HTTP error: %s", exc)
        return []
    except httpx.RequestError as exc:
        logger.error("Places API request failed: %s", exc)
        return []

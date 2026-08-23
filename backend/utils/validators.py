"""
Input sanitisation and GPS bounds checks for the /analyze endpoint.
Latitude must be between 20.0 and 40.0 (Pakistan range).
Longitude must be between 60.0 and 80.0 (Pakistan range).
"""

from fastapi import HTTPException


def validate_analyze_request(
    urdu_text: str,
    latitude: float,
    longitude: float,
    history: list,
) -> None:
    """
    Validate that the text is not empty, GPS coordinates fall within the
    expected Pakistan region, and history has proper formatting.

    Raises:
        HTTPException 422: if latitude or longitude is out of bounds.
    """
    if not urdu_text.strip():
        raise HTTPException(
            status_code=400,
            detail="urdu_text cannot be empty",
        )

    if not (20.0 <= latitude <= 40.0):
        raise HTTPException(
            status_code=422,
            detail=f"latitude must be between 20.0 and 40.0, got {latitude}",
        )

    if not (60.0 <= longitude <= 80.0):
        raise HTTPException(
            status_code=422,
            detail=f"longitude must be between 60.0 and 80.0, got {longitude}",
        )

    for item in history:
        if not isinstance(item, dict) or "role" not in item or "content" not in item:
            raise HTTPException(
                status_code=400,
                detail="Each history item must be a dictionary with 'role' and 'content' keys",
            )

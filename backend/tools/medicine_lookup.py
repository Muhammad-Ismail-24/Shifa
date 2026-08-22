"""
Gemini function-call tool — looks up medicines from the local medicines.json file.
"""

import json
from pathlib import Path

from utils.logger import logger

_MEDICINES_PATH = Path(__file__).resolve().parent.parent / "data" / "medicines.json"


def medicine_lookup(disease_name: str) -> dict:
    """
    Look up recommended medicines for a given disease name.

    Args:
        disease_name: The disease/condition to search for (case-insensitive).

    Returns:
        A dict with the disease key and its medicine data, or an empty dict
        if the disease is not found in the local database.
    """
    try:
        data: dict = json.loads(_MEDICINES_PATH.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError) as exc:
        logger.error("Failed to read medicines.json: %s", exc)
        return {"medicines": [], "disclaimer_urdu": "براہ کرم ڈاکٹر سے ملیں۔ خود علاجی نہ کریں۔"}

    # Case-insensitive lookup
    key = disease_name.strip().lower()
    for disease, info in data.items():
        if disease.lower() == key:
            logger.info("Medicine match found for '%s'", disease_name)
            return {disease: info}

    logger.warning("No medicine data found for '%s'", disease_name)
    return {"medicines": [], "disclaimer_urdu": "براہ کرم ڈاکٹر سے ملیں۔ خود علاجی نہ کریں۔"}

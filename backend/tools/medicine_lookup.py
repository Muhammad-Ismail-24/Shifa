"""
Gemini function-call tool — looks up medicines from the local medicines.json file.

Matching strategy (in priority order):
  1. Exact match (case-insensitive, stripped)
  2. Substring / keyword match  — e.g. "Severe Viral Infection" matches "Viral Infection"
  3. Fuzzy match via difflib     — catches typos and minor wording differences
  4. Global OTC fallback         — so the UI *never* shows an empty medicine list
"""

import json
from difflib import get_close_matches
from pathlib import Path

from utils.logger import logger

_MEDICINES_PATH = Path(__file__).resolve().parent.parent / "data" / "medicines.json"

# ── Global fallback (safe OTC) shown when nothing else matches ───────────
_GLOBAL_FALLBACK: dict = {
    "urdu_name": "عمومی علاج",
    "medicines": [
        {
            "name": "Paracetamol (Panadol)",
            "name_urdu": "پیراسیٹامول (پیناڈول)",
            "dosage_urdu": "بخار یا درد کی صورت میں ہر 6 گھنٹے بعد 1 گولی",
            "otc": True,
        },
        {
            "name": "ORS",
            "name_urdu": "او آر ایس",
            "dosage_urdu": "پانی کی کمی سے بچنے کے لیے دن میں 2 سے 3 گلاس",
            "otc": True,
        },
    ],
    "avoid_urdu": "خود علاجی سے گریز کریں۔",
    "see_doctor": True,
    "disclaimer_urdu": "یہ صرف عمومی معلومات ہے۔ براہ کرم جلد از جلد ڈاکٹر سے ملیں۔",
}

# Fuzzy-match tuning
_FUZZY_CUTOFF = 0.55  # minimum similarity ratio (0-1)
_FUZZY_N = 1          # return the single best match


def _normalise(text: str) -> str:
    """Lower-case, strip, and collapse whitespace."""
    return " ".join(text.lower().strip().split())


def medicine_lookup(disease_name: str) -> dict:
    """
    Look up recommended medicines for a given disease name.

    Args:
        disease_name: The disease/condition to search for.

    Returns:
        The disease's medicine record — {"urdu_name", "medicines",
        "avoid_urdu", "see_doctor", "disclaimer_urdu"} — or a safe OTC
        fallback if no match is found (the UI always gets valid data).
    """
    try:
        data: dict = json.loads(_MEDICINES_PATH.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError) as exc:
        logger.error("Failed to read medicines.json: %s", exc)
        return _GLOBAL_FALLBACK

    query = _normalise(disease_name)

    # Build a normalised-key → (original_key, record) mapping once
    norm_map: dict[str, tuple[str, dict]] = {
        _normalise(k): (k, v) for k, v in data.items()
    }

    # ── 1. Exact match ───────────────────────────────────────────────────
    if query in norm_map:
        original, info = norm_map[query]
        logger.info("Medicine EXACT match: '%s' -> '%s'", disease_name, original)
        return info

    # ── 2. Substring / keyword match ─────────────────────────────────────
    #   "Severe Viral Infection" contains "viral infection"  → match
    #   "viral infection"        contains "influenza"?       → no, skip
    for norm_key, (original, info) in norm_map.items():
        if norm_key in query or query in norm_key:
            logger.info(
                "Medicine SUBSTRING match: '%s' -> '%s'", disease_name, original
            )
            return info

    # ── 3. Fuzzy match (difflib) ─────────────────────────────────────────
    norm_keys = list(norm_map.keys())
    close = get_close_matches(query, norm_keys, n=_FUZZY_N, cutoff=_FUZZY_CUTOFF)
    if close:
        best = close[0]
        original, info = norm_map[best]
        logger.info(
            "Medicine FUZZY match: '%s' -> '%s' (score >= %.0f%%)",
            disease_name,
            original,
            _FUZZY_CUTOFF * 100,
        )
        return info

    # ── 4. Global fallback ───────────────────────────────────────────────
    logger.warning(
        "No medicine data found for '%s' — returning global OTC fallback",
        disease_name,
    )
    return _GLOBAL_FALLBACK

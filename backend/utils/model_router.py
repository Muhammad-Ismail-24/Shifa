import re
import asyncio
from enum import Enum
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


# ---------------------------------------------------------------------------
# Phase-based routing
# ---------------------------------------------------------------------------
class Phase(str, Enum):
    """
    Pipeline phases. Callers tag their generate request with a phase so the
    ModelRouter selects phase-appropriate models in one place instead of each
    agent hardcoding its own chain.
    """
    TRIAGE = "triage"
    SYMPTOM_EXTRACTION = "symptom_extraction"
    DISEASE_IDENTIFICATION = "disease_identification"
    RESPONSE_COMPOSITION = "response_composition"
    SOAP_GENERATION = "soap_generation"
    MEDICINE_SCAN = "medicine_scan"
    TRANSCRIPTION = "transcription"
    VOICE_SUMMARY = "voice_summary"


class ModelRouter:
    """
    Centralized model selection per pipeline phase.

    Every phase currently resolves to the shared FALLBACK_MODELS chain
    (all flash models in the chain accept text, audio, and image inputs),
    but the mapping lives here so quota or modality tuning happens once,
    not per agent.
    """

    # Per-phase token budget — phases that don't appear here get no cap.
    _PHASE_MAX_TOKENS: dict[Phase, int] = {
        Phase.RESPONSE_COMPOSITION: 150,
        Phase.VOICE_SUMMARY: 100,
    }

    _PHASE_MODELS: dict[Phase, list[str]] = {
        Phase.TRANSCRIPTION: list(FALLBACK_MODELS),
        # RESPONSE_COMPOSITION is the Phase A Urdu reply — latency-critical,
        # must finish well before the Vercel 60-second timeout. Route to the
        # fastest flash-lite models and cap output at 150 tokens.
        Phase.RESPONSE_COMPOSITION: [
            "gemini-3.5-flash-lite",
            "gemini-3.1-flash-lite",
            *FALLBACK_MODELS,
        ],
        # VOICE_SUMMARY is a non-clinical, latency-sensitive generation —
        # route to gemini-3.5-flash-lite first for the lowest possible TTS lead-in.
        Phase.VOICE_SUMMARY: ["gemini-3.5-flash-lite", *FALLBACK_MODELS],
    }

    @classmethod
    def route(cls, phase: Phase | None = None) -> list[str]:
        """Return the ordered fallback model list for a phase."""
        if phase is None:
            return list(FALLBACK_MODELS)
        return list(cls._PHASE_MODELS.get(phase, FALLBACK_MODELS))

    @classmethod
    def max_tokens(cls, phase: Phase | None = None) -> int | None:
        """Return the max output token cap for a phase, or None for unlimited."""
        if phase is None:
            return None
        return cls._PHASE_MAX_TOKENS.get(phase)


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
            # No hardcoded timeout — the SDK's default connection lifespan
            # governs, allowing free-tier deployments as much time as the
            # platform permits.
            response = await client.aio.models.generate_content(
                model=model_name,
                contents=prompt,
                config=config
            )
            return response.text
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


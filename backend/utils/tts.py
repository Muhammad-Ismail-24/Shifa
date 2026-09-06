"""
ElevenLabs text-to-speech — Shifa's outgoing voice.

One entry point for everything Shifa says out loud:

  - Phase A (triage): callers dictate the reply verbatim.
  - Phase B (results): callers dictate ONLY the short empathetic
    voice_summary — the long clinical payload (medicines, hospitals, SOAP)
    is for reading, never for dictation.

A missing ELEVENLABS_API_KEY is not fatal anywhere: generate_speech raises
TTSUnavailable and every caller degrades gracefully (WhatsApp sends text
only, the web UI falls back to browser speech synthesis).
"""

import asyncio
import os

from utils.logger import logger

# Rachel — calm, professional default. Pre-made ElevenLabs voice.
DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"
# Crucial for the Urdu/English mix this product speaks.
DEFAULT_MODEL_ID = "eleven_multilingual_v2"


class TTSUnavailable(RuntimeError):
    """Raised when TTS cannot run (no API key, synthesis failed)."""


def tts_configured() -> bool:
    """True when an ElevenLabs API key is present in the environment."""
    return bool(os.getenv("ELEVENLABS_API_KEY", "").strip())


def _synthesize_sync(text: str) -> bytes:
    """Blocking core: convert `text` to mp3 bytes via the ElevenLabs SDK."""
    # Key check first: a missing key must fail as TTSUnavailable without even
    # importing the SDK, so environments without the package installed still
    # degrade cleanly.
    api_key = os.getenv("ELEVENLABS_API_KEY", "").strip()
    if not api_key:
        raise TTSUnavailable("ELEVENLABS_API_KEY is not set")

    from elevenlabs import ElevenLabs

    voice_id = os.getenv("ELEVENLABS_VOICE_ID", DEFAULT_VOICE_ID).strip()
    model_id = os.getenv("ELEVENLABS_MODEL_ID", DEFAULT_MODEL_ID).strip()

    client = ElevenLabs(api_key=api_key)
    chunks = client.text_to_speech.convert(
        text=text,
        voice_id=voice_id,
        model_id=model_id,
        output_format="mp3_44100_128",
    )
    audio = b"".join(chunks)
    logger.info("TTS synthesized %d chars -> %d bytes.", len(text), len(audio))
    return audio


async def generate_speech(text: str) -> bytes:
    """
    Synthesize `text` to mp3 bytes (eleven_multilingual_v2, Rachel voice).

    The SDK call is blocking network I/O, so it runs off-thread — the same
    convention as utils/ai_client.py. Never blocks the event loop.
    """
    return await asyncio.to_thread(_synthesize_sync, text)

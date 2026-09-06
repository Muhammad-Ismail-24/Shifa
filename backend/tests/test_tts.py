"""
ElevenLabs TTS and the WhatsApp voice path.

The one behaviour that must never break: when TTS is unavailable (missing
ELEVENLABS_API_KEY, failed synthesis, failed upload) the WhatsApp route still
delivers the text reply. Audio is a comfort, text is the answer.
"""

import asyncio
import sys
import types

import pytest

from utils import tts as tts_mod
from utils import whatsapp as wa_mod


# ---------------------------------------------------------------------------
# utils/tts.py
# ---------------------------------------------------------------------------

def test_generate_speech_requires_api_key(monkeypatch):
    """No key -> TTSUnavailable before any network call is attempted."""
    monkeypatch.delenv("ELEVENLABS_API_KEY", raising=False)

    with pytest.raises(tts_mod.TTSUnavailable):
        asyncio.run(tts_mod.generate_speech("hello"))


def test_generate_speech_returns_mp3_bytes(monkeypatch):
    """A working SDK yields the joined byte chunks of the conversion."""

    class FakeTTS:
        def convert(self, **kwargs):
            return iter([b"ID3", b"fake-mp3-bytes"])

    class FakeElevenLabs:
        def __init__(self, **kwargs):
            self.text_to_speech = FakeTTS()

    fake = types.ModuleType("elevenlabs")
    fake.ElevenLabs = FakeElevenLabs
    monkeypatch.setitem(sys.modules, "elevenlabs", fake)
    monkeypatch.setenv("ELEVENLABS_API_KEY", "test-key")

    result = asyncio.run(tts_mod.generate_speech("hello"))
    assert result == b"ID3fake-mp3-bytes"


def test_tts_configured_reflects_env(monkeypatch):
    monkeypatch.setenv("ELEVENLABS_API_KEY", "present")
    assert tts_mod.tts_configured() is True

    monkeypatch.delenv("ELEVENLABS_API_KEY", raising=False)
    assert tts_mod.tts_configured() is False


# ---------------------------------------------------------------------------
# utils/whatsapp.py — graceful degradation
# ---------------------------------------------------------------------------

async def test_process_and_reply_still_sends_text_when_tts_fails(monkeypatch):
    """
    TTS failure must never cost the patient the text message.

    generate_speech raises (as it does when ELEVENLABS_API_KEY is missing);
    the text reply must still go out exactly once.
    """
    import agents.triage_agent as triage_mod

    sent = []

    async def fake_reply(chat_id, message):
        sent.append((chat_id, message))

    async def fake_triage(latest_input, history):
        return {"status": "clarification_needed", "question_urdu": "کیا آپ کو بخار ہے؟"}

    async def broken_tts(text):
        raise tts_mod.TTSUnavailable("ELEVENLABS_API_KEY is not set")

    monkeypatch.setattr(wa_mod, "send_whatsapp_reply", fake_reply)
    monkeypatch.setattr(triage_mod, "evaluate_triage", fake_triage)
    monkeypatch.setattr(tts_mod, "generate_speech", broken_tts)

    await wa_mod.process_and_reply("923001234567@c.us", "مجھے بخار ہے")

    assert len(sent) == 1
    assert sent[0][0] == "923001234567@c.us"
    assert "بخار" in sent[0][1]


async def test_process_and_reply_speaks_voice_summary_not_the_payload(monkeypatch):
    """
    After a diagnosis the audio must be the short voice_summary — never the
    long clinical reply text.
    """
    import agents.orchestrator as orch
    import agents.triage_agent as triage_mod

    spoken = []
    sent = []

    async def fake_triage(latest_input, history):
        return {"status": "proceed"}

    async def fake_pipeline(urdu_text, latitude, longitude, history):
        return {
            "response_text_urdu": "یہ بہت لمبا طبی جواب ہے۔" * 20,
            "voice_summary": "Ghabraen nahin. Neeche ilaaj diya gaya hai.",
            "is_emergency": False,
        }

    async def fake_generate_speech(text):
        spoken.append(text)
        return b"fake-audio"

    async def fake_send_audio(chat_id, audio_bytes):
        sent.append((chat_id, audio_bytes))

    async def fake_reply(chat_id, message):
        sent.append((chat_id, message))

    monkeypatch.setattr(triage_mod, "evaluate_triage", fake_triage)
    monkeypatch.setattr(orch, "run_pipeline", fake_pipeline)
    monkeypatch.setattr(tts_mod, "generate_speech", fake_generate_speech)
    monkeypatch.setattr(wa_mod, "send_whatsapp_audio", fake_send_audio)
    monkeypatch.setattr(wa_mod, "send_whatsapp_reply", fake_reply)

    await wa_mod.process_and_reply("923001234567@c.us", "مجھے بخار ہے")

    assert spoken == ["Ghabraen nahin. Neeche ilaaj diya gaya hai."]
    # Audio went out first, then the (long) text reply.
    assert len(sent) == 2
    assert sent[0] == ("923001234567@c.us", b"fake-audio")
    assert "لمبا طبی جواب" in sent[1][1]

"""
HTTP-level behaviour of /analyze and /results/{session_id}.

Covers the two-phase handshake, the emergency short-circuit, CORS parsing, and
every state GET /results can answer in.
"""

import asyncio

import pytest
from fastapi.testclient import TestClient

import main
import session_store


@pytest.fixture
def client(monkeypatch):
    """
    A TestClient with the Qdrant bootstrap startup hook removed.

    That hook connects to a vector database and runs ingestion if the
    collection is missing. It is correct in production and impossible in a unit
    test, so it is dropped here; every other startup hook still runs.
    """
    kept = [
        h for h in main.app.router.on_startup
        if h.__name__ != "startup_event"
    ]
    monkeypatch.setattr(main.app.router, "on_startup", kept)
    with TestClient(main.app) as c:
        yield c


def _patch_pipeline(monkeypatch, *, triage=None, phase_a=None, phase_b=None):
    """
    Replace the agent pipeline. /analyze imports these inside the handler, so
    they are patched on their defining modules rather than on main.
    """
    import agents.orchestrator as orch
    import agents.triage_agent as triage_mod

    async def default_triage(latest_input, history):
        return {"status": "proceed"}

    monkeypatch.setattr(triage_mod, "evaluate_triage", triage or default_triage)

    if phase_a is not None:
        monkeypatch.setattr(orch, "run_pipeline_phase_a", phase_a)
    if phase_b is not None:
        async def _tolerant_phase_b(disease, lat, lng, **kwargs):
            try:
                return await phase_b(disease, lat, lng, **kwargs)
            except TypeError:
                return await phase_b(disease, lat, lng)

        monkeypatch.setattr(orch, "run_phase_b", _tolerant_phase_b)


BODY = {"urdu_text": "مجھے دو دن سے بخار ہے", "latitude": 33.6, "longitude": 73.0, "history": []}


def _phase_a(**overrides):
    base = {
        "diseases": [{"disease": "Viral Fever", "confidence": "high", "urdu": "وائرل بخار"}],
        "medicines": [],
        "hospitals": [],
        "response_text_urdu": "آرام کریں۔",
        "is_emergency": False,
        "disclaimer_urdu": "ڈاکٹر سے ملیں۔",
        "needs_phase_b": True,
        "top_disease": "Viral Fever",
    }
    base.update(overrides)

    async def run(urdu_text, latitude, longitude, history):
        return dict(base)

    return run


# ---------------------------------------------------------------------------
# Phase A contract
# ---------------------------------------------------------------------------

def test_analyze_returns_session_id_and_empty_enrichment(client, monkeypatch):
    async def phase_b(disease, lat, lng, *args, **kwargs):
        return {
            "medicines": [{"name": "Paracetamol"}],
            "hospitals": [],
            "disclaimer_urdu": "d",
            "medicines_status": "ok",
            "hospitals_status": "ok",
        }

    _patch_pipeline(monkeypatch, phase_a=_phase_a(), phase_b=phase_b)

    res = client.post("/analyze", json=BODY)
    assert res.status_code == 200
    body = res.json()

    assert body["session_id"]
    assert body["diseases"][0]["disease"] == "Viral Fever"
    # Phase A never carries enrichment — that is the whole point of the split.
    assert body["medicines"] == []
    assert body["hospitals"] == []
    # No internal decision keys leak into the wire contract.
    assert "needs_phase_b" not in body
    assert "top_disease" not in body


def test_triage_clarification_has_no_session_id(client, monkeypatch):
    async def clarify(latest_input, history):
        return {"status": "clarification_needed", "question_urdu": "کہاں تکلیف ہے؟"}

    _patch_pipeline(monkeypatch, triage=clarify)

    body = client.post("/analyze", json=BODY).json()

    assert body["session_id"] is None
    assert body["diseases"] == []
    assert body["response_text_urdu"] == "کہاں تکلیف ہے؟"
    # Nothing to enrich, so nothing was scheduled.
    assert session_store.session_count() == 0


def test_no_diseases_means_no_phase_b_session(client, monkeypatch):
    _patch_pipeline(monkeypatch, phase_a=_phase_a(diseases=[], needs_phase_b=False, top_disease=""))
    body = client.post("/analyze", json=BODY).json()
    assert body["session_id"] is None
    assert session_store.session_count() == 0


# ---------------------------------------------------------------------------
# Emergency authority
# ---------------------------------------------------------------------------

def test_emergency_returns_immediately_with_no_enrichment(client, monkeypatch):
    """
    An emergency turn must not schedule Phase B. Medicine suggestions arriving
    underneath "go to hospital now" invite the patient to treat the symptom
    instead of going.
    """
    called = {"phase_b": False}

    async def phase_b(disease, lat, lng, *args, **kwargs):
        called["phase_b"] = True
        return {"medicines": [], "hospitals": [], "disclaimer_urdu": "d",
                "medicines_status": "ok", "hospitals_status": "ok"}

    _patch_pipeline(
        monkeypatch,
        phase_a=_phase_a(
            diseases=[], is_emergency=True,
            response_text_urdu="فوری طور پر ہسپتال جائیں",
            needs_phase_b=False, top_disease="",
        ),
        phase_b=phase_b,
    )

    body = client.post("/analyze", json=BODY).json()

    assert body["is_emergency"] is True
    assert body["session_id"] is None
    assert body["diseases"] == []
    assert body["medicines"] == []
    assert body["hospitals"] == []
    assert called["phase_b"] is False
    assert session_store.session_count() == 0


def test_emergency_detection_survives_the_phase_a_path(client, monkeypatch):
    """
    Exercises the real emergency keyword check rather than a stub, so a change
    to normalisation or the keyword list is caught here.
    """
    _patch_pipeline(monkeypatch)  # real run_pipeline_phase_a, stubbed triage

    body = client.post("/analyze", json={
        **BODY, "urdu_text": "سینے میں شدید درد ہے سانس نہیں آ رہا",
    }).json()

    assert body["is_emergency"] is True
    assert body["diseases"] == []
    assert body["medicines"] == []
    assert body["session_id"] is None


# ---------------------------------------------------------------------------
# Phase B over HTTP
# ---------------------------------------------------------------------------

def _analyze_then_results(client, monkeypatch, phase_b):
    _patch_pipeline(monkeypatch, phase_a=_phase_a(), phase_b=phase_b)
    session_id = client.post("/analyze", json=BODY).json()["session_id"]
    return client.get(f"/results/{session_id}")


def test_results_success(client, monkeypatch):
    async def phase_b(disease, lat, lng, *args, **kwargs):
        return {
            "medicines": [{"name": "Paracetamol"}],
            "hospitals": [{"name": "PIMS", "lat": 33.7, "lng": 73.0}],
            "disclaimer_urdu": "d",
            "medicines_status": "ok",
            "hospitals_status": "ok",
        }

    res = _analyze_then_results(client, monkeypatch, phase_b)
    assert res.status_code == 200
    body = res.json()
    assert body["medicines_status"] == "ok"
    assert body["hospitals_status"] == "ok"
    assert len(body["medicines"]) == 1
    assert len(body["hospitals"]) == 1


def test_results_partial_failure_is_reported_per_lookup(client, monkeypatch):
    async def phase_b(disease, lat, lng, *args, **kwargs):
        return {
            "medicines": [{"name": "Paracetamol"}],
            "hospitals": [],
            "disclaimer_urdu": "d",
            "medicines_status": "ok",
            "hospitals_status": "failed",
        }

    body = _analyze_then_results(client, monkeypatch, phase_b).json()
    assert body["medicines_status"] == "ok"
    assert body["medicines"] == [{"name": "Paracetamol"}]
    assert body["hospitals_status"] == "failed"


def test_results_task_raising_is_200_with_failed_status(client, monkeypatch):
    """
    Not a 500. The patient already has a correct medical answer on screen;
    turning missing enrichment into a red error would misrepresent it.
    """
    async def phase_b(disease, lat, lng, *args, **kwargs):
        raise RuntimeError("everything is on fire")

    res = _analyze_then_results(client, monkeypatch, phase_b)
    assert res.status_code == 200
    body = res.json()
    assert body["medicines_status"] == "failed"
    assert body["hospitals_status"] == "failed"
    assert body["medicines"] == []


def test_results_unknown_session_is_404(client):
    res = client.get("/results/00000000-0000-0000-0000-000000000000")
    assert res.status_code == 404


def test_results_expired_session_is_404(client, monkeypatch):
    import time

    async def phase_b(disease, lat, lng, *args, **kwargs):
        return {"medicines": [], "hospitals": [], "disclaimer_urdu": "d",
                "medicines_status": "ok", "hospitals_status": "ok"}

    _patch_pipeline(monkeypatch, phase_a=_phase_a(), phase_b=phase_b)
    session_id = client.post("/analyze", json=BODY).json()["session_id"]

    session_store._sessions[session_id]["created_at"] = (
        time.time() - session_store.TTL_SECONDS - 1
    )
    assert client.get(f"/results/{session_id}").status_code == 404


def test_results_can_be_fetched_twice(client, monkeypatch):
    async def phase_b(disease, lat, lng, *args, **kwargs):
        return {"medicines": [{"name": "A"}], "hospitals": [], "disclaimer_urdu": "d",
                "medicines_status": "ok", "hospitals_status": "ok"}

    _patch_pipeline(monkeypatch, phase_a=_phase_a(), phase_b=phase_b)
    sid = client.post("/analyze", json=BODY).json()["session_id"]

    first = client.get(f"/results/{sid}").json()
    second = client.get(f"/results/{sid}").json()
    assert first == second


def test_concurrent_consultations_get_their_own_results(client, monkeypatch):
    """
    Two overlapping consultations must not swap enrichment. The session id is
    the only thing tying a result to its request.
    """
    async def phase_b(disease, lat, lng, **kwargs):
        await asyncio.sleep(0.01)
        return {
            "medicines": [{"name": disease}],
            "hospitals": [],
            "disclaimer_urdu": "d",
            "medicines_status": "ok",
            "hospitals_status": "ok",
        }

    def phase_a_for(disease):
        async def run(urdu_text, latitude, longitude, history):
            return {
                "diseases": [{"disease": disease, "confidence": "high", "urdu": "x"}],
                "medicines": [], "hospitals": [],
                "response_text_urdu": "…", "is_emergency": False,
                "disclaimer_urdu": "d",
                "needs_phase_b": True, "top_disease": disease,
            }
        return run

    import agents.orchestrator as orch
    import agents.triage_agent as triage_mod

    async def proceed(latest_input, history):
        return {"status": "proceed"}

    monkeypatch.setattr(triage_mod, "evaluate_triage", proceed)
    monkeypatch.setattr(orch, "run_phase_b", phase_b)

    monkeypatch.setattr(orch, "run_pipeline_phase_a", phase_a_for("Malaria"))
    sid_a = client.post("/analyze", json=BODY).json()["session_id"]

    monkeypatch.setattr(orch, "run_pipeline_phase_a", phase_a_for("Dengue"))
    sid_b = client.post("/analyze", json=BODY).json()["session_id"]

    assert sid_a != sid_b
    # Fetched out of order on purpose.
    assert client.get(f"/results/{sid_b}").json()["medicines"] == [{"name": "Dengue"}]
    assert client.get(f"/results/{sid_a}").json()["medicines"] == [{"name": "Malaria"}]


# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "raw,expected",
    [
        ("", []),
        ("https://a.app", ["https://a.app"]),
        ("  https://a.app  ,  https://b.app  ", ["https://a.app", "https://b.app"]),
        ("https://a.app,,https://b.app,", ["https://a.app", "https://b.app"]),
        ("https://a.app/", ["https://a.app"]),                 # trailing slash never matches
        ('"https://a.app"', ["https://a.app"]),                # quoted dashboard paste
        ("   ,  , ", []),
    ],
)
def test_cors_origin_parsing(raw, expected):
    assert main._parse_origins(raw) == expected


def test_cors_never_wildcards_with_credentials():
    """
    allow_credentials=True plus a wildcard is both rejected by browsers and a
    genuine hole on an endpoint that receives symptoms.
    """
    assert "*" not in main.ALLOWED_ORIGINS
    assert all(not o.endswith("*") for o in main.ALLOWED_ORIGINS)


def test_cors_allows_local_dev_by_default():
    assert "http://localhost:5173" in main.ALLOWED_ORIGINS


def test_cors_preflight_rejects_unknown_origin(client):
    res = client.options(
        "/analyze",
        headers={
            "Origin": "https://evil.example.com",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert "access-control-allow-origin" not in {k.lower() for k in res.headers}


def test_cors_preflight_allows_dev_origin(client):
    res = client.options(
        "/analyze",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert res.headers.get("access-control-allow-origin") == "http://localhost:5173"


# ---------------------------------------------------------------------------
# Health & Other Endpoints
# ---------------------------------------------------------------------------

def test_health_endpoint(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_scan_medicine_endpoint(client, monkeypatch):
    import agents.scanner_agent as scanner_mod

    async def fake_scan(image_base64, mime_type="image/jpeg"):
        return {
            "medicine_name": "Panadol 500mg",
            "explanation_urdu": "یہ دوا سر درد اور بخار کے لیے استعمال ہوتی ہے۔",
        }

    monkeypatch.setattr(scanner_mod, "scan_medicine_image", fake_scan)

    res = client.post(
        "/scan-medicine",
        json={"image_base64": "fakebase64data", "mime_type": "image/jpeg"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["medicine_name"] == "Panadol 500mg"
    assert "بخار" in data["explanation_urdu"]


def test_whatsapp_webhook_valid_message(client, monkeypatch):
    from utils import whatsapp as wa_mod

    called = []

    async def fake_process_and_reply(chat_id, text):
        called.append((chat_id, text))

    monkeypatch.setattr(wa_mod, "process_and_reply", fake_process_and_reply)

    payload = {
        "typeWebhook": "incomingMessageReceived",
        "senderData": {"chatId": "923001234567@c.us"},
        "messageData": {
            "textMessageData": {"textMessage": "مجھے بخار ہے"}
        },
    }

    res = client.post("/whatsapp-webhook", json=payload)
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
    assert called == [("923001234567@c.us", "مجھے بخار ہے")]


def test_whatsapp_webhook_ignores_non_text(client, monkeypatch):
    from utils import whatsapp as wa_mod

    called = []

    async def fake_process_and_reply(chat_id, text):
        called.append((chat_id, text))

    monkeypatch.setattr(wa_mod, "process_and_reply", fake_process_and_reply)

    # Status update webhook
    payload = {
        "typeWebhook": "outgoingMessageStatus",
        "status": "delivered",
    }

    res = client.post("/whatsapp-webhook", json=payload)
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
    assert len(called) == 0


def test_whatsapp_parse_incoming_message():
    from utils.whatsapp import parse_incoming_message

    # Valid
    payload = {
        "typeWebhook": "incomingMessageReceived",
        "senderData": {"chatId": "123@c.us"},
        "messageData": {"textMessageData": {"textMessage": "hello"}},
    }
    assert parse_incoming_message(payload) == ("123@c.us", "hello")

    # Missing text
    empty_text = {
        "typeWebhook": "incomingMessageReceived",
        "senderData": {"chatId": "123@c.us"},
        "messageData": {"textMessageData": {"textMessage": "  "}},
    }
    assert parse_incoming_message(empty_text) is None

    # Missing chatId
    no_chat = {
        "typeWebhook": "incomingMessageReceived",
        "senderData": {},
        "messageData": {"textMessageData": {"textMessage": "hello"}},
    }
    assert parse_incoming_message(no_chat) is None


async def test_soap_agent_generation(monkeypatch):
    from agents import soap_agent

    class FakeResponse:
        text = "S: Fever. O: Vitals stable. A: Viral Fever. P: Paracetamol."

    class FakeModel:
        def __init__(self, *args, **kwargs):
            pass

        def generate_content(self, prompt):
            return FakeResponse()

        async def generate_content_async(self, prompt):
            return FakeResponse()

    monkeypatch.setattr(soap_agent.genai, "GenerativeModel", FakeModel)

    note = await soap_agent.generate_soap_note(
        diseases=[{"disease": "Viral Fever", "confidence": "high"}],
        medicines=[{"name": "Paracetamol"}],
        symptoms=["fever"],
        original_text="بخار ہے",
    )
    assert note is not None
    assert "Viral Fever" in note
    assert len(note) <= 500


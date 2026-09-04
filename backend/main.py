"""
Shifa — FastAPI backend entry point.
Registers /health and /analyze endpoints.
"""

import asyncio
import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import session_store
from utils.logger import logger
from utils.validators import validate_analyze_request

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Shifa",
    description="AI-powered healthcare assistant backend",
    version="0.1.0",
)

# ---------------------------------------------------------------------------
# CORS
#
# DEPLOYMENT REQUIREMENT: the production frontend origin is NOT hardcoded here.
# Nothing in this repository establishes the live Vercel domain — the two
# candidates in the design docs disagree and neither is confirmed — and a
# guessed origin is worse than an absent one: it looks configured, passes
# review, and fails only in production. Set it explicitly:
#
#     CORS_ORIGINS=https://<the-real-domain>.vercel.app
#
# Comma-separate to add preview deployments. Only the local dev origins ship as
# defaults; the startup log states plainly whether a production origin is
# configured.
#
# No wildcard and no `.*\.vercel\.app` regex. allow_credentials=True with
# allow_origins=["*"] is rejected by every browser anyway, and a Vercel-wide
# regex would let any project on that platform call this API with credentials
# attached — on an endpoint that accepts a patient's symptoms.
# ---------------------------------------------------------------------------
DEV_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]


def _parse_origins(raw: str) -> list[str]:
    """
    Split CORS_ORIGINS into clean origins.

    Tolerates the shapes a deploy config actually produces: surrounding spaces,
    empty entries from a trailing comma, a quoted value pasted from a dashboard,
    and a trailing slash (which never matches, because the browser sends an
    origin without one).
    """
    origins = []
    for chunk in raw.split(","):
        origin = chunk.strip().strip("\'\"").rstrip("/")
        if origin:
            origins.append(origin)
    return origins


CONFIGURED_ORIGINS = _parse_origins(os.getenv("CORS_ORIGINS", ""))

# dict.fromkeys de-duplicates while preserving order.
ALLOWED_ORIGINS = list(dict.fromkeys(CONFIGURED_ORIGINS + DEV_ORIGINS))

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------
class AnalyzeRequest(BaseModel):
    urdu_text: str
    latitude: float
    longitude: float
    history: list = Field(default_factory=list)


class AnalyzeResponse(BaseModel):
    """
    Phase A of the response. `medicines` and `hospitals` are always empty here;
    the client fetches them from GET /results/{session_id} once it has the
    conversational reply on screen.

    `session_id` is null on turns that produce nothing to look up — a triage
    clarification, or a failed turn — which is the client's signal not to fetch.
    """

    session_id: str | None = None
    diseases: list
    medicines: list
    hospitals: list
    response_text_urdu: str
    is_emergency: bool
    disclaimer_urdu: str


class ResultsResponse(BaseModel):
    """
    Phase B — the two slow lookups, resolved off the critical path.

    The per-lookup status fields exist so the client can tell an empty result
    apart from a failed one. "No medicines" and "we could not find out" are
    different statements to make to a patient, and only one of them is safe to
    render as a treatment answer.

        ok       — the lookup ran; the list is what it found (possibly empty)
        failed   — the lookup errored; the list is empty because we do not know
        expired  — the whole session is gone (TTL, restart, capacity eviction)
    """

    medicines: list
    hospitals: list
    medicines_status: str = "ok"
    hospitals_status: str = "ok"


class ScanMedicineRequest(BaseModel):
    image_base64: str
    mime_type: str = "image/jpeg"


class ScanMedicineResponse(BaseModel):
    medicine_name: str
    explanation_urdu: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@app.on_event("startup")
async def startup_event():
    """Startup safeguard to ensure Qdrant vector database is populated."""
    logger.info("Running startup checks...")
    from qdrant_client import QdrantClient
    from config.settings import settings
    
    client = QdrantClient(
        url=settings.QDRANT_URL,
        api_key=settings.QDRANT_API_KEY,
    )
    
    if not client.collection_exists("shifa_knowledge"):
        logger.warning("shifa_knowledge collection missing. Running ingestion...")
        from rag.ingest import ingest_all
        ingest_all()
        logger.info("Ingestion completed successfully.")
    else:
        logger.info("shifa_knowledge collection exists.")

@app.on_event("startup")
async def log_cors_configuration():
    """
    State the CORS posture at boot, loudly if it is wrong.

    A missing production origin is the single most likely way this deployment
    breaks: everything works locally, and the deployed frontend gets a CORS
    error on the first consultation. Better to say so in the boot log than to
    find out from a patient.
    """
    if CONFIGURED_ORIGINS:
        logger.info("CORS: allowing %s (+ local dev origins).", ", ".join(CONFIGURED_ORIGINS))
    else:
        logger.warning(
            "CORS: no CORS_ORIGINS configured — only local dev origins are allowed. "
            "A deployed frontend WILL be blocked. Set CORS_ORIGINS to the production "
            "frontend origin, e.g. CORS_ORIGINS=https://your-app.vercel.app"
        )


@app.on_event("shutdown")
async def shutdown_sessions():
    """Cancel in-flight Phase B work so nothing is destroyed mid-await."""
    session_store.shutdown()


@app.get("/health")
async def health():
    """Simple liveness probe."""
    return {"status": "ok"}


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(body: AnalyzeRequest):
    """
    Main analysis endpoint.
    1. Validates GPS coordinates.
    2. Delegates to the agent orchestration pipeline.
    3. Returns the pipeline result to the caller.
    """
    logger.info(
        "POST /analyze — text length=%d, lat=%.4f, lng=%.4f, history_len=%d",
        len(body.urdu_text),
        body.latitude,
        body.longitude,
        len(body.history),
    )

    # Validate inputs (raises HTTPException on failure)
    validate_analyze_request(body.urdu_text, body.latitude, body.longitude, body.history)

    # Import here to avoid circular imports during early startup
    from agents.orchestrator import run_phase_b, run_pipeline_phase_a
    from agents.triage_agent import evaluate_triage

    logger.info("Running triage evaluation in /analyze...")
    try:
        triage = await evaluate_triage(latest_input=body.urdu_text, history=body.history)
    except Exception as e:
        logger.error(f"Triage evaluation failed: {e}")
        return AnalyzeResponse(
            diseases=[],
            medicines=[],
            hospitals=[],
            response_text_urdu="معاف کیجئے گا، مجھے آپ کی بات سمجھ نہیں آئی۔ براہ کرم اپنی علامات دوبارہ بتائیں۔",
            is_emergency=False,
            disclaimer_urdu="براہ کرم اپنی علامات کے بارے میں مزید بتائیں۔"
        )

    if triage.get("status") == "clarification_needed":
        logger.info("Triage: clarification needed — returning immediately.")
        return AnalyzeResponse(
            diseases=[],
            medicines=[],
            hospitals=[],
            response_text_urdu=triage.get("question_urdu", "آپ کی تکلیف کے بارے میں مزید بتائیں۔"),
            is_emergency=False,
            disclaimer_urdu="براہ کرم اپنی علامات کے بارے میں مزید بتائیں۔"
        )

    result = await run_pipeline_phase_a(
        body.urdu_text,
        body.latitude,
        body.longitude,
        body.history,
    )

    # Kick Phase B off now rather than when the GET arrives: by the time the
    # client has painted the reply and asked for results, the lookups are
    # already in flight or done.
    session_id: str | None = None
    if result.pop("needs_phase_b", False):
        top_disease = result.pop("top_disease", "Unknown")
        task = asyncio.create_task(
            run_phase_b(top_disease, body.latitude, body.longitude)
        )
        session_id = session_store.create_session(task)
        logger.info("Phase B launched for session %s (%s).", session_id, top_disease)
    else:
        result.pop("top_disease", None)

    return AnalyzeResponse(session_id=session_id, **result)


@app.get("/results/{session_id}", response_model=ResultsResponse)
async def results(session_id: str):
    """
    Phase B of the response — medicines and nearby hospitals.

    Awaits the background task started by /analyze.

    Every outcome answers 200 with an honest status rather than an error, with
    one exception. A 5xx here would put a red failure in front of a patient who
    already has a correct medical answer on screen; the enrichment is
    supplementary and its absence is information, not a fault. Only a genuinely
    unknown session id is a 404 — that one the client must stop waiting on.
    """
    logger.info("GET /results/%s", session_id)

    outcome, data = await session_store.await_results(session_id)

    if outcome == "not_found":
        # 404 with a status body: the client reads the status to render
        # "results expired", and the code keeps the endpoint honest for anyone
        # reading it as a plain REST resource.
        raise HTTPException(status_code=404, detail="Unknown or expired session")

    if outcome in ("failed", "cancelled") or data is None:
        return ResultsResponse(
            medicines=[],
            hospitals=[],
            medicines_status="failed",
            hospitals_status="failed",
        )

    return ResultsResponse(
        medicines=data.get("medicines", []),
        hospitals=data.get("hospitals", []),
        medicines_status=data.get("medicines_status", "ok"),
        hospitals_status=data.get("hospitals_status", "ok"),
    )


@app.post("/scan-medicine", response_model=ScanMedicineResponse)
async def scan_medicine(body: ScanMedicineRequest):
    """
    Visual Pill/Prescription Scanner endpoint.
    Takes a base64 image, uses Gemini Vision to identify it,
    and returns a simple Urdu explanation.
    """
    logger.info("POST /scan-medicine received image.")
    from agents.scanner_agent import scan_medicine_image
    
    result = await scan_medicine_image(body.image_base64, body.mime_type)
    
    return ScanMedicineResponse(
        medicine_name=result.get("medicine_name", "Unknown"),
        explanation_urdu=result.get("explanation_urdu", "تصویر میں دوا کی شناخت نہیں ہو سکی۔")
    )


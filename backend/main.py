"""
Shifa — FastAPI backend entry point.
Registers /health and /analyze endpoints.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

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
# CORS — allow all origins during development; tighten for production
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
    diseases: list
    medicines: list
    hospitals: list
    response_text_urdu: str
    is_emergency: bool
    disclaimer_urdu: str


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
    from agents.orchestrator import run_pipeline
    from agents.triage_agent import evaluate_triage

    logger.info("Running triage evaluation in /analyze...")
    try:
        triage = await evaluate_triage(latest_input=body.urdu_text, history=body.history)
    except Exception as e:
        logger.error(f"Triage evaluation failed: {e}")
        triage = {"status": "proceed"}

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

    result = await run_pipeline(
        body.urdu_text,
        body.latitude,
        body.longitude,
        body.history,
    )

    return result

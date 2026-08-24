# Shifa — Sufiyan's Assignment (Backend API + Tools + Data)
**BanoQabil Hackathon 2026**

---

## Your Role

You own the backend's entry point, the two tools Gemini calls, all the medical data files, input validation, logging, and deployment to Railway. Think of yourself as the **foundation** — you set up everything so that when the AI pipeline (owned by your partner) calls a tool or returns a response, it just works.

You also own the knowledge documents that feed the RAG system. Writing those well is as important as the code — garbage in, garbage out.

---

## What You Are Building (Your Mental Model)

The backend is a FastAPI Python server deployed on Railway. It receives one request from the frontend:

```
POST /analyze  →  { urdu_text, latitude, longitude }
```

Your job is to:
1. Receive and validate that request
2. Hand the data to the AI orchestrator (your partner's code)
3. Return the full response back to the frontend

You also build the two tools that Gemini calls during its reasoning:
- **`medicine_lookup`** — looks up safe OTC medicines from `medicines.json`
- **`places_search`** — calls Google Places API to find nearby hospitals

And you write all 5 knowledge documents that get loaded into the RAG system.

---

## Your Folders

```
backend/
├── main.py                       # ← YOURS: FastAPI app, /analyze + /health endpoints
├── requirements.txt              # ← YOURS: all Python deps, pinned
├── database.py                   # ← YOURS: SQLite boilerplate (not active Day 1)
├── .env.example                  # ← YOURS: all keys with empty values — committed
│
├── config/
│   └── settings.py               # ← YOURS: loads all env vars via pydantic BaseSettings
│
├── tools/
│   ├── medicine_lookup.py        # ← YOURS: reads medicines.json, returns medicine data
│   └── places_search.py          # ← YOURS: calls Google Places API, returns hospitals
│
├── data/
│   ├── medicines.json            # ← YOURS: static OTC medicine data — 20 diseases
│   └── knowledge/                # ← YOURS: all 5 RAG source documents
│       ├── disease_symptoms_pakistan.txt
│       ├── urdu_symptom_glossary.txt
│       ├── emergency_warning_signs.txt
│       ├── pakistan_medicines.txt
│       └── who/                  # ← YOURS: download WHO Pakistan PDFs here
│
└── utils/
    ├── logger.py                 # ← YOURS: centralised logging setup
    └── validators.py             # ← YOURS: input sanitisation, GPS bounds check
```

**Do not touch:**
```
backend/agents/        ← your partner's
backend/rag/           ← your partner's
backend/config/prompts.py  ← your partner's
```

---

## Tech Stack

| Tool | Purpose |
|---|---|
| Python 3.11 | Pinned — do not use 3.12 or 3.14 |
| FastAPI + Uvicorn | REST API server |
| Pydantic v2 | Request/response validation + settings |
| httpx | For Google Places API calls (async) |
| Railway | Backend deployment — always-on, no cold starts |

---

## Environment Variables

Add these to `backend/.env` (never commit this file) and `backend/.env.example` (commit this with empty values):

```bash
GEMINI_API_KEY=
GOOGLE_PLACES_API_KEY=
QDRANT_URL=
QDRANT_API_KEY=
```

You will share the Railway deployment URL with Zaheen so he can set `VITE_API_URL`.

---

## File-by-File Breakdown

### `backend/main.py`

The FastAPI app. Two endpoints only.

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from agents.orchestrator import run_pipeline   # your partner's function
from config.settings import settings
from utils.validators import validate_analyze_request
from utils.logger import logger

app = FastAPI()

# CORS — allow Vercel frontend origin
app.add_middleware(CORSMiddleware, allow_origins=["*"], ...)

@app.post("/analyze")
async def analyze(body: AnalyzeRequest):
    validate_analyze_request(body)
    result = await run_pipeline(body.urdu_text, body.latitude, body.longitude, body.history)
    return result

@app.get("/health")
async def health():
    return {"status": "ok"}
```

The request and response shapes (Pydantic models) live in `main.py` or a `schemas.py` file you create. Match them exactly to what Zaheen expects.

**Request model:**
```python
class AnalyzeRequest(BaseModel):
    urdu_text: str
    latitude: float
    longitude: float
    history: list[dict] = []   # conversation history — empty list on the first turn
```

**Response model:**
```python
class AnalyzeResponse(BaseModel):
    diseases: list[Disease]
    medicines: list[Medicine]
    hospitals: list[Hospital]
    response_text_urdu: str
    is_emergency: bool
    disclaimer_urdu: str
```

### `backend/config/settings.py`

Load all environment variables here. Everything else imports from here — nobody calls `os.environ` directly.

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    gemini_api_key: str
    google_places_api_key: str
    qdrant_url: str
    qdrant_api_key: str

    class Config:
        env_file = ".env"

settings = Settings()
```

### `backend/utils/logger.py`

One logger, used everywhere. Never use `print()` in this project.

```python
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s — %(name)s — %(message)s")
logger = logging.getLogger("shifa")
```

### `backend/utils/validators.py`

Validate the incoming request before the pipeline runs.

```python
def validate_analyze_request(body):
    # urdu_text must not be empty
    # latitude must be between 20.0 and 40.0 (Pakistan bounds)
    # longitude must be between 60.0 and 80.0 (Pakistan bounds)
    # history must be a list — each dict must have "role" and "content" string keys
    # raise HTTPException(400, ...) if invalid
```

### `backend/tools/medicine_lookup.py`

Gemini calls this as a native function-call tool. It reads `medicines.json` and returns the medicine data for a given disease.

```python
import json
from pathlib import Path

MEDICINES_PATH = Path(__file__).parent.parent / "data" / "medicines.json"

def medicine_lookup(disease_name: str) -> dict:
    """
    Given a disease name, return safe OTC medicines, dosage, warnings.
    Falls back to a generic disclaimer if disease not found in JSON.
    """
    with open(MEDICINES_PATH) as f:
        db = json.load(f)

    entry = db.get(disease_name)
    if not entry:
        return {
            "medicines": [],
            "disclaimer_urdu": "براہ کرم ڈاکٹر سے ملیں۔ خود علاجی نہ کریں۔"
        }
    return entry
```

The function signature must match what your partner registers as a Gemini tool definition in `agents/orchestrator.py`. Coordinate with them on the exact parameter name and return shape.

### `backend/tools/places_search.py`

Gemini calls this as a native function-call tool. It calls Google Places API and returns the nearest hospitals.

```python
import httpx
from config.settings import settings

async def places_search(latitude: float, longitude: float) -> list[dict]:
    """
    Returns up to 3 nearest open hospitals to the given coordinates.
    Uses Google Places Nearby Search API.
    """
    url = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
    params = {
        "location": f"{latitude},{longitude}",
        "radius": 10000,          # 10km radius
        "type": "hospital",
        "key": settings.google_places_api_key,
    }
    async with httpx.AsyncClient() as client:
        response = await client.get(url, params=params)
        data = response.json()

    results = data.get("results", [])[:3]
    return [
        {
            "name": r["name"],
            "lat": r["geometry"]["location"]["lat"],
            "lng": r["geometry"]["location"]["lng"],
            "address": r.get("vicinity", ""),
            "distance_km": None   # compute from lat/lng if needed
        }
        for r in results
    ]
```

---

## Data Files — Your Most Important Work

### `backend/data/medicines.json`

Cover these 20 diseases. Structure each entry like this:

```json
{
  "Typhoid Fever": {
    "urdu_name": "ٹائیفائیڈ",
    "medicines": [
      {
        "name": "Panadol",
        "name_urdu": "پیناڈول",
        "dosage_urdu": "ہر 6 گھنٹے میں 1 گولی",
        "otc": true
      },
      {
        "name": "ORS",
        "name_urdu": "او آر ایس",
        "dosage_urdu": "ہر دست کے بعد 1 گلاس",
        "otc": true
      }
    ],
    "avoid_urdu": "باہر کا کھانا، کچا پانی",
    "see_doctor": true,
    "disclaimer_urdu": "یہ صرف عمومی معلومات ہے۔ ڈاکٹر سے ضرور ملیں۔"
  }
}
```

**20 diseases to cover:**
Common Cold, Influenza, Typhoid Fever, Dengue Fever, Malaria, Tuberculosis, Gastroenteritis, Food Poisoning, Hypertension, Diabetes Type 2, Chickenpox, Measles, Hepatitis A, Hepatitis B, Pneumonia, Bronchitis, Urinary Tract Infection, Conjunctivitis, Scabies, Anemia.

For diseases like TB and Hepatitis B — set `"medicines": []` and `"see_doctor": true`. Do not recommend OTC drugs for serious conditions.

### `backend/data/knowledge/` — RAG Documents

These 5 files are ingested into Qdrant by your partner's `rag/ingest.py` script. Write them clearly — the quality of the AI's diagnosis depends directly on these.

**`disease_symptoms_pakistan.txt`**
For each of the top 25 diseases common in Pakistan, write:
- Disease name (English + Urdu)
- Common symptoms in English AND colloquial Urdu
- Severity level (mild / moderate / severe)
- Emergency warning signs that require immediate hospital visit
- Affected demographic in Pakistan context

**`urdu_symptom_glossary.txt`**
A mapping of how patients actually speak vs medical terms:
```
بخار → fever
سر درد → headache
الٹی → vomiting
دست → diarrhea
کھانسی → cough
سانس پھولنا → shortness of breath
...
```
Include at least 60 colloquial Urdu phrases.

**`emergency_warning_signs.txt`**
A list of symptoms that always trigger the emergency override — regardless of disease. Examples:
- سینے میں شدید درد (severe chest pain)
- سانس نہ آنا (not breathing / difficulty breathing)
- بے ہوشی (loss of consciousness)
- منہ ٹیڑھا ہونا (facial drooping — stroke sign)
Include at least 20 emergency signs with both Urdu and English.

**`pakistan_medicines.txt`**
OTC medicines available at Pakistani pharmacies, what they treat, typical dosage, and any common brand names used locally (e.g. Panadol not Acetaminophen, Flagyl not Metronidazole).

**`who/`**
Download free WHO Pakistan factsheets from:
`https://www.emro.who.int/pak/` — get PDFs for Dengue, Malaria, TB, Hepatitis, Typhoid.

---

## Deployment — Railway

1. Push `backend/` to the repo
2. Connect Railway to the GitHub repo
3. Set all env vars in Railway dashboard
4. Set start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Set Python version: Railway reads `.python-version` — make sure it says `3.11.9`
6. Share the Railway URL with Zaheen (`https://your-app.railway.app`)

---

## Integration Points with Your Partner

| What | How |
|---|---|
| Your partner calls `run_pipeline(urdu_text, lat, lng, history)` | You pass all 4 args — don't forget `body.history` |
| Triage short-circuit response | Empty arrays for diseases/medicines/hospitals are valid — do not treat as an error |
| Gemini calls `medicine_lookup(disease_name)` | Your function in `tools/medicine_lookup.py` |
| Gemini calls `places_search(latitude, longitude)` | Your function in `tools/places_search.py` |
| RAG ingestion reads `data/knowledge/*.txt` | You write these files, partner runs `ingest.py` |
| `medicines.json` | You write it, partner's tool reads it |

Agree on the exact function signatures for `medicine_lookup` and `places_search` with your partner before either of you starts coding those files.

---

## Integration Checklist (Before You Say Done)

- [ ] `GET /health` returns `{"status": "ok"}`
- [ ] `POST /analyze` accepts `history: []` on first turn without errors
- [ ] `POST /analyze` accepts populated `history` array on subsequent turns
- [ ] `history` validated — each dict has `role` and `content` keys
- [ ] Full response shape returned correctly, including triage short-circuit responses
- [ ] CORS configured — Zaheen's Vercel URL can reach the backend
- [ ] `medicine_lookup` returns correct data for all 20 diseases
- [ ] `places_search` returns hospitals for Rawalpindi/Islamabad coordinates (test case)
- [ ] `medicines.json` covers all 20 diseases with Urdu fields
- [ ] All 5 knowledge documents written and in `data/knowledge/`
- [ ] WHO PDFs downloaded into `data/knowledge/who/`
- [ ] Railway deployed, URL shared with Zaheen
- [ ] `.env.example` committed with all 4 keys as empty strings

---

*Shifa | BanoQabil Hackathon 2026 | Sufiyan — Backend API + Tools + Data*

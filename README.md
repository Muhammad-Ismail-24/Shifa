# Shifa — Voice-First Urdu Healthcare Assistant

**BanoQabil Hackathon 2026**

Shifa is a voice-first, Urdu-language healthcare assistant for rural Pakistan. A patient speaks symptoms in natural Urdu and receives a probable diagnosis, safe OTC medicines, and directions to the nearest hospital — entirely in spoken Urdu.

## Setup Guide

### Prerequisites

- Python 3.11.9 (see `.python-version`)
- Node.js 18+
- A Qdrant Cloud account (free tier)
- Google Cloud project with Gemini API + Places API enabled

### Backend

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt
cp .env.example .env
# Fill in all keys in .env

uvicorn main:app --reload
```

### Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local
# Fill in VITE_API_URL and VITE_GOOGLE_MAPS_API_KEY

npm run dev
```

### RAG Ingestion (run once)

```bash
cd backend
python rag/ingest.py
```

This populates Qdrant Cloud with embeddings from `data/knowledge/`. Only needs to be run once.

## Environment Variables

| Variable | Where | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | backend/.env | All AI inference + embeddings |
| `GOOGLE_PLACES_API_KEY` | backend/.env | Nearest hospital search |
| `QDRANT_URL` | backend/.env | Qdrant Cloud endpoint |
| `QDRANT_API_KEY` | backend/.env | Qdrant Cloud auth |
| `VITE_API_URL` | frontend/.env.local | Railway backend URL |
| `VITE_GOOGLE_MAPS_API_KEY` | frontend/.env.local | Google Maps display |

## API Endpoints

```
POST /analyze
  Body:    { urdu_text: str, latitude: float, longitude: float }
  Returns: { diseases, medicines, hospitals, response_text_urdu, is_emergency, disclaimer_urdu }

GET  /health
  Returns: { status: "ok" }
```

## Demo Requirements

- Must demo on **Chrome** or **Edge** (Web Speech API support)
- Speak symptoms in Urdu — the assistant responds in spoken Urdu

*Shifa | BanoQabil Hackathon 2026*

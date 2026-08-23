# Shifa — Final Technical Report
**BanoQabil Hackathon 2026 | Build Phase Reference Document**

> This is the third and final context document. Read `architecture_decisions.md` for
> deep rationale. This file is your quick-reference during the build.

---

## 1. What We Are Building

**Shifa** is a voice-first, Urdu-language healthcare assistant for rural Pakistan.
A patient speaks symptoms in natural Urdu. The system responds — in spoken Urdu —
with a probable diagnosis, safe OTC medicines, and directions to the nearest hospital.
Zero literacy required. Zero English required.

### User Flow (Single Sentence Per Step)

```
1. SPEAK    Patient presses mic, speaks symptoms in Urdu
2. TRIAGE   Triage Agent evaluates input + history → enough context to proceed?
            → NO:  returns clarifying question in Urdu → frontend plays it → user replies → back to step 1
            → YES: continue
3. EXTRACT  Gemini extracts symptoms from natural Urdu speech
4. RETRIEVE RAG queries Qdrant → returns relevant medical context chunks
5. DIAGNOSE Gemini reasons over chunks → returns top 2–3 probable diseases
6. MEDICATE medicine_lookup tool → returns safe OTC medicines from medicines.json
7. LOCATE   places_search tool → Google Places API → nearest 3 open hospitals
8. RESPOND  Gemini composes full Urdu response → browser TTS speaks it aloud
```

If the Triage Agent determines the input is vague (e.g., "I have pain"), the pipeline
short-circuits immediately — returning a clarifying question in Urdu with empty arrays
for diseases, medicines, and hospitals. The extraction and RAG steps only run once the
Triage Agent confirms sufficient context exists.

If any input matches the emergency keyword list, the flow short-circuits:
skip all steps → immediately output `"فوری طور پر ہسپتال جائیں"` + red alert screen.

### Language Scope — MVP

| Language | Status | Notes |
|---|---|---|
| Urdu `ur-PK` | ✅ Day 1 | All voice input, all text output, all UI labels |
| Punjabi | 🔲 Phase 2 | Scoped out — not in demo |
| Sindhi / Pashto | 🔲 Phase 3 | Scoped out |

---

## 2. Confirmed Architecture

### Frontend

| Decision | Value |
|---|---|
| Framework | React 18 + Vite 5 + TypeScript |
| Styling | Tailwind CSS v3 — no UI library |
| Routing | React Router v6 |
| HTTP | Axios |
| Maps | Google Maps JavaScript API — loaded via script tag, not npm |
| Voice Input | `window.webkitSpeechRecognition` — lang `ur-PK` |
| Voice Output | `window.speechSynthesis` — lang `ur-PK` |
| Urdu Text | All Urdu elements use `dir="rtl"` + `font-family: Noto Nastaliq Urdu` |
| Deployment | Vercel — auto-deploy from `main` branch |

### Backend

| Decision | Value |
|---|---|
| Language | Python 3.11 — pinned via `.python-version` file |
| Framework | FastAPI + Uvicorn |
| Deployment | Railway (paid) — zero cold starts, always-on |
| Start command | `uvicorn main:app --host 0.0.0.0 --port $PORT` |
| State | **Stateless** — no session, no user data stored per request |
| Future storage | `database.py` wired to SQLite — boilerplate only, not active Day 1 |

### AI Orchestration

| Decision | Value |
|---|---|
| Model | `gemini-1.5-flash` — all reasoning and response composition |
| Embeddings | `text-embedding-004` — same API key, used during RAG ingestion |
| Tool calling | Gemini **native function calling** — structured, typed, reliable |
| Ambiguity handling | Multi-turn clarification loop before committing to diagnosis |
| Prompt templates | All system prompts live in `backend/config/prompts.py` — nowhere else |

### Medical Engine (RAG)

| Decision | Value |
|---|---|
| Approach | RAG — replaces ML model entirely |
| Vector store | **Qdrant Cloud** — persistent, always-on, free tier |
| Ingestion | One-time local script: `backend/data/rag/ingest.py` |
| Ingestion trigger | Run locally once → embeddings stored in Qdrant Cloud permanently |
| Runtime | FastAPI queries Qdrant on every `/analyze` request |
| Chunk size | 500 tokens, 50 token overlap |
| Top-K retrieval | 5 chunks per query |
| RAG documents | See Section 3 |

### Voice Layer

| Decision | Value |
|---|---|
| STT | Browser Web Speech API — `recognition.lang = 'ur-PK'` |
| TTS | Browser Speech Synthesis — `utterance.lang = 'ur-PK'` |
| Cost | Free — zero API calls for voice |
| Demo requirement | Must demo on Chrome or Edge |
| Upgrade path | Google Cloud TTS `ur-PK-Wavenet-A` — Day 3 if time allows |

### External APIs

| API | Purpose | Key variable |
|---|---|---|
| Google Gemini API | All AI inference + embeddings | `GEMINI_API_KEY` |
| Google Maps JS API | Interactive map display (frontend) | `VITE_GOOGLE_MAPS_API_KEY` |
| Google Places API | Nearest hospital search (backend tool) | `GOOGLE_PLACES_API_KEY` |
| Qdrant Cloud | Vector store for RAG | `QDRANT_URL` + `QDRANT_API_KEY` |

### Data Storage

| Layer | Technology | Active Day 1? |
|---|---|---|
| RAG knowledge | Qdrant Cloud (permanent) | ✅ Yes |
| Medicine fallback | `medicines.json` flat file | ✅ Yes |
| User sessions | None — stateless | ✅ N/A |
| Caching / logging | SQLite via `database.py` | 🔲 Boilerplate only |

---

## 3. RAG Knowledge Base

Five documents ingested into Qdrant. Written by the team or downloaded free.

| File | Content | Owner |
|---|---|---|
| `disease_symptoms_pakistan.txt` | Top 25 diseases — Urdu + English symptoms, severity, emergency signs | Person 1 |
| `urdu_symptom_glossary.txt` | Colloquial Urdu phrases → English medical terms | Person 1 |
| `emergency_warning_signs.txt` | Symptoms that always trigger emergency override | Person 1 |
| `pakistan_medicines.txt` | OTC medicines available in Pakistan per condition | Person 2 |
| `who_pakistan_*.pdf` | WHO Pakistan disease factsheets (downloaded free) | Person 2 |

`medicines.json` is separate — it feeds the `medicine_lookup` tool directly, no vector search.

---

## 4. API Surface

Two endpoints. That is all.

```
POST /analyze
  Body:    { urdu_text: str, latitude: float, longitude: float,
             history: list[dict] }   ← conversation history, empty list on first turn
  Returns: { diseases, medicines, hospitals,
             response_text_urdu, is_emergency, disclaimer_urdu }
           Note: when Triage Agent needs clarification, diseases/medicines/hospitals
           are empty arrays and response_text_urdu contains the Urdu question.

GET  /health
  Returns: { status: "ok" }
```

---

## 5. Environment Variables

```bash
# backend/.env
GEMINI_API_KEY=
GOOGLE_PLACES_API_KEY=
QDRANT_URL=
QDRANT_API_KEY=

# frontend/.env.local
VITE_API_URL=https://your-railway-url.railway.app
VITE_GOOGLE_MAPS_API_KEY=
```

---

## 6. Team Rules

1. All LLM prompts → `backend/config/prompts.py` — never inline
2. All API calls from frontend → `frontend/src/lib/api.ts` — never from components
3. All Urdu UI text uses `dir="rtl"` wrapper — no exceptions
4. Never commit `.env` or `.env.local` — `.env.example` only
5. Python version is **3.11** — not 3.12, not 3.14
6. Test every demo input before recording — know exactly what output you'll get

---

## 7. Project Folder Structure

```
Shifa/
│
├── .gitignore                        # node_modules, .venv, .env*, __pycache__, dist
├── .claudeignore                     # node_modules/, .venv/, .env*,
│                                     # dist/, __pycache__/, *.pyc, *.log, data/who/
├── .python-version                   # 3.11.9  ← Railway + local must match
├── README.md                         # Setup guide, how to run, env vars needed
│
├── frontend/
│   ├── index.html                    # Loads Google Maps script tag here
│   ├── vite.config.ts                # Proxy: /api → Railway backend URL
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   ├── postcss.config.js
│   ├── package.json
│   ├── .env.local                    # VITE_API_URL, VITE_GOOGLE_MAPS_API_KEY
│   │
│   └── src/
│       ├── main.tsx
│       ├── App.tsx                   # React Router — all route definitions
│       │
│       ├── pages/
│       │   ├── Home.tsx              # Voice button + symptom display
│       │   └── Results.tsx           # Disease cards + map + medicines
│       │
│       ├── components/
│       │   ├── VoiceButton.tsx       # Mic button, Web Speech API logic
│       │   ├── DiseaseCard.tsx       # Disease name + confidence + Urdu explanation
│       │   ├── MedicineCard.tsx      # Medicine list + disclaimer (always visible)
│       │   ├── HospitalMap.tsx       # Google Maps component + hospital markers
│       │   ├── EmergencyAlert.tsx    # Full-screen red alert for emergencies
│       │   └── UrduText.tsx          # RTL wrapper — all Urdu text goes through this
│       │
│       └── lib/
│           ├── api.ts                # All POST /analyze calls — nowhere else
│           ├── types.ts              # TypeScript interfaces for all API shapes
│           ├── speech.ts             # STT + TTS Web Speech API wrappers
│           └── utils.ts              # GPS helper, distance formatter, date utils
│
└── backend/
    ├── main.py                       # FastAPI app — registers /analyze + /health
    ├── requirements.txt              # All Python deps, pinned versions
    ├── database.py                   # SQLite boilerplate — not active Day 1
    ├── .env                          # All secrets — never committed
    ├── .env.example                  # All keys with empty values — committed
    │
    ├── config/
    │   ├── settings.py               # Loads all env vars via pydantic BaseSettings
    │   └── prompts.py                # ★ All Gemini system prompts live here only
    │
    ├── agents/
    │   ├── orchestrator.py           # Main pipeline: triage → extract → RAG → tools → compose
    │   ├── triage_agent.py           # Turn 1: evaluate history + input → proceed or clarify
    │   ├── symptom_extractor.py      # Turn 2: Urdu text → symptoms list
    │   ├── disease_identifier.py     # Turn 3: symptoms + RAG chunks → diseases
    │   └── response_composer.py      # Turn 6: all outputs → final Urdu response
    │
    ├── tools/
    │   ├── medicine_lookup.py        # Gemini function-call tool → medicines.json
    │   └── places_search.py          # Gemini function-call tool → Google Places API
    │
    ├── rag/
    │   ├── ingest.py                 # ★ Run once locally → populates Qdrant Cloud
    │   ├── embedder.py               # Gemini text-embedding-004 wrapper
    │   └── retriever.py              # query(text, k=5) → returns chunk strings
    │
    ├── data/
    │   ├── medicines.json            # Static OTC medicine fallback — 20 diseases
    │   └── knowledge/                # RAG source documents (ingested, then Qdrant-only)
    │       ├── disease_symptoms_pakistan.txt
    │       ├── urdu_symptom_glossary.txt
    │       ├── emergency_warning_signs.txt
    │       ├── pakistan_medicines.txt
    │       └── who/                  # Downloaded WHO Pakistan PDFs
    │
    └── utils/
        ├── logger.py                 # Centralised logging — never use print()
        └── validators.py             # Input sanitisation, GPS bounds check
```

---

*Shifa | BanoQabil Hackathon 2026 | Final — build starts now*

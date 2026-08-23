# Sehat Saathi — Architecture Decisions Document
## BanoQabil Hackathon 2026

> **Purpose:** This document is the single source of truth for every architectural
> decision made for Sehat Saathi. Every teammate must read this before writing
> a single line of code. If something here conflicts with what you think we
> should do — discuss first, then update this document. Do not deviate silently.

**Last Updated:** August 2026
**Status:** FINAL — Build Phase

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Decision: No ML Model — RAG Instead](#2-decision-no-ml-model--rag-instead)
3. [Decision: Voice Agent Approach](#3-decision-voice-agent-approach)
4. [Decision: MCP for Tool Calling](#4-decision-mcp-for-tool-calling)
5. [Decision: No Database](#5-decision-no-database)
6. [Decision: Gemini as Central Brain](#6-decision-gemini-as-central-brain)
7. [Decision: Chroma as Vector Store](#7-decision-chroma-as-vector-store)
8. [Decision: Frontend Stack](#8-decision-frontend-stack)
9. [Decision: Backend Stack](#9-decision-backend-stack)
10. [Decision: Deployment](#10-decision-deployment)
11. [All APIs — Details & Keys](#11-all-apis--details--keys)
12. [All Datasets & RAG Documents](#12-all-datasets--rag-documents)
13. [Complete Data Flow](#13-complete-data-flow)
14. [What We Are NOT Building](#14-what-we-are-not-building)
15. [Risk Register](#15-risk-register)

---

## 1. System Overview

Sehat Saathi is a **voice-first, Urdu-language healthcare assistant** for rural Pakistan.
A patient speaks their symptoms in Urdu. The system understands them, identifies
probable diseases, recommends safe medicines, and shows the nearest hospital — all
delivered back in spoken Urdu.

### The One-Line Architecture

```
Urdu Voice → Gemini Agent → RAG Knowledge Base + MCP Tools → Urdu Voice Response
```

### Full System Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        PATIENT (Rural Pakistan)                     │
│                    Speaks Urdu into a smartphone mic                │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      REACT FRONTEND (Vercel)                        │
│                                                                     │
│   ┌─────────────────────┐         ┌──────────────────────────────┐  │
│   │  Web Speech API     │         │  Google Maps JS Component    │  │
│   │  (ur-PK)            │         │  (shows hospital markers)    │  │
│   │                     │         │                              │  │
│   │  Input:  mic → text │         │  Input: GPS + hospital list  │  │
│   │  Output: text → TTS │         │  Output: interactive map     │  │
│   └──────────┬──────────┘         └──────────────────────────────┘  │
│              │                                                       │
│              │  POST /analyze                                        │
│              │  { urdu_text, latitude, longitude }                   │
└──────────────┼───────────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    FASTAPI BACKEND (Render.com)                     │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                  GEMINI 1.5 FLASH AGENT                      │   │
│  │                                                              │   │
│  │  Turn 1: Extract symptoms from Urdu text                     │   │
│  │          "bukhar, sir dard, body pain" → [fever, headache,   │   │
│  │           body_ache]                                         │   │
│  │                                                              │   │
│  │  Turn 2: Query RAG ──────────────────────────────────────►  │   │
│  │          "what conditions match these symptoms in            │   │
│  │           Pakistan?" ◄── top 5 relevant document chunks      │   │
│  │                                                              │   │
│  │  Turn 3: Call MCP Tool → medicine_lookup(disease)            │   │
│  │          Returns: safe OTC medicines + dosage + disclaimer   │   │
│  │                                                              │   │
│  │  Turn 4: Call MCP Tool → places_search(lat, lng, "hospital") │   │
│  │          Returns: 3 nearest hospitals with distance          │   │
│  │                                                              │   │
│  │  Turn 5: Compose final Urdu response combining all above     │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                    │                    │                            │
│                    ▼                    ▼                            │
│   ┌────────────────────────┐  ┌────────────────────────────────┐    │
│   │   RAG KNOWLEDGE BASE   │  │       MCP TOOL SERVER          │    │
│   │                        │  │                                │    │
│   │  Chroma vector store   │  │  Tool 1: medicine_lookup()     │    │
│   │  (runs in-process,     │  │  → reads medicines.json        │    │
│   │   no separate server)  │  │  → fallback: Gemini agent      │    │
│   │                        │  │                                │    │
│   │  Documents:            │  │  Tool 2: places_search()       │    │
│   │  - disease_guide.pdf   │  │  → Google Places API           │    │
│   │  - pakistan_health.pdf │  │  → returns hospitals nearby    │    │
│   │  - urdu_symptoms.txt   │  │                                │    │
│   │  - drap_medicines.pdf  │  └────────────────────────────────┘    │
│   │  - emergency_signs.txt │                                        │
│   └────────────────────────┘                                        │
│                                                                     │
│  Response: { diseases, explanation_urdu, medicines,                 │
│              hospitals, response_text_urdu, is_emergency }          │
└─────────────────────────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      FRONTEND RENDERS RESULTS                       │
│                                                                     │
│   • Disease name + explanation (Urdu text displayed, RTL)           │
│   • Medicine list with dosage + mandatory disclaimer                │
│   • Map with nearest 3 hospitals marked                             │
│   • TTS speaks the full Urdu response aloud                         │
│   • If emergency detected → RED alert, "Foran hospital jayein"      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Decision: No ML Model — RAG Instead

### Decision
We are **not** using a scikit-learn / Random Forest ML model for disease prediction.
We are using **RAG (Retrieval-Augmented Generation)** with Gemini.

### Why We Rejected the ML Model

| Problem | Detail |
|---|---|
| Hard ceiling of 41 diseases | The Kaggle dataset only has 41 diseases. A judge will ask about diabetes complications or dengue fever severity and the model will either give a wrong answer or fail silently |
| Requires exact symptom names | The model needs "skin_rash" not "daane ho rahe hain" — it cannot handle natural Urdu input without a complex translation layer |
| Not impressive to judges | Scikit-learn classifiers are a first-year data science exercise. Judges have seen hundreds. It adds complexity without adding wow factor |
| Binary symptom input is unrealistic | Real patients don't say yes/no to 41 symptoms. They describe how they feel in natural language |
| Extra build steps | Download dataset → train → pickle → load → serve. Four steps that can each fail on demo day |

### Why RAG is Better Here

| Benefit | Detail |
|---|---|
| Unlimited disease knowledge | The knowledge base can contain anything — rare diseases, Pakistan-specific conditions, seasonal outbreaks |
| Handles natural Urdu | Gemini reads the RAG context and reasons over it with full language understanding |
| Grounded answers | Responses are tied to actual documents — "according to WHO Pakistan guidelines..." — not hallucinated |
| Impressive to judges | Shows understanding of modern AI architecture beyond basic ML |
| Easy to explain | "We built a medical knowledge base and the AI searches it" is a clear, compelling demo story |
| Easier to build | No training step. Ingest documents once, query at runtime |

### How RAG Works in This System

```
Query: "bukhar, sir dard, ulti" (fever, headache, vomiting)
           │
           ▼
   Gemini translates to semantic query:
   "diseases causing fever headache vomiting Pakistan"
           │
           ▼
   Chroma searches vector store
   Returns top 5 most relevant document chunks:
   - Chunk from typhoid_guide.txt (high similarity)
   - Chunk from dengue_fever.txt (high similarity)
   - Chunk from malaria_pakistan.txt (medium similarity)
   - Chunk from viral_fever.txt (medium similarity)
   - Chunk from food_poisoning.txt (low similarity)
           │
           ▼
   Gemini reads all 5 chunks + original query
   Reasons: "Most likely typhoid or dengue given Pakistan context
             and symptom combination including fever + headache"
           │
           ▼
   Returns structured response with disease + explanation in Urdu
```

### RAG Implementation Choice
- **Library:** LangChain (standard, well-documented)
- **Vector Store:** Chroma (see Decision 7)
- **Embedding Model:** Gemini `text-embedding-004` (same API key, no extra cost)
- **Chunk Size:** 500 tokens, 50 token overlap
- **Top-K retrieval:** 5 chunks per query

---

## 3. Decision: Voice Agent Approach

### The Question
Should we use:
- A) Web Speech API (browser built-in)
- B) OpenAI Whisper (open source, local)
- C) Google Cloud Speech-to-Text API
- D) Gemini Native Audio input
- E) ElevenLabs / other voice AI service (Uplift option)

### Decision: Web Speech API for STT + Browser TTS for Output

We are using the **browser's built-in Web Speech API** for both input and output.

```javascript
// Input: Urdu speech → text
const recognition = new webkitSpeechRecognition();
recognition.lang = 'ur-PK';
recognition.continuous = false;
recognition.onresult = (e) => sendToBackend(e.results[0][0].transcript);
recognition.start();

// Output: text → Urdu speech
const speak = (text) => {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ur-PK';
  window.speechSynthesis.speak(utterance);
};
```

### Why We Chose Web Speech API

| Factor | Web Speech API | Whisper | Google STT | Gemini Audio |
|---|---|---|---|---|
| Setup time | 5 minutes | 4–5 hours | 3–4 hours | 3–4 hours |
| Cost | Free | Free (heavy) | Paid after tier | Paid after tier |
| Urdu quality | Good (Chrome) | Excellent | Excellent | Excellent |
| Works offline | No | Yes (after download) | No | No |
| Demo risk | Low | Medium (500MB model) | Low | Low |
| Extra API key | None | None | Yes | Same key |
| Backend needed | No | Yes | Yes | Yes |

**For a 4-day hackathon demo on Chrome, Web Speech API wins.** The quality difference is not visible to judges in a 2-minute demo.

### About "Uplift" Voice Services (ElevenLabs etc.)

**Uplift** means using a premium voice cloning / TTS service to make the spoken output sound more natural and human — like a real Urdu-speaking person rather than a robotic TTS voice.

**Should we use it?**

| Option | What it gives | Cost | Decision |
|---|---|---|---|
| Browser TTS (`ur-PK`) | Robotic but functional Urdu voice | Free | ✅ Use this |
| Google TTS API | Better quality, more natural | ~$4 per 1M chars | Optional upgrade |
| ElevenLabs | Human-quality voice cloning | $5/month starter | ❌ Skip for now |
| Azure Neural TTS (Urdu) | Very natural Urdu voice | Free tier available | ⭐ Upgrade if time allows |

**Decision:** Start with browser TTS. If we have time on Day 3, upgrade the output voice to **Google Cloud TTS** (`ur-IN-Wavenet-A` or `ur-PK-Wavenet-A`) — same Google account, same billing, much better Urdu voice quality. This upgrade takes 2 hours and is high-impact for judges because they'll actually hear the difference.

### Voice Flow in Detail

```
Patient speaks
     │
     ▼
Chrome Web Speech API (ur-PK)
     │ Urdu text transcript
     ▼
Frontend sends to backend: POST /analyze
{ urdu_text: "mujhe teen din se bukhar hai", lat: 33.68, lng: 73.04 }
     │
     ▼
Backend processes (see full flow in Section 13)
     │
     ▼
Returns: { response_text_urdu: "آپ کو غالباً ٹائیفائیڈ ہو سکتا ہے..." }
     │
     ▼
Frontend: window.speechSynthesis speaks response_text_urdu
Patient hears the answer in Urdu
```

### Emergency Voice Override

If `is_emergency: true` in the response:
- Skip the normal TTS response
- Immediately speak: **"فوری طور پر ہسپتال جائیں — یہ ایمرجنسی ہو سکتی ہے"**
- Display RED full-screen alert
- Show nearest emergency room prominently on map

---

## 4. Decision: MCP for Tool Calling

### Decision
We are using **MCP (Model Context Protocol)** for two specific tools that Gemini calls
during the agent pipeline. We are not using raw API calls inside the agent.

### What is MCP Here

MCP is the standard way to give an AI agent structured access to external tools.
Instead of Gemini generating free-form API call syntax, it calls a defined tool
with typed inputs and gets a typed output back. This makes the agent reliable.

### The Two MCP Tools We Are Building

#### Tool 1: `medicine_lookup`

```python
# What Gemini calls:
medicine_lookup(disease="Typhoid Fever", patient_age_group="adult")

# What it does internally:
# 1. Check medicines.json for this disease (instant, free)
# 2. If not found → call Gemini with medical system prompt (fallback)
# 3. Always append the mandatory Pakistani Urdu disclaimer

# What it returns:
{
  "medicines": [
    {"name": "Panadol", "urdu_name": "پیناڈول",
     "dosage": "1 گولی ہر 6 گھنٹے", "available": "pharmacy"},
    {"name": "ORS", "urdu_name": "او آر ایس",
     "dosage": "ہر دست کے بعد", "available": "pharmacy"}
  ],
  "avoid": ["تیکھا کھانا", "ٹھنڈا پانی"],
  "see_doctor": true,
  "disclaimer": "یہ صرف عمومی معلومات ہے۔ ڈاکٹر سے ضرور ملیں۔",
  "is_prescription_required": false
}
```

**Why MCP not direct Gemini call:** The disclaimer and `is_prescription_required`
flag are safety-critical. Wrapping them in a tool guarantees they are always
returned in a structured, testable way. A raw Gemini call might format them
differently each time.

#### Tool 2: `places_search`

```python
# What Gemini calls:
places_search(latitude=33.6844, longitude=73.0479,
              type="hospital", radius_km=5)

# What it does internally:
# 1. Calls Google Places API nearbySearch
# 2. Filters to open facilities if possible
# 3. Calculates distance from patient GPS
# 4. Returns top 3 sorted by distance

# What it returns:
{
  "facilities": [
    {
      "name": "Benazir Bhutto Hospital",
      "distance_km": 1.2,
      "address": "Murree Road, Rawalpindi",
      "phone": "+92-51-9281200",
      "maps_url": "https://maps.google.com/?q=...",
      "is_open": true
    }
  ],
  "searched_at": "2026-08-15T18:00:00Z"
}
```

**Why MCP not a direct frontend Maps call:** The agent needs to know about
hospitals to include them in the Urdu response. If we only call Maps from
the frontend, the agent cannot say "Benazir Bhutto Hospital sirf 1.2 km door
hai" in its spoken response.

### MCP Implementation

```python
# backend/mcp/tools.py
from mcp.server import FastMCP

mcp = FastMCP("sehat-saathi-tools")

@mcp.tool()
def medicine_lookup(disease: str, patient_age_group: str = "adult") -> dict:
    """Look up safe OTC medicines for a diagnosed condition in Pakistan."""
    # Implementation here
    pass

@mcp.tool()
def places_search(latitude: float, longitude: float,
                  type: str = "hospital", radius_km: int = 5) -> dict:
    """Find nearest healthcare facilities using Google Places API."""
    # Implementation here
    pass
```

### What We Are NOT Using MCP For
- Voice input/output — handled by browser directly
- RAG queries — LangChain handles this natively
- Response composition — Gemini does this as its final step
- Any internal backend logic

---

## 5. Decision: No Database

### Decision
**We are not using any database** — no PostgreSQL, no MongoDB, no Supabase,
no Firebase, no SQLite.

### Rationale

| What we need to store | How we store it | Why no DB needed |
|---|---|---|
| Disease-symptom knowledge | RAG documents in Chroma (files on disk) | Chroma persists to disk automatically |
| Medicine information | `data/medicines.json` (static file) | Never changes during runtime |
| Hospital locations | Google Places API (real-time) | No reason to cache for a hackathon |
| User sessions | None — stateless API | Each request is independent |
| Conversation history | Not needed | Single-turn: speak once, get answer |

### The medicines.json File

This is our only "database" — a flat JSON file checked into the repo:

```json
{
  "Typhoid Fever": {
    "urdu_name": "ٹائیفائیڈ",
    "medicines": ["Panadol", "ORS"],
    "prescription_needed": ["Antibiotics — doctor required"],
    "dosage_urdu": "پیناڈول: ہر 6 گھنٹے میں 1 گولی",
    "avoid_urdu": "باہر کا کھانا، کچا پانی",
    "warning_signs_urdu": ["تیز بخار جو 3 دن سے زیادہ", "پیٹ میں شدید درد"],
    "see_doctor": true
  },
  "Dengue Fever": { ... },
  "Malaria": { ... },
  "Common Cold": { ... }
}
```

Cover the top 20 most common diseases in Pakistan and the tool never needs
to call Gemini for medicine lookups — instant, free, offline-capable.

---

## 6. Decision: Gemini as Central Brain

### Decision
**Google Gemini 1.5 Flash** is our primary AI model for all intelligence tasks.

### Model Choices

| Task | Model | Why |
|---|---|---|
| Symptom extraction from Urdu | `gemini-1.5-flash` | Fast, cheap, good at structured extraction |
| RAG query + disease reasoning | `gemini-1.5-flash` | Good reasoning over retrieved context |
| Medicine advice (fallback) | `gemini-1.5-flash` | Medical system prompt works well |
| Urdu response composition | `gemini-1.5-flash` | Strong Urdu language output |
| Document embeddings for RAG | `text-embedding-004` | Gemini's embedding model, same API key |

We are **not** using `gemini-1.5-pro` for this project. Flash is fast enough,
costs less, and has a higher free-tier rate limit (15 req/min). Pro is only
necessary for complex multi-step reasoning tasks — ours is straightforward.

### Gemini API Rate Limits (Free Tier)

| Model | Requests/min | Tokens/day | Cost after free tier |
|---|---|---|---|
| gemini-1.5-flash | 15 | 1,000,000 | $0.075 per 1M input tokens |
| text-embedding-004 | 1,500 | Unlimited | $0.00002 per 1K chars |

**For a hackathon demo with 30–50 test calls, we will never hit the free tier limit.**

### Why Not Claude / GPT-4 / Other?

- This hackathon specifically asks teams to use Google Gemini API
- Gemini 1.5 Flash has native Urdu capability — strong enough for our needs
- `text-embedding-004` from the same API key means we don't need a separate
  embedding service

---

## 7. Decision: Chroma as Vector Store

### Decision
We are using **Chroma** as our vector database, running **in-process** inside the
FastAPI backend. No separate vector DB server.

### Why Chroma over Alternatives

| Option | Hosting | Setup | Cost | Decision |
|---|---|---|---|---|
| **Chroma** | In-process (our choice) | `pip install chromadb` | Free | ✅ Chosen |
| Qdrant | Separate Docker container | Docker required | Free | ❌ Too complex |
| Pinecone | Cloud service | Account + API key | Free tier | ❌ Extra account |
| FAISS | In-process | `pip install faiss-cpu` | Free | ❌ Less ergonomic |
| Weaviate | Separate server | Complex | Paid | ❌ Overkill |

### Why In-Process Matters

Running Chroma in-process means:
- No Docker needed on Render.com
- No separate service to deploy
- No network latency between FastAPI and vector store
- Chroma persists data to a folder on disk automatically
- On Render free tier, the folder persists between requests (same dyno)

```python
# This is all you need — no server, no setup
import chromadb

client = chromadb.PersistentClient(path="./chroma_data")
collection = client.get_or_create_collection("medical_knowledge")
```

### RAG Document Ingestion (Run Once at Startup)

```python
# backend/rag/ingest.py — runs on startup if collection is empty
def ingest_documents():
    docs = load_all_documents("backend/data/knowledge/")
    chunks = chunk_documents(docs, chunk_size=500, overlap=50)
    embeddings = embed_chunks(chunks)  # Gemini text-embedding-004
    collection.add(embeddings=embeddings, documents=chunks)
```

---

## 8. Decision: Frontend Stack

### Decision
**React 18 + Vite + TypeScript + Tailwind CSS**

### Confirmed Packages

```json
{
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.26.0",
    "axios": "^1.7.0"
  },
  "devDependencies": {
    "vite": "^5.4.0",
    "typescript": "^5.5.0",
    "tailwindcss": "^3.4.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0"
  }
}
```

**No extra UI library** (no MUI, no Ant Design, no shadcn). Tailwind only.
This keeps the bundle small and the UI fully in our control.

### Urdu / RTL Handling

Urdu is written right-to-left. All Urdu text components must use:

```tsx
// In any component displaying Urdu text
<div dir="rtl" lang="ur" className="font-urdu text-right">
  {urduText}
</div>
```

Add to `tailwind.config.ts`:
```js
fontFamily: {
  urdu: ['Noto Nastaliq Urdu', 'serif'],  // Google Font — import in index.html
}
```

### Google Maps Integration

The map component is loaded via script tag in `index.html`:
```html
<script async defer
  src="https://maps.googleapis.com/maps/api/js?key=YOUR_KEY&libraries=places">
</script>
```

It is **not** a React package. We use the global `google.maps` object directly
inside a `useEffect`. Do not install `@react-google-maps/api` — unnecessary
abstraction for what we need.

---

## 9. Decision: Backend Stack

### Decision
**Python 3.11 + FastAPI + Uvicorn**

### Confirmed Packages

```
fastapi==0.115.6
uvicorn==0.32.1
python-dotenv==1.0.1
pydantic==2.10.4
google-generativeai==0.8.3
langchain==0.3.0
langchain-google-genai==2.0.0
chromadb==0.5.0
mcp==1.0.0
httpx==0.28.1
```

**Python version must be 3.11.** Not 3.12, not 3.13, not 3.14.
`pydantic-core` and `grpcio` have no prebuilt wheels for Python 3.12+ on
Render's infrastructure and will fail to build. Add `.python-version` file
to repo root with content `3.11.9`.

### Single API Endpoint

The entire backend exposes one meaningful endpoint:

```
POST /analyze
Content-Type: application/json

{
  "urdu_text": "مجھے تین دن سے بخار ہے اور سر درد ہو رہا ہے",
  "latitude": 33.6844,
  "longitude": 73.0479
}

Response:
{
  "diseases": [
    {"name": "Typhoid Fever", "urdu_name": "ٹائیفائیڈ", "confidence": "high",
     "explanation_urdu": "آپ کی علامات ٹائیفائیڈ سے ملتی ہیں..."}
  ],
  "medicines": { ... },
  "hospitals": [ ... ],
  "response_text_urdu": "آپ کو غالباً ٹائیفائیڈ ہو سکتا ہے...",
  "is_emergency": false,
  "disclaimer_urdu": "یہ صرف عمومی معلومات ہے۔ ڈاکٹر سے ضرور ملیں۔"
}
```

Plus `GET /health` for deployment health checks.

---

## 10. Decision: Deployment

### Decision

| Part | Platform | Cost | URL |
|---|---|---|---|
| Frontend | Vercel | Free | `sehat-saathi.vercel.app` |
| Backend | Render.com | Free tier | `sehat-saathi-api.onrender.com` |
| Vector Store (Chroma) | Runs inside Render backend | Free | n/a |
| Maps + Places | Google Cloud | $200 free credit | n/a |
| Gemini API | Google AI Studio | Free tier | n/a |

### Critical Render Settings

```
Root Directory: backend
Build Command:  pip install -r requirements.txt
Start Command:  uvicorn main:app --host 0.0.0.0 --port $PORT
Python Version: 3.11.9  (set via .python-version file in repo root)
```

### Render Environment Variables to Set

Go to Render Dashboard → Your Service → Environment and add:

```
GEMINI_API_KEY         = (your key from aistudio.google.com)
GOOGLE_PLACES_API_KEY  = (your key from console.cloud.google.com)
```

### Vercel Environment Variables to Set

```
VITE_API_URL              = https://sehat-saathi-api.onrender.com
VITE_GOOGLE_MAPS_API_KEY  = (same Google Cloud key as above)
```

### Important: Render Free Tier Cold Start

Render free tier spins down after 15 minutes of inactivity. The backend takes
~30 seconds to wake up on the first request. **For the demo:** open the app
and click the mic button once 5 minutes before your demo slot to wake the
server. Do not do this live in front of judges.

---

## 11. All APIs — Details & Keys

### API 1: Google Gemini API

| Detail | Value |
|---|---|
| **Purpose** | Symptom extraction, disease reasoning over RAG, response composition in Urdu |
| **Models used** | `gemini-1.5-flash` (main), `text-embedding-004` (RAG embeddings) |
| **Where to get key** | [aistudio.google.com](https://aistudio.google.com) → Sign in → Get API Key |
| **Env variable** | `GEMINI_API_KEY` |
| **Free tier** | 15 requests/min, 1M tokens/day — plenty for demo |
| **Cost if exceeded** | $0.075 per 1M input tokens (flash) — negligible |
| **Restrictions needed** | None for development. For production: restrict to your server IP |
| **SDK** | `pip install google-generativeai` |

```python
# How we initialize it
import google.generativeai as genai
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
model = genai.GenerativeModel("gemini-1.5-flash")
```

---

### API 2: Google Maps JavaScript API

| Detail | Value |
|---|---|
| **Purpose** | Display interactive map with hospital markers in the frontend |
| **Where to get key** | [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials |
| **APIs to enable** | Maps JavaScript API, Places API (both in the same project) |
| **Env variable** | `VITE_GOOGLE_MAPS_API_KEY` (frontend) |
| **Free tier** | $200/month credit = ~28,000 map loads free per month |
| **Restrictions** | Restrict to your Vercel domain in production (HTTP referrer restriction) |
| **How to load** | Script tag in `index.html` — not an npm package |

```html
<!-- index.html -->
<script async defer
  src="https://maps.googleapis.com/maps/api/js
       ?key=%VITE_GOOGLE_MAPS_API_KEY%
       &libraries=places
       &language=ur">
</script>
```

**Important:** Set `language=ur` in the Maps script URL. This makes the map
labels and UI appear in Urdu automatically — impressive for judges.

---

### API 3: Google Places API

| Detail | Value |
|---|---|
| **Purpose** | Find nearest hospitals/clinics/pharmacies by GPS coordinate |
| **Where to get key** | Same key as Maps API — both enabled in the same Google Cloud project |
| **Env variable** | `GOOGLE_PLACES_API_KEY` (backend, for MCP tool server) |
| **Called from** | Backend MCP tool `places_search()` — not directly from frontend |
| **Free tier** | $200/month credit covers ~4,000 nearby search calls |
| **Endpoint used** | `nearbySearch` → type: `hospital`, `pharmacy`, `doctor` |

```python
# Backend MCP tool implementation
import httpx

async def places_search(latitude, longitude, type="hospital", radius_km=5):
    url = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
    params = {
        "location": f"{latitude},{longitude}",
        "radius": radius_km * 1000,
        "type": type,
        "key": os.getenv("GOOGLE_PLACES_API_KEY"),
        "language": "ur"  # results in Urdu where available
    }
    async with httpx.AsyncClient() as client:
        response = await client.get(url, params=params)
    return response.json()["results"][:3]  # top 3 only
```

---

### API 4: Web Speech API (Browser Built-in)

| Detail | Value |
|---|---|
| **Purpose** | Voice input (STT) and voice output (TTS) — no backend needed |
| **Where to get key** | No key needed — built into Chrome and Edge |
| **Cost** | Free |
| **Supported browsers** | Chrome (full), Edge (full), Firefox (partial — may not support ur-PK) |
| **Language code** | `ur-PK` for Pakistani Urdu |
| **Demo requirement** | Demo must be run on Chrome |

---

### API 5: Google Cloud TTS (Optional Upgrade — Day 3)

| Detail | Value |
|---|---|
| **Purpose** | Higher quality Urdu voice output — replaces browser TTS |
| **When to add** | Only if time allows on Day 3 |
| **Voice** | `ur-IN-Wavenet-A` or `ur-PK-Wavenet-A` |
| **Free tier** | 1M characters/month for WaveNet voices |
| **Impact** | High — judges will audibly notice the quality improvement |
| **Same key as Maps?** | No — enable Cloud Text-to-Speech API separately, same project |

---

## 12. All Datasets & RAG Documents

These are the documents we ingest into Chroma at startup.
All are free. No scraping, no APIs, no accounts needed.

### Document 1: `disease_symptoms_pakistan.txt`
**You write this.** A structured text file covering the top 25 most common
diseases in Pakistan with their Urdu names, English names, symptoms in both
languages, severity, and when to seek emergency care.

```
Format per disease:
DISEASE: Typhoid Fever
URDU_NAME: ٹائیفائیڈ بخار
SYMPTOMS_EN: sustained fever, headache, abdominal pain, loss of appetite
SYMPTOMS_UR: مسلسل بخار، سر درد، پیٹ میں درد، بھوک نہ لگنا
SEVERITY: Moderate — requires antibiotics, doctor visit mandatory
EMERGENCY_SIGNS: Fever above 103°F for 3+ days, severe abdominal pain, confusion
COMMON_IN_PAKISTAN: Yes — peak season July–September
---
```

**Time to write:** 3–4 hours. This is your most important document.
**Location:** `backend/data/knowledge/disease_symptoms_pakistan.txt`

---

### Document 2: `urdu_symptom_glossary.txt`
**You write this.** The secret weapon. A mapping of common Urdu/Pakistani
colloquial descriptions to their English medical equivalents.

```
chakkar aa rahe hain → dizziness, vertigo
sir bhaari hai → heaviness in head, pressure headache
bukhar → fever
sir dard → headache
khansee → cough
saans lene mein takleef → difficulty breathing, shortness of breath
ulti aa rahi hai → nausea, vomiting
pet mein dard → abdominal pain, stomach ache
thakaan → fatigue, weakness
aankhein peelay hona → jaundice, yellow eyes
daane nikal aaye hain → skin rash, eruptions
body dard → body ache, myalgia
gala kharab → sore throat, pharyngitis
naak band hai → nasal congestion, blocked nose
```

**Time to write:** 2 hours.
**Location:** `backend/data/knowledge/urdu_symptom_glossary.txt`
**This document is what makes our RAG work in Urdu.** Without it, a query
for "chakkar" would not find documents about "dizziness."

---

### Document 3: `emergency_warning_signs.txt`
**You write this.** A list of symptoms that ALWAYS trigger emergency routing
regardless of what else the agent decides.

```
IMMEDIATE EMERGENCY — GO TO HOSPITAL NOW:
- Chest pain (seene mein dard)
- Difficulty breathing (saans lene mein takleef)
- Loss of consciousness (behoshi)
- Seizures / fits (mirchhay aana)
- Severe bleeding (tez khoon bahna)
- Signs of stroke: face drooping, arm weakness, speech problems
- Fever above 104°F in a child under 5
- Severe allergic reaction (anaphylaxis)
- Signs of dengue shock: sudden drop in temperature + restlessness
```

**Location:** `backend/data/knowledge/emergency_warning_signs.txt`

---

### Document 4: `pakistan_common_medicines.txt`
**You write this.** OTC medicines available at Pakistani pharmacies for common
conditions. Based on DRAP-approved medicines list (publicly available at drap.org.pk).

```
CONDITION: Common Cold / Flu
MEDICINES:
- Panadol Cold & Flu (Paracetamol + Phenylephrine): 1 tablet every 6 hours
- Brufen (Ibuprofen): 1 tablet every 8 hours with food
- ORS (Oral Rehydration Salts): 1 sachet in 250ml water after each loose stool
AVOID: Cold drinks, oily food
SEE_DOCTOR_IF: Fever persists more than 3 days, breathing difficulty
---
CONDITION: Typhoid Fever
MEDICINES:
- Panadol for fever relief only: 1 tablet every 6 hours
- IMPORTANT: Antibiotics REQUIRED — cannot buy without prescription — see doctor
AVOID: Street food, unboiled water, raw vegetables
SEE_DOCTOR_IF: Any symptoms matching typhoid — always
---
```

**Location:** `backend/data/knowledge/pakistan_common_medicines.txt`

---

### Document 5: WHO Pakistan Health Factsheets (Download)
**Free PDFs from WHO.** Download these and add to the knowledge folder.

| Document | URL |
|---|---|
| WHO Pakistan Disease Burden | who.int/countries/pak → Country Documents |
| Dengue Fact Sheet | who.int/fact-sheets/detail/dengue-and-severe-dengue |
| Malaria Fact Sheet | who.int/fact-sheets/detail/malaria |
| Tuberculosis Pakistan | who.int/tb/country/data/download |
| Typhoid Fact Sheet | who.int/immunization/diseases/typhoid |

Download as PDF → place in `backend/data/knowledge/who/`
LangChain's `PyPDFLoader` will ingest them automatically.

---

### `medicines.json` (Static Fallback for MCP Tool)

This is separate from the RAG documents. It is a structured JSON that the
`medicine_lookup` MCP tool reads directly — no vector search needed.

```json
{
  "Typhoid Fever": {
    "urdu_name": "ٹائیفائیڈ",
    "medicines": [
      {"name": "Panadol", "urdu": "پیناڈول",
       "dosage_urdu": "ہر 6 گھنٹے میں 1 گولی", "otc": true},
      {"name": "ORS", "urdu": "او آر ایس",
       "dosage_urdu": "ہر دست کے بعد 1 گلاس", "otc": true}
    ],
    "prescription_note_urdu": "اینٹی بائیوٹک کے لیے ڈاکٹر سے ملنا ضروری ہے",
    "avoid_urdu": "باہر کا کھانا، کچا پانی، تیکھا کھانا",
    "warning_signs_urdu": [
      "3 دن سے زیادہ تیز بخار",
      "پیٹ میں شدید درد",
      "بے ہوشی یا کنفیوژن"
    ],
    "see_doctor": true,
    "disclaimer_urdu": "یہ صرف عمومی معلومات ہے۔ ڈاکٹر سے ضرور ملیں۔"
  }
}
```

Cover these 20 diseases in `medicines.json`:
Common Cold, Influenza, Typhoid Fever, Dengue Fever, Malaria, Tuberculosis,
Gastroenteritis, Food Poisoning, Hypertension, Diabetes Type 2,
Chickenpox, Measles, Hepatitis A, Hepatitis B, Pneumonia, Bronchitis,
Urinary Tract Infection, Conjunctivitis (Pink Eye), Scabies, Anemia.

---

## 13. Complete Data Flow

Step-by-step trace of a single patient request:

```
1. PATIENT speaks: "mujhe teen din se tez bukhar hai, sir dard
                    aur ulti bhi aa rahi hai"

2. BROWSER (Web Speech API, ur-PK):
   Converts speech → Urdu text string
   Stores GPS: { lat: 33.6844, lng: 73.0479 }

3. FRONTEND sends:
   POST https://sehat-saathi-api.onrender.com/analyze
   {
     "urdu_text": "مجھے تین دن سے تیز بخار ہے، سر درد اور الٹی بھی آ رہی ہے",
     "latitude": 33.6844,
     "longitude": 73.0479
   }

4. FASTAPI receives → starts Gemini agent pipeline

5. AGENT TURN 1 — Symptom Extraction:
   Gemini prompt: "Extract medical symptoms from this Urdu text.
                   Use the Urdu symptom glossary context.
                   Return JSON list of symptoms in English."
   RAG query: "tez bukhar sir dard ulti"
   RAG returns: chunks about fever+headache+vomiting diseases
   Gemini output: ["high_fever_3days", "headache", "vomiting", "nausea"]

6. AGENT TURN 2 — Disease Identification:
   Gemini prompt: "Given symptoms [high_fever_3days, headache, vomiting]
                   and the following medical context: {RAG chunks}
                   What are the most likely diseases in Pakistan context?"
   RAG query: "high fever headache vomiting Pakistan common disease"
   RAG returns: typhoid chunk (high score), dengue chunk (medium score),
                viral fever chunk (low score)
   Gemini output: [
     {"disease": "Typhoid Fever", "confidence": "high", "urdu": "ٹائیفائیڈ"},
     {"disease": "Dengue Fever", "confidence": "medium", "urdu": "ڈینگی"}
   ]

7. AGENT TURN 3 — Medicine Lookup (MCP Tool):
   Calls: medicine_lookup("Typhoid Fever")
   Tool reads: medicines.json → finds Typhoid entry
   Returns: Panadol + ORS + disclaimer + see_doctor: true

8. AGENT TURN 4 — Facility Search (MCP Tool):
   Calls: places_search(33.6844, 73.0479, "hospital")
   Tool calls: Google Places API
   Returns: [
     {"name": "Benazir Bhutto Hospital", "distance_km": 1.2, ...},
     {"name": "Holy Family Hospital", "distance_km": 2.8, ...}
   ]

9. AGENT TURN 5 — Urdu Response Composition:
   Gemini prompt: "Compose a clear, simple Urdu response for a rural patient.
                   Include: disease name, brief explanation, medicines with dosage,
                   nearest hospital. Use simple language, not medical jargon.
                   Always end with the safety disclaimer."
   Gemini output (Urdu):
   "آپ کی علامات ٹائیفائیڈ بخار کی طرف اشارہ کر رہی ہیں۔
    فوری طور پر ڈاکٹر سے ملیں۔ اس دوران پیناڈول لے سکتے ہیں
    اور ORS پیتے رہیں۔ آپ کے قریب Benazir Bhutto Hospital
    صرف 1.2 کلومیٹر دور ہے۔
    یہ صرف عمومی معلومات ہے — ڈاکٹر سے ضرور ملیں۔"

10. FASTAPI returns full response JSON to frontend

11. FRONTEND:
    - Displays disease cards in Urdu (RTL)
    - Displays medicine info + disclaimer
    - Renders Google Map with hospital markers
    - window.speechSynthesis speaks the Urdu response aloud
    - Patient hears the answer in their own language
```

---

## 14. What We Are NOT Building

To keep scope clear — these things are explicitly out of scope:

| Feature | Why we're not building it |
|---|---|
| User accounts / login | No database, stateless, not needed for demo |
| Conversation history | Single-turn: one question, one answer |
| Telemedicine / video call | Out of scope for 4-day hackathon |
| Offline mode | Would require service workers + offline model — too complex |
| Multi-language (Punjabi, Sindhi) | Urdu only for this version |
| Prescription drug recommendations | Safety and legal risk — hard-blocked in prompts |
| Appointment booking | No hospital API integration available for Pakistan |
| SMS alerts | Nice to have, but not in 4 days |
| Admin dashboard | Not needed for judging |

---

## 15. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Google Maps API key not approved in time | Low | High | Use static hospital JSON fallback (Rawalpindi/Lahore major hospitals hardcoded) |
| Web Speech API gives poor Urdu quality on demo device | Medium | High | Pre-type the demo input as a fallback text field; show it's also text-capable |
| Render cold start during demo | Medium | High | Wake server 5 minutes before demo slot by loading the app |
| Gemini rate limit hit during demo | Low | Medium | Rate: 15/min — we won't hit this. Emergency: cache last response |
| Chroma data lost between Render deploys | Medium | Medium | Re-ingest documents on startup if collection is empty (startup check) |
| RAG gives wrong disease in live demo | Low | High | Pre-run demo with known symptom inputs, verify output before judges |
| Internet failure on demo day | Low | Critical | Screen-record a backup demo video the night before |
| Urdu TTS sounds robotic | High | Low | Low impact — judges understand it's browser TTS; upgrade to Google TTS if time allows |

---

## Summary Table

| Area | Decision | Tool/Technology |
|---|---|---|
| Disease Intelligence | RAG over medical documents | LangChain + Chroma + Gemini |
| Voice Input | Browser STT | Web Speech API (ur-PK) |
| Voice Output | Browser TTS → upgrade to Google TTS | SpeechSynthesis / Cloud TTS |
| AI Brain | Gemini 1.5 Flash | google-generativeai SDK |
| Tool Calling | MCP (2 tools) | FastMCP library |
| Hospital Finding | Google Places API via MCP | Google Cloud Places API |
| Map Display | Google Maps JS | Maps JavaScript API |
| Vector Store | Chroma in-process | chromadb Python package |
| Medicine Data | Static JSON + Gemini fallback | medicines.json |
| Database | None | N/A |
| Frontend | React + Vite + TypeScript + Tailwind | Vercel |
| Backend | Python 3.11 + FastAPI | Render.com |
| API Keys needed | 2 total | Gemini API + Google Cloud |

---

*Document prepared for BanoQabil Hackathon 2026 — Sehat Saathi Team*
*All architectural decisions are final. Update this document if any decision changes.*

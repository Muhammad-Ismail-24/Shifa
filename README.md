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

## Landing Page (Voice Experience)

The landing page at `/` is the voice-first entry point. It is a React port of an
existing "liquid glass" reference design, with the static decorative waveform
replaced by a real audio-reactive renderer.

### Structure

```
frontend/src/
├── pages/Landing.tsx              # composition
├── components/landing/            # presentational pieces
│   ├── HeroEnvironment.tsx        # full-bleed background orb
│   ├── VoiceStatusCard.tsx        # refracting glass card = conversation state
│   ├── AudioWaveform.tsx          # canvas waveform
│   ├── GlassBackdrop.tsx          # viewport-aligned refraction layer
│   ├── VoiceCTA.tsx / HeroCopy.tsx / ShifaNav.tsx / MenuDrawer.tsx
│   └── cardCopy.ts                # all card strings, one place
└── voice/                         # behaviour
    ├── voiceState.ts              # state machine (the source of truth)
    ├── useVoiceSession.ts         # controller; owns every audio resource
    ├── audioEngine.ts             # AudioContext, mic + output analysers
    ├── voiceActivity.ts           # VAD with hysteresis
    ├── waveform.ts                # DSP + spline rendering
    ├── speechRecognition.ts       # Urdu STT (ur-PK)
    ├── shifaSpeech.ts             # Urdu TTS + output signal
    ├── shifaClient.ts             # ★ backend integration point
    ├── glassCardSync.ts           # refraction layer sync
    └── rafHub.ts                  # single shared frame loop
```

### Connecting the backend

The landing page runs in **mock mode** until a backend exists. Set `VITE_API_URL`
in `frontend/.env.local` and it switches to live `POST /analyze` — no code change
needed. Mock mode is confined to `shifaClient.ts` and only ever returns triage
clarification questions; it never produces a disease, medicine, or dosage.

Request/response types live in `frontend/src/lib/types.ts` and mirror the
documented Pydantic models. **Re-verify them against `backend/main.py` once it
exists** — that file is the Zaheen/Sufiyan contract and a mismatch there breaks
integration silently.

### Voice states

`idle → requesting-permission → listening → user-speaking → thinking → speaking
→ listening`, plus `interrupted` (barge-in), `error`, and `mic-denied`. Illegal
transitions are rejected by `voiceState.ts`, and every state has a path out, so
the UI cannot strand in `thinking`.

The microphone opens only on an explicit press of "Talk to Shifa" — never on load.

### Known limitation: the outgoing waveform

When Shifa speaks through **`window.speechSynthesis`** (the current MVP TTS), the
browser exposes no audio stream — there is no supported way to route it into an
`AnalyserNode`. The waveform therefore follows a real *envelope* derived from the
utterance's own `onboundary`/`onstart`/`onend` events: genuine TTS timing, but
not amplitude. `ShifaSpeech.signalKind` reports which is in use.

Supply `ShifaSpeech.audioUrlResolver` (e.g. a server TTS endpoint returning a URL
or Blob) and playback moves to an `<audio>` element wired through a real
`AnalyserNode`, making the waveform truly sample-accurate. That path is built and
lifecycle-safe; it just needs a provider.

### Asset licensing — action required before production

`HeroEnvironment.tsx` defaults to the background clip **from the reference
project's CDN** (`d8j0ntlcm91z4.cloudfront.net/...`). It is retained so visual
fidelity can be verified during development.

**Shifa has no established right to use this asset.** Before shipping, either
confirm licensing or replace it: set `VITE_HERO_VIDEO_URL`, or drop a file in
`frontend/public/` and point the variable at it. The source is configurable
precisely so this swap is a one-line change.

Note the element sets `crossOrigin="anonymous"`; any replacement host must send
permissive CORS headers or the refraction canvas taints and the glass goes blank
(the code falls back to a frosted panel rather than breaking).

### Development

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
npm test           # state machine, VAD, waveform DSP
npm run typecheck
```

In dev only, `?state=<voice-state>` pins the card to one state for visual review
(e.g. `?state=thinking`). This is stripped from production builds.

## Demo Requirements

- Must demo on **Chrome** or **Edge** (Web Speech API support)
- Speak symptoms in Urdu — the assistant responds in spoken Urdu

*Shifa | BanoQabil Hackathon 2026*

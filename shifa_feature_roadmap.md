# Shifa — Full Feature Build Roadmap
**BanoQabil Hackathon 2026 | 32 Features, Prioritized by Impact & Build Order**

Nothing below is built yet — this is the complete backlog (your original 12 brainstormed features + the 20 new ideas), reorganized into a build order. Tiers reflect **what to build first**, not category. Within each tier, features are roughly ordered by impact-to-effort ratio.

**Effort scale:** Low = hours, reuses existing infra · Medium = half a day, new endpoint/table · High = a full day+, new external integration or complex logic
**Impact scale:** How much it changes the demo narrative or judge scoring — not just "is it cool."

---

## How This Roadmap Works

- **Tier 0** is not optional — it's the actual product. Nothing else functions without it.
- **Tier 1** is where your "wow factor" lives. Build these once Tier 0's `/analyze` endpoint is stable and returning real data.
- **Tier 2** adds depth and breadth — worth building if Tier 0 + Tier 1 are demo-ready with time to spare.
- **Tier 3** is genuinely valuable but either high-effort, dependent on external approvals (e.g. WhatsApp Business verification lag), or lower urgency for a 2-minute demo. Treat as stretch goals or "roadmap slide" material if you run out of time.

---

## Tier 0 — Foundation (Build First, No Exceptions)

Everything else in this document calls into or depends on this core pipeline. Build and stabilize this before touching anything else.

### 0.1 Real-Time Urdu Voice I/O
- **Concept & Flow:** Patient presses mic, speaks symptoms in natural Urdu; system responds with spoken Urdu.
- **Technical Implementation:** `window.webkitSpeechRecognition` (STT) and `window.speechSynthesis` (TTS), both set to `lang = 'ur-PK'`, wrapped in `speech.ts`.
- **Pitch / Wow Factor:** This *is* the product's core promise — zero literacy, zero English. Demo opens and closes on this working flawlessly.
- **Impact:** Critical · **Effort:** Medium (Web Speech API quirks across browsers)

### 0.2 Multi-Turn Triage Clarification Loop
- **Concept & Flow:** Triage Agent evaluates input + history; if too vague ("I have pain"), returns a clarifying Urdu question with empty result arrays instead of guessing.
- **Technical Implementation:** `triage_agent.py` runs before extraction/RAG; short-circuits the pipeline on insufficient context, per your documented orchestrator flow.
- **Pitch / Wow Factor:** Shows engineering maturity — the AI knows what it doesn't know, rather than hallucinating a diagnosis from one word.
- **Impact:** Critical · **Effort:** Medium

### 0.3 RAG-Grounded Disease Reasoning & Emergency Override
- **Concept & Flow:** Symptoms are matched against Qdrant-retrieved medical chunks to produce top 2–3 probable diseases; any emergency keyword match short-circuits straight to a red alert screen.
- **Technical Implementation:** Qdrant Cloud + `text-embedding-004` for retrieval; `disease_identifier.py` reasons over top-5 chunks; a static emergency keyword list gates the whole pipeline.
- **Pitch / Wow Factor:** The safety-critical heart of the app — judges in health-tech specifically probe for exactly this kind of override logic.
- **Impact:** Critical · **Effort:** High

### 0.4 Structured OTC Medicine Recommendations
- **Concept & Flow:** Once diagnosed, `medicine_lookup` returns safe OTC medicines from `medicines.json`, always shown with a visible safety disclaimer.
- **Technical Implementation:** Gemini native function calling → `medicine_lookup.py` → static JSON lookup, no vector search needed.
- **Pitch / Wow Factor:** Makes the app immediately actionable, not just informative.
- **Impact:** Critical · **Effort:** Low

### 0.5 Interactive Hospital Map
- **Concept & Flow:** After diagnosis, the nearest 3 open hospitals are shown on an interactive map.
- **Technical Implementation:** `places_search.py` tool → Google Places API → Google Maps JavaScript API rendering markers in `HospitalMap.tsx`.
- **Pitch / Wow Factor:** Closes the loop from "what's wrong" to "where do I go" — a complete care journey in one screen.
- **Impact:** Critical · **Effort:** Medium

---

## Tier 1 — Build Next (Highest Impact-to-Effort Ratio)

Build these immediately after Tier 0 is stable. This tier is where most of your demo's "wow" moments should come from — each is either low-effort-high-impact or directly reuses Tier 0 infrastructure.

| # | Feature | Impact | Effort |
|---|---|---|---|
| 1.1 | Visual Pill/Prescription Scanner | High | Low |
| 1.2 | Automated Emergency SOS Dispatch | High | Low |
| 1.3 | Clinical Handoff QR Code (SOAP Note) | High | Low |
| 1.4 | Confidence & Evidence Panel | High | Low |
| 1.5 | Body Map Symptom Visualizer | Medium | Low |
| 1.6 | Pictogram Symptom Picker | Medium | Low |
| 1.7 | Roman-Urdu SMS Triage Fallback | High | Medium |
| 1.8 | WhatsApp Voice-Note Bot | High | Medium |
| 1.9 | Counterfeit/Expiry Medicine Checker | Medium | Low |
| 1.10 | Regional Language Auto-Expansion | High | Low |

### 1.1 Visual Pill/Prescription Scanner
- **Concept & Flow:** Patient photographs a medicine strip; the app identifies it and explains its use aloud in Urdu.
- **Technical Implementation:** Image payload from React → FastAPI → Gemini 1.5 Flash multimodal vision call → cross-reference `pakistan_medicines.txt` → browser TTS speaks the Urdu explanation ("Yeh Panadol hai, bukhar ke liye hoti hai").
- **Pitch / Wow Factor:** Solves a massive illiteracy problem instantly using cutting-edge vision AI — one of your strongest single demo moments.
- **Impact:** High · **Effort:** Low (reuses Gemini call pattern already in your stack)

### 1.2 Automated Emergency SOS Dispatch
- **Concept & Flow:** When `is_emergency` is true, an SMS auto-fires to a pre-registered family member with a location link.
- **Technical Implementation:** Twilio SMS API endpoint in FastAPI, triggered directly off the existing `is_emergency` boolean in `AnalyzeResponse`.
- **Pitch / Wow Factor:** Transforms the app from a chatbot into an active safety net — a single boolean check turns into a life-saving automation.
- **Impact:** High · **Effort:** Low (Tier 0 already produces the trigger condition)

### 1.3 Clinical Handoff QR Code (SOAP Note)
- **Concept & Flow:** While the app speaks a simple Urdu response to the patient, the backend simultaneously generates a structured English SOAP note; the frontend renders it as a QR code a hospital doctor can scan.
- **Technical Implementation:** A second Gemini prompt (parallel to `response_composer.py`) formats the same conversation into Subjective/Objective/Assessment/Plan; a QR-code React library renders the note (or a link to it) on screen.
- **Pitch / Wow Factor:** Bridges the illiterate-patient/doctor gap in one scan — a visually strong, easy-to-explain "before and after" demo beat.
- **Impact:** High · **Effort:** Low

### 1.4 Confidence & Evidence Panel
- **Concept & Flow:** Tapping "Yeh kyun?" (Why?) on a disease card reveals a confidence score and the RAG source snippet behind it.
- **Technical Implementation:** Return `retrieved_chunks` + similarity scores from Qdrant alongside `diseases`; expandable cards in `DiseaseCard.tsx`.
- **Pitch / Wow Factor:** Explainable AI is a strong judge signal — turns your RAG pipeline into a visible trust feature almost for free, since the data already exists in Tier 0.
- **Impact:** High · **Effort:** Low

### 1.5 Body Map Symptom Visualizer
- **Concept & Flow:** An SVG human silhouette highlights the affected body region as symptoms are extracted.
- **Technical Implementation:** `symptom_extractor.py` also outputs a `body_region` enum; mapped to highlighted SVG `<path>` fills.
- **Pitch / Wow Factor:** Near-zero backend cost, high screen appeal for non-literate users who can "see" their diagnosis.
- **Impact:** Medium · **Effort:** Low

### 1.6 Pictogram Symptom Picker
- **Concept & Flow:** A tap-only icon grid (fever, pain, cough, vomiting) for users who can't or won't speak.
- **Technical Implementation:** Icon taps map to pre-written Urdu phrases injected directly as `urdu_text` into `/analyze` — no STT required.
- **Pitch / Wow Factor:** Closes an accessibility gap in a pure voice-first design with one extra screen.
- **Impact:** Medium · **Effort:** Low

### 1.7 Roman-Urdu SMS Triage Fallback
- **Concept & Flow:** Feature-phone users without a browser or voice capability can text symptoms in Roman Urdu and receive a text response.
- **Technical Implementation:** Twilio SMS webhook → FastAPI → same `/analyze` pipeline (Gemini handles Roman-Urdu text fine) → SMS reply.
- **Pitch / Wow Factor:** Extends the entire product to feature phones, a huge chunk of the target demographic, with minimal new backend logic.
- **Impact:** High · **Effort:** Medium

### 1.8 WhatsApp Voice-Note Bot
- **Concept & Flow:** Patients send voice notes directly to a WhatsApp Business number, bypassing the web app entirely.
- **Technical Implementation:** WhatsApp Business API (via Twilio or Meta Cloud API) receives audio → transcribe/forward to `/analyze` → reply with text or a TTS audio note.
- **Pitch / Wow Factor:** Meets users on the platform they already live in — this alone can be a headline demo feature.
- **Impact:** High · **Effort:** Medium (WhatsApp Business API setup/verification can eat time — start this early)

### 1.9 Counterfeit/Expiry Medicine Checker
- **Concept & Flow:** Extends the pill scanner to flag expired or recalled medicine batches.
- **Technical Implementation:** Same Gemini Vision call as 1.1, with an added prompt to extract batch/expiry and check against a small `recalled_batches.json`.
- **Pitch / Wow Factor:** Reframes an existing feature as a safety tool for a well-known, serious Pakistani public-health problem — cheap add-on with a strong narrative.
- **Impact:** Medium · **Effort:** Low (depends on 1.1 existing)

### 1.10 Regional Language Auto-Expansion (Punjabi/Pashto Toggle)
- **Concept & Flow:** A toggle switches STT/TTS and prompts to Punjabi or Pashto, proving the architecture generalizes beyond Urdu.
- **Technical Implementation:** Parameterize `prompts.py` by language code; swap `recognition.lang`/`utterance.lang`; Gemini handles translation reasoning natively.
- **Pitch / Wow Factor:** Directly answers your own roadmap's "Phase 2/3" languages live in the demo, for very little extra build time.
- **Impact:** High · **Effort:** Low

---

## Tier 2 — Strong Additions If Time Allows

Build these once Tier 1 is demo-ready. Each adds real depth but is either a new data store, a new external integration, or scheduled/background logic — more moving parts than Tier 1.

| # | Feature | Impact | Effort |
|---|---|---|---|
| 2.1 | Live Disease Geo-Heatmap Dashboard | High | Medium |
| 2.2 | Automated Recovery Check-In Reminders | Medium | Medium |
| 2.3 | Drug Interaction & Allergy Guard | Medium | Medium |
| 2.4 | Facebook Messenger Bot | Medium | Medium |
| 2.5 | Lady Health Worker (LHW) Companion Mode | High | Medium |
| 2.6 | Verified Doctor & Clinic Directory | Medium | Low |
| 2.7 | Outbreak Proximity Alerts | High | Medium |
| 2.8 | WhatsApp Health Myth Debunker | Medium | Low |
| 2.9 | Anonymous District Health Census | Medium | Low |
| 2.10 | Daily Health Streak & Points | Low | Low |

### 2.1 Live Disease Geo-Heatmap Dashboard
- **Concept & Flow:** Diagnosed diseases + anonymized GPS are logged and rendered as a real-time outbreak cluster map for public health officials.
- **Technical Implementation:** Log each diagnosis + coordinates to Supabase; a separate dashboard view renders density clusters (e.g. via a heatmap layer on Google Maps or a charting library).
- **Pitch / Wow Factor:** Reframes the app from "patient tool" to "public health infrastructure" — a strong second audience for judges to consider.
- **Impact:** High · **Effort:** Medium

### 2.2 Automated Recovery Check-In Reminders
- **Concept & Flow:** After a triage session, the app follows up (SMS/WhatsApp) to check whether the patient recovered or worsened.
- **Technical Implementation:** A scheduled job (APScheduler or Supabase cron) checks sessions past their expected recovery window and fires a follow-up via existing Twilio integration.
- **Pitch / Wow Factor:** Shows the product cares about outcomes, not just the initial interaction — closes the loop on care.
- **Impact:** Medium · **Effort:** Medium

### 2.3 Drug Interaction & Allergy Guard
- **Concept & Flow:** Cross-checks recommended OTC meds against previously mentioned allergies/current medications before displaying them.
- **Technical Implementation:** Extend `medicine_lookup.py` to accept allergy/med history parsed from `history`; filter against a small interaction table in `medicines.json`.
- **Pitch / Wow Factor:** A genuine safety feature that shows clinical rigor beyond the happy-path demo.
- **Impact:** Medium · **Effort:** Medium

### 2.4 Facebook Messenger Bot
- **Concept & Flow:** Parallel bot integration for users on Messenger rather than WhatsApp.
- **Technical Implementation:** Meta Messenger Platform webhook, mirroring the WhatsApp bot's logic (1.8) against the same `/analyze` endpoint.
- **Pitch / Wow Factor:** Broadens platform reach — largely a copy of 1.8's integration pattern once that's built.
- **Impact:** Medium · **Effort:** Medium (mostly Meta app review/setup overhead)

### 2.5 Lady Health Worker (LHW) Companion Mode
- **Concept & Flow:** A batch-entry mode lets one LHW triage 5–10 patients back-to-back during a single household visit.
- **Technical Implementation:** A queue-based `LHWMode.tsx` UI storing multiple pending submissions, firing sequentially to `/analyze`, tagged with a household ID.
- **Pitch / Wow Factor:** Plugs directly into Pakistan's real ~100,000-strong LHW program — instantly credible to judges familiar with public health delivery.
- **Impact:** High · **Effort:** Medium

### 2.6 Verified Doctor & Clinic Directory
- **Concept & Flow:** A searchable directory of verified local doctors by specialty/distance, with click-to-call.
- **Technical Implementation:** Seed a small Supabase table with manually-entered PMDC-verified doctors; `GET /doctors?lat&lng` endpoint.
- **Pitch / Wow Factor:** Cheap to build, closes the "what happens after the app" question judges often ask.
- **Impact:** Medium · **Effort:** Low

### 2.7 Outbreak Proximity Alerts
- **Concept & Flow:** Push notifications ("3 dengue cases near you this week") to users near a detected disease cluster.
- **Technical Implementation:** Scheduled FastAPI job scanning the Supabase disease-location table for density spikes; fires WhatsApp/SMS alerts to opted-in users in the geofence.
- **Pitch / Wow Factor:** Turns the passive heatmap (2.1) into an active, life-saving push feature.
- **Impact:** High · **Effort:** Medium (depends on 2.1)

### 2.8 WhatsApp Health Myth Debunker
- **Concept & Flow:** Users forward viral health myths to the bot, which fact-checks them against the RAG knowledge base in Urdu.
- **Technical Implementation:** Reuses the WhatsApp bot webhook (1.8); a `myth_check` intent routes to Gemini + Qdrant instead of the triage pipeline.
- **Pitch / Wow Factor:** Health misinformation is highly visible on Pakistani WhatsApp — an instantly relatable feature reusing infra you already built.
- **Impact:** Medium · **Effort:** Low (depends on 1.8)

### 2.9 Anonymous District Health Census
- **Concept & Flow:** A public-facing dashboard aggregating anonymized symptom/disease data by district for NGOs/government resource planning.
- **Technical Implementation:** A read-only `GET /public/stats?district=` endpoint querying the same Supabase table as the heatmap, aggregated server-side.
- **Pitch / Wow Factor:** Elevates the pitch from "hackathon demo" to "policy tool" for judges evaluating real-world deployability.
- **Impact:** Medium · **Effort:** Low (depends on 2.1)

### 2.10 Daily Health Streak & Points
- **Concept & Flow:** Light gamification rewarding daily symptom-free check-ins or completed recovery steps with a streak counter.
- **Technical Implementation:** A `streaks` counter in Supabase incremented per check-in (reuses 2.2's logic); a React `<CircularProgress>` component.
- **Pitch / Wow Factor:** Cheap, visually snappy, demoable in 10 seconds — but lower substantive impact than most of this tier.
- **Impact:** Low · **Effort:** Low

---

## Tier 3 — Stretch Goals / Post-Hackathon Roadmap

High value, but each carries real friction: heavier build time, external approvals with unpredictable lead times, or dependencies on data you don't have yet. Good "roadmap slide" material even if not built.

| # | Feature | Impact | Effort | Friction |
|---|---|---|---|---|
| 3.1 | IVR Phone-Call Triage | High | High | Twilio Voice setup + carrier testing |
| 3.2 | One-Tap Teleconsult Escalation | High | High | Needs real on-call volunteer doctors |
| 3.3 | Chronic Condition Trend Tracker | Medium | Medium | Needs multi-session real user data |
| 3.4 | Nearby Pharmacy Stock & Price Radar | Medium | High | Needs crowd-sourced data you won't have by demo day |
| 3.5 | Vaccination & Maternal Care Reminder Engine | High | Medium | Needs EPI schedule data modeling |
| 3.6 | Family Health Vault | Medium | Medium | New data model, privacy considerations |
| 3.7 | AI-Generated Health Comic Explainers | Medium | Medium | Needs a set of pre-made illustration templates |
| 3.8 | Seasonal Risk Forecaster | Low | Low | Low effort but low urgency for a live demo |

*(Full descriptions for Tier 3 available on request — omitted here to keep the active build list focused.)*

---

## Suggested Build Order (Condensed)

```
Day 1        → Tier 0 (0.1–0.5) — the entire /analyze pipeline must work end-to-end
Day 2 AM     → Tier 1 items 1.1–1.6 (self-contained, no external API approval lag)
Day 2 PM     → Tier 1 items 1.7–1.10 (start WhatsApp/Twilio setup early — approval lag risk)
Day 3 AM     → Tier 2 items 2.1, 2.5, 2.6 (heatmap + LHW mode + doctor directory)
Day 3 PM     → Tier 2 items 2.3, 2.8, 2.9 (if time) + polish, demo script, test every input
Stretch      → Tier 3, only if ahead of schedule
```

**Key risk to flag early:** Any feature touching WhatsApp Business API or Meta Messenger (1.8, 2.4, 2.8) can require account verification that takes longer than expected — start that setup on Day 1 in parallel with Tier 0, even though you won't build the bot logic until Tier 1/2.

---

*Shifa | BanoQabil Hackathon 2026 | Prioritized Build Roadmap*

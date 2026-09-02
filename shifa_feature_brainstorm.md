# Shifa — Feature Brainstorm & Roadmap
**BanoQabil Hackathon 2026**

This document consolidates every feature discussed for Shifa: the **core pipeline already built**, the features **already scoped/built** on top of it, and **20 new feature ideas** proposed for further differentiation. Organized by category for easy reference during build planning and pitch prep.

---

## Part A — Already Built / Already Scoped (Do Not Duplicate)

These are locked in as of the final architecture doc. Listed here for completeness so the new ideas below can be evaluated against what already exists.

### Core Pipeline
1. **Real-Time Urdu Voice I/O** — Web Speech API STT/TTS, `ur-PK`, fully voice-first, zero literacy required.
2. **Multi-Turn Triage Clarification Loop** — Triage Agent decides if input is specific enough before running extraction/RAG; short-circuits with a clarifying Urdu question otherwise.
3. **RAG-Grounded Disease Reasoning & Emergency Override** — Qdrant Cloud retrieval over 5 medical documents; hard-coded emergency keyword list short-circuits to a red alert screen.
4. **Structured OTC Medicine Recommendations** — `medicine_lookup` tool reads `medicines.json`, always paired with a safety disclaimer.
5. **Interactive Hospital Map** — `places_search` tool + Google Places API surfaces nearest 3 open hospitals on a Google Maps view.

### Social & Messaging Integrations
6. **WhatsApp Voice-Note Bot** — Patients send voice notes to a WhatsApp Business number, bypassing the browser entirely.
7. **Facebook Messenger Bot** — Parallel integration for users on basic data packages who default to Messenger.
8. **Automated Emergency SOS Dispatch** — When `is_emergency` is true, a Twilio SMS auto-fires to a pre-registered family member with a Google Maps location link.

### Doctor & Pharmacy Ecosystem
9. **Visual Pill / Prescription Scanner** — Gemini 1.5 Flash Vision reads a photographed medicine strip, cross-references `pakistan_medicines.txt`, and speaks the identification aloud in Urdu.
10. **Clinical Handoff QR Code** — Backend generates a structured English SOAP note (Subjective/Objective/Assessment/Plan) in parallel with the patient-facing Urdu response; frontend renders it as a scannable QR code for hospital doctors.

### Public Health & Safety
11. **Live Disease Geo-Heatmap** — Diagnosed conditions + anonymized GPS logged to Supabase, rendered as a real-time outbreak cluster map for public health officials.
12. **Roman-Urdu SMS Triage Fallback** — Text-based triage for feature phones with no internet/voice capability.
13. **Automated Recovery Check-In Reminders** — Scheduled follow-ups after a triage session to track patient recovery.

---

## Part B — 20 New Feature Ideas

### Category 1: Clinical Triage & AI Diagnostics

#### 1. Confidence & Evidence Panel
- **Concept & Flow:** Instead of a black-box diagnosis, the patient (or an accompanying literate family member) can tap "Yeh kyun?" (Why?) on a disease card to see a confidence bar and the actual RAG source snippet that supports it, translated to simple Urdu.
- **Technical Implementation:** Return `retrieved_chunks` + similarity scores from Qdrant alongside `diseases` in the `/analyze` response; React renders expandable cards in `DiseaseCard.tsx`.
- **Pitch / Wow Factor:** Explainable AI is a huge judge favorite — it turns your RAG pipeline from an invisible backend detail into a visible trust and transparency feature.

#### 2. Body Map Symptom Visualizer
- **Concept & Flow:** As Gemini extracts symptoms, an SVG human silhouette highlights the affected region (chest, stomach, head) in real time on the results screen.
- **Technical Implementation:** Prompt `symptom_extractor.py` to also output a `body_region` enum; map it to highlighted `<path>` fills in a static SVG React component.
- **Pitch / Wow Factor:** Purely visual, near-zero backend cost, huge screen appeal for non-literate users who can "see" their own diagnosis instead of reading it.

#### 3. Drug Interaction & Allergy Guard
- **Concept & Flow:** Before showing OTC meds, the system cross-checks against any previously mentioned allergies or current medications in the conversation history and flags conflicts.
- **Technical Implementation:** Extend `medicine_lookup.py` to accept `known_allergies`/`current_meds` parsed from `history`; filter against a small interaction rules table added to `medicines.json`.
- **Pitch / Wow Factor:** A genuine patient-safety feature that shows the team thought past the happy-path demo into real clinical risk.

#### 4. Chronic Condition Trend Tracker
- **Concept & Flow:** For repeat users managing diabetes or hypertension, the app plots symptom severity or self-reported readings across sessions as a simple trend line.
- **Technical Implementation:** Opt-in, phone-number-keyed records via Supabase or the currently-boilerplate `database.py`; Recharts line chart rendered on `Results.tsx`.
- **Pitch / Wow Factor:** Converts a one-shot triage tool into a longitudinal care companion — strong "beyond MVP" narrative for judges.

---

### Category 2: Accessibility & Regional Inclusivity

#### 5. IVR Phone-Call Triage (No Smartphone Needed)
- **Concept & Flow:** A user without a smartphone dials a phone number, speaks symptoms after a beep, and hears the same Urdu triage response — no app or internet required on their end.
- **Technical Implementation:** Twilio Voice with `<Gather input="speech" language="ur-PK">`, forwarding the transcript to the existing `/analyze` endpoint, then reading the response back via Twilio `<Say>` or a pre-recorded TTS clip.
- **Pitch / Wow Factor:** Directly demolishes the "rural users don't have smartphones" objection — dial a number live on stage and get a spoken answer.

#### 6. Pictogram Symptom Picker (No-Speech Fallback)
- **Concept & Flow:** For users who are non-verbal, hearing-impaired, or too unwell to speak, a tap-only grid of icons (fever, pain, cough, vomiting) feeds directly into the pipeline.
- **Technical Implementation:** A React icon grid maps each tap to a pre-written Urdu symptom phrase, injected as `urdu_text` straight into `/analyze` — no STT involved.
- **Pitch / Wow Factor:** One extra screen closes an accessibility gap that a pure voice-first design otherwise misses entirely.

#### 7. Lady Health Worker (LHW) Companion Mode
- **Concept & Flow:** Pakistan's ~100,000-strong Lady Health Worker program visits households directly. A simplified batch-entry mode lets one LHW triage 5–10 patients back-to-back during a single village visit.
- **Technical Implementation:** A queue-based `LHWMode.tsx` UI storing multiple pending submissions, firing them sequentially to `/analyze`, each tagged with a household ID.
- **Pitch / Wow Factor:** Plugs directly into Pakistan's real existing health infrastructure — instantly recognizable to any judge familiar with public health delivery.

#### 8. Regional Language Auto-Expansion (Punjabi/Pashto Toggle)
- **Concept & Flow:** A single toggle switches STT/TTS language and system prompts to Punjabi or Pashto, proving the architecture isn't hard-locked to Urdu.
- **Technical Implementation:** Parameterize `prompts.py` templates by language code; swap `recognition.lang`/`utterance.lang`; Gemini handles translation reasoning natively without new RAG ingestion.
- **Pitch / Wow Factor:** Directly answers the project's own "Phase 2/3" roadmap live in the demo, showing scalability with almost no extra build time.

---

### Category 3: Doctor & Pharmacy Ecosystem

#### 9. Nearby Pharmacy Stock & Price Radar
- **Concept & Flow:** Beyond hospitals, the app shows which nearby pharmacies likely stock the recommended OTC medicine, plus an estimated price range crowd-sourced from prior users.
- **Technical Implementation:** Extend `places_search.py` to also query `type=pharmacy`; log user-reported "found it here" pins to Supabase to build a simple crowd stock map.
- **Pitch / Wow Factor:** Solves the very real "the diagnosis is useless if the pharmacy doesn't have the medicine" problem in rural Pakistan.

#### 10. One-Tap Teleconsult Escalation
- **Concept & Flow:** When Triage Agent confidence is low, or the user explicitly asks to speak to a doctor, the app offers an instant video call to a volunteer/on-call physician.
- **Technical Implementation:** Embed a Jitsi Meet iframe with a dynamically generated room link; backend notifies an on-call doctor list via Twilio SMS/WhatsApp with the QR SOAP note pre-attached.
- **Pitch / Wow Factor:** Demonstrates a clear human-in-the-loop safety net — something judges evaluating AI-in-healthcare specifically look for.

#### 11. Verified Doctor & Clinic Directory
- **Concept & Flow:** A simple searchable directory (by specialty/distance) of verified local doctors and clinics, with click-to-call.
- **Technical Implementation:** Seed a small Supabase table with manually-entered PMDC-verified doctors near demo coordinates; simple FastAPI `GET /doctors?lat&lng` endpoint.
- **Pitch / Wow Factor:** Cheap to build and rounds out the "what happens after the app" story judges always ask about.

#### 12. Counterfeit/Expiry Medicine Checker
- **Concept & Flow:** Extends the existing pill scanner — photographing the batch number/expiry date on a strip flags whether it's expired or matches a known DRAP counterfeit alert.
- **Technical Implementation:** Reuse the same multimodal Gemini call as the pill scanner, adding a prompt instruction to extract batch/expiry text and compare against a small `recalled_batches.json`.
- **Pitch / Wow Factor:** Counterfeit medicine is a documented, serious problem in Pakistan — reframes the existing vision feature as a safety tool, not just a label reader.

---

### Category 4: Gamification & Preventive Care

#### 13. Family Health Vault (QR-Linked Household Profile)
- **Concept & Flow:** One QR code per family links to a shared, lightweight health record — who's diabetic, who's pregnant, allergy lists — useful when large rural households seek care together.
- **Technical Implementation:** A `families` table in Supabase keyed by a generated household ID; the QR encodes a URL to a read-only summary page.
- **Pitch / Wow Factor:** Extends the existing QR/SOAP tech into a second, emotionally resonant use case — protecting the whole family, not just one patient.

#### 14. Vaccination & Maternal Care Reminder Engine
- **Concept & Flow:** Opt-in reminders for child vaccination schedules or antenatal checkups, sent via WhatsApp/SMS, tailored to Pakistan's EPI (Expanded Programme on Immunization) schedule.
- **Technical Implementation:** A cron-style FastAPI background job (or `APScheduler`) checking due dates against a `patients` table, firing via the existing Twilio integration.
- **Pitch / Wow Factor:** Directly targets Pakistan's persistently low child-vaccination and maternal mortality rates — a strong public-health impact story.

#### 15. Daily Health Streak & Points
- **Concept & Flow:** Light gamification — users earn a streak/points for daily symptom-free check-ins or completing a recommended recovery step, shown as a progress ring.
- **Technical Implementation:** A `streaks` counter in Supabase incremented per completed check-in (reusing the existing recovery check-in logic); a React `<CircularProgress>` component.
- **Pitch / Wow Factor:** Cheap, visually snappy, and demoable in 10 seconds on stage.

#### 16. AI-Generated Health Comic Explainers
- **Concept & Flow:** For common conditions (dehydration, diabetes basics), Gemini generates a short 4-panel Urdu comic-strip explanation instead of dense text.
- **Technical Implementation:** Gemini generates panel captions in Urdu; pair with a small fixed set of pre-made illustrated templates selected by condition category — no image-generation model required.
- **Pitch / Wow Factor:** Visually distinctive in a demo reel and directly targets the project's stated 45–55% literacy constraint with a genuinely novel format.

---

### Category 5: Public Health & Safety

#### 17. Outbreak Proximity Alerts
- **Concept & Flow:** Building on the existing geo-heatmap, push a "3 dengue cases reported near you this week" notification with prevention advice to users within a detected cluster's radius.
- **Technical Implementation:** A scheduled FastAPI job scanning the Supabase disease-location table for density spikes (simple radius/count threshold), firing WhatsApp/SMS alerts to opted-in users in that geofence.
- **Pitch / Wow Factor:** Turns the passive surveillance dashboard into an active, life-saving push feature — a natural "part 2" to the existing heatmap.

#### 18. Seasonal Risk Forecaster
- **Concept & Flow:** Cross-references month/season and region against historical disease patterns in the RAG corpus to proactively warn users (e.g., "Monsoon season — dengue and waterborne disease risk is high in your area").
- **Technical Implementation:** A lightweight rules/RAG lookup (`season + district → common risks`) surfaced as a banner on the Home screen, generated via a one-time Gemini pass over the WHO/disease documents.
- **Pitch / Wow Factor:** Shows the AI being proactive rather than purely reactive — a differentiator rarely seen in triage-bot demos.

#### 19. WhatsApp Health Myth Debunker
- **Concept & Flow:** Users forward a viral WhatsApp health myth or voice note (e.g., "garlic cures corona") to the bot, which fact-checks it against the RAG knowledge base in plain Urdu.
- **Technical Implementation:** Reuses the existing WhatsApp bot webhook; a dedicated `myth_check` intent routed to Gemini + Qdrant instead of the triage pipeline.
- **Pitch / Wow Factor:** Health misinformation is a huge, visible problem in Pakistan's WhatsApp culture — an instantly relatable feature that reuses infrastructure already being built.

#### 20. Anonymous District Health Census
- **Concept & Flow:** Aggregates fully anonymized symptom/disease data by district into a public-facing dashboard usable by NGOs or government for resource planning — no individual data ever exposed.
- **Technical Implementation:** A read-only aggregation endpoint (`GET /public/stats?district=`) querying the same Supabase table as the heatmap, grouped and counted server-side before reaching the frontend.
- **Pitch / Wow Factor:** Elevates the project from "hackathon demo" to "policy tool" — strong for judges evaluating real-world deployability and government partnership potential.

---

## Summary Table

| # | Feature | Category | Build Effort |
|---|---|---|---|
| 1 | Confidence & Evidence Panel | Clinical Triage & AI Diagnostics | Low |
| 2 | Body Map Symptom Visualizer | Clinical Triage & AI Diagnostics | Low |
| 3 | Drug Interaction & Allergy Guard | Clinical Triage & AI Diagnostics | Medium |
| 4 | Chronic Condition Trend Tracker | Clinical Triage & AI Diagnostics | Medium |
| 5 | IVR Phone-Call Triage | Accessibility & Regional Inclusivity | Medium |
| 6 | Pictogram Symptom Picker | Accessibility & Regional Inclusivity | Low |
| 7 | LHW Companion Mode | Accessibility & Regional Inclusivity | Medium |
| 8 | Regional Language Auto-Expansion | Accessibility & Regional Inclusivity | Low |
| 9 | Nearby Pharmacy Stock & Price Radar | Doctor & Pharmacy Ecosystem | Medium |
| 10 | One-Tap Teleconsult Escalation | Doctor & Pharmacy Ecosystem | Medium |
| 11 | Verified Doctor & Clinic Directory | Doctor & Pharmacy Ecosystem | Low |
| 12 | Counterfeit/Expiry Medicine Checker | Doctor & Pharmacy Ecosystem | Low |
| 13 | Family Health Vault | Gamification & Preventive Care | Medium |
| 14 | Vaccination & Maternal Care Reminders | Gamification & Preventive Care | Medium |
| 15 | Daily Health Streak & Points | Gamification & Preventive Care | Low |
| 16 | AI-Generated Health Comic Explainers | Gamification & Preventive Care | Medium |
| 17 | Outbreak Proximity Alerts | Public Health & Safety | Medium |
| 18 | Seasonal Risk Forecaster | Public Health & Safety | Low |
| 19 | WhatsApp Health Myth Debunker | Public Health & Safety | Low |
| 20 | Anonymous District Health Census | Public Health & Safety | Low |

---

*Shifa | BanoQabil Hackathon 2026 | Feature Brainstorm Reference*

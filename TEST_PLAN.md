# Shifa — Test Plan

## Architecture note — why there are two phases

**Phase A is the latency-critical path.** `POST /analyze` runs triage, symptom
extraction, disease identification and response composition, then returns. It
carries everything the patient hears: the Urdu reply, the emergency flag, the
diagnosis. Nothing slow is allowed onto this path.

**Phase B is asynchronous enrichment.** The medicine lookup and the nearby-care
search are the two slowest calls in the pipeline and neither is needed to answer
the patient. `/analyze` starts them as a background task, returns a
`session_id`, and the client collects the result from `GET /results/{id}` once
the reply is already on screen. The two lookups run concurrently and fail
independently — one erroring never costs the patient the other.

**Phase B state is process-local and in memory.** Sessions live in one Python
dict inside one event loop (`backend/session_store.py`), with a 15-minute TTL
and a 500-entry cap.

> **Deployment constraint:** run exactly one worker and one instance.
> With `--workers 2`, `POST /analyze` lands on worker 1 while
> `GET /results/{id}` round-robins to worker 2, which has never heard of the
> session and answers 404 — Phase B enrichment silently disappears for roughly
> (workers−1)/workers of all consultations. Multi-worker or multi-instance
> deployment requires shared session storage (Redis, or a row keyed by
> `session_id`) before it is safe. That is a deliberate future change, not a
> config flag.

Losing sessions on restart is by design: they are worth seconds, and a restart
costs the patient one extra turn, never data.

**Statuses, not empty lists.** Phase B reports `medicines_status` and
`hospitals_status` (`ok` / `failed` / `expired`) alongside the data. "No
medicine for this condition" and "we could not find out" are different
statements to make to someone who is ill, and the UI must never render the
second as the first.

---

Manual acceptance tests for the unified conversational dashboard and the
two-phase backend. Run against a live backend unless a scenario says otherwise.

**Timings assume a warm backend.** T+0 is the moment the send button is tapped
or the recogniser returns a final transcript. The T+2s marks depend on model
latency; treat them as "the reply arrives before the patient wonders whether the
app is broken", not as a stopwatch assertion. What is non-negotiable at every
mark is the *state*: which controls are live, what is on screen, and what is not.

**Setup**

```bash
cd backend && uvicorn main:app --reload
```

```bash
cd frontend && npm run dev
```

`frontend/.env.local` must set `VITE_API_URL` to the backend origin, and that
origin's browser-facing domain must appear in the backend's `ALLOWED_ORIGINS`
(or in its `CORS_ORIGINS` env var). Without `VITE_API_URL` the API layer refuses
to call out and every turn ends in the error bubble — that is the configuration
being wrong, not scenario 1 failing.

---

## Scenario 1 — Vague input (triage clarification)

**Input:** `مجھے تکلیف ہے` — typed, then send.

| Time | Expected |
| --- | --- |
| T+0.5s | User bubble right-aligned and dark; loading bubble (three dots) left-aligned; text field cleared and disabled; mic disabled; send button shows a spinner |
| T+2s | Loading bubble replaced by the clarification question; question spoken aloud in Urdu; text field, mic and send all re-enabled; focus back in the text field |
| T+5s | Results panel still absent from the DOM; `history` holds exactly 2 entries (user + assistant) |

**Pass:** the patient can type or press the mic immediately at T+2s without any
extra tap, and the next request carries both history entries.

**Fail:** results panel appears; input stays disabled; the question is shown but
not spoken; history is empty on the follow-up request.

---

## Scenario 2 — Complete input (full pipeline)

**Input:** `مجھے دو دن سے بخار ہے اور سر میں درد ہے`

| Time | Expected |
| --- | --- |
| T+0.5s | User bubble and loading bubble both visible; input bar disabled |
| T+2s | AI reply bubble visible and spoken; results panel appears; `DiseaseCard`s fade in (stagger 80ms apart); `MedicineCard` fades in at +200ms showing a skeleton, not "no medicine can be suggested" |
| T+5s | Phase B has landed: `MedicineCard` lists real medicines, "Care nearby" and the map faded in at +400ms |

**Pass:** all of it happens on `/` — the URL never changes, the chat stays put,
and scrolling the results panel does not move the conversation.

**Fail:** a navigation occurs; the results panel appears before the reply
bubble; `MedicineCard` claims no medicines while Phase B is still in flight.

**Network check (devtools):** exactly one `POST /analyze` followed by exactly one
`GET /results/<uuid>`. More than one GET means polling crept back in.

---

## Scenario 3 — Emergency input

**Input:** `سینے میں شدید درد ہے سانس نہیں آ رہا`

| Time | Expected |
| --- | --- |
| T+0.5s | User bubble and loading bubble; input bar disabled |
| T+2s | Full-screen red `EmergencyAlert` overlay; `فوری طور پر ہسپتال جائیں` spoken; "Call Rescue 1122" and "Dismiss" both reachable |

**Pass:** no disease, medicine or hospital card is rendered behind or after the
overlay. Escape or "Dismiss" returns to the conversation with the transcript
intact.

**Fail:** the results panel renders under the overlay; two voices speak at once
(the overlay speaks — the page must not also call `speakUrdu` on this turn).

---

## Scenario 4 — Mic toggle

**Actions:**
1. Click the mic. It turns green and pulses; `aria-pressed="true"`.
2. Start speaking. Partial transcript appears in the text field.
3. Click the mic again *before* finishing the sentence.

**Pass:** recording stops, the button returns to grey, and **nothing is
submitted** — the partial text stays in the field for the patient to edit or
send by hand. No `POST /analyze` fires.

**Also check:** letting an utterance finish naturally *does* auto-submit once,
and the mic turns itself off as it does. Two submissions from one utterance is a
failure.

**Browsers without `SpeechRecognition` (Firefox, Safari):** the mic renders
disabled with a "please type" tooltip; the text path still works.

---

## Scenario 5 — Vercel SPA routes

**Action:** deploy, open `/about`, then hard-refresh the browser. Repeat for
`/scanner` and a URL that does not exist.

**Pass:** `/about` and `/scanner` render their pages on refresh, not a Vercel
404. The unknown URL renders Shifa's own `NotFound` page — that one is React
Router answering, which is the proof the rewrite reached `index.html`.

**Depends on:** `frontend/vercel.json`. If the Vercel project root is the repo
root rather than `frontend/`, this file has to move with it.

---

## Scenario 6 — Pill Scanner

**Action:** open `/scanner`, upload or capture an image, identify it.

**Pass:** hero background, nav and menu match `/`; every panel uses the same
`backdrop-blur-md bg-white/10 border-white/20 rounded-2xl` glass; the page
scrolls to the disclaimer at the bottom without the whole app scrolling; the
Urdu explanation is right-to-left and spoken aloud.

**Fail:** the old white card on grey; content cut off with no way to scroll to
it; the menu's Home link missing.

---

## Scenario 7 — Mobile layout (390px)

**Action:** view `/` at 390×844, run scenario 2.

**Pass:**
- Single column: chat first, results below.
- Before the first message, the input bar sits at the *bottom* of the viewport,
  not floating mid-screen.
- The input bar stays stuck to the bottom while the page scrolls.
- Text field, mic and send are all reachable and at least 44px tall.
- The page never scrolls horizontally; the map and hospital list stay inside
  their card.

---

## Regression checks

| Check | How |
| --- | --- |
| No dead `/results` route | Visiting `/results` renders `NotFound`, not a blank screen |
| Multi-turn history | Scenario 1 then scenario 2 in one session — the second request body carries 2 history entries |
| Phase B failure degrades quietly | Stop the backend after the reply lands; the results panel keeps the disease cards and shows no error |
| Expired session | `GET /results/<random-uuid>` returns 404; the UI shows disease cards and an empty medicine list, no error bubble |
| Typecheck and unit tests | `npm run typecheck && npm test` in `frontend/` |

---

## Automated tests

```bash
cd backend && pytest          # 47 tests — needs Python 3.10+ (the code uses `X | None`)
```

```bash
cd frontend && npm run typecheck && npm test && npm run build
```

The backend suite stubs `google-generativeai`, `google-genai` and
`qdrant-client` in `tests/conftest.py`: they are only reached through code the
tests deliberately replace, and importing the real ones would require API keys,
a vector database and a network. Everything asserted on is real application
code.

| File | Covers |
| --- | --- |
| `backend/tests/test_session_store.py` | Lifecycle, expiry, capacity, cancellation, concurrency, shutdown |
| `backend/tests/test_phase_b.py` | The full partial/total failure matrix, and that the lookups really run in parallel |
| `backend/tests/test_endpoints.py` | Two-phase handshake, emergency short-circuit, every `/results` outcome, CORS parsing |
| `frontend/src/pages/Home.test.tsx` | Stale-enrichment races, emergency authority, Phase B states, geolocation independence, voice double-submit |

---

## Regression scenarios added in the hardening pass

These are the failures found and fixed while auditing the two-phase
implementation. Each one is covered by an automated test; re-run them by hand
after any change to the submit path or the session store.

### R1 — Stale enrichment must never attach to a later consultation

1. Ask something that yields a diagnosis (A). While its "Suggested relief"
   card is still a skeleton, ask a different question (B).
2. Let A's Phase B resolve after B's results are on screen.

**Pass:** B's diagnosis keeps B's medicines. A's medicines never appear, and
A's arrival does not clear B's loading skeleton.
**Why it matters:** attaching A's treatment to B's diagnosis shows a patient a
medicine for a condition they were never told they have.

### R2 — Emergency clears prior findings

Run a normal consultation, then an emergency one.

**Pass:** the red overlay is the only thing on screen; no disease or medicine
card from the earlier turn remains underneath it, and a late Phase B from that
earlier turn cannot re-populate the panel behind the overlay.

### R3 — Phase B partial failure

With the medicine lookup failing and the places search succeeding (and the
reverse):

**Pass:** the successful half still renders. The failed half says *"we could
not look this up"*, never *"there is no medicine"* or an empty "Care nearby".

### R4 — Expired session

Fetch `GET /results/<random-uuid>`.

**Pass:** 404 from the backend; the UI shows "these results were not kept, ask
again", and the disease cards from Phase A stay on screen.

### R5 — Geolocation never blocks a consultation

Deny the location prompt, or ignore it entirely.

**Pass:** the consultation completes at full speed. When the fallback location
was used, the "Care nearby" card says the list is based on an approximate
location — it must not imply those hospitals are near the patient.

### R6 — Mic cannot submit twice

1. Toggle the mic on, speak, toggle it off mid-sentence → nothing is sent; the
   partial text stays in the field.
2. Toggle the mic on, then type and press send → exactly one request, and the
   still-live recogniser cannot fire a second one.
3. Let one utterance complete → exactly one request, and the mic turns itself
   off.

### R7 — Single-worker assumption

Start the backend with `--workers 2`, run a consultation, and watch
`GET /results/{id}`.

**Expected to FAIL with a 404.** This is the documented limit of the in-memory
session store, not a bug to work around in the client. If this scenario ever
needs to pass, the store must move to shared storage first.

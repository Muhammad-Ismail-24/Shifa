"""
Short-lived in-memory store for the two-phase /analyze response.

Phase A (POST /analyze) returns the conversational reply immediately and kicks
off the slow lookups — medicines and nearby hospitals — as a background task.
Phase B (GET /results/{session_id}) awaits that task.

═══════════════════════════════════════════════════════════════════════════
DEPLOYMENT CONSTRAINT — THIS STORE IS PROCESS-LOCAL
═══════════════════════════════════════════════════════════════════════════
Sessions live in this process's memory and in this process's event loop. That
makes the deployment single-instance and single-worker by construction:

  * uvicorn/gunicorn MUST run with one worker (no `--workers 2`, and no
    horizontally scaled replicas behind a load balancer).
  * With more than one worker, POST /analyze lands on worker 1 while
    GET /results/{id} round-robins to worker 2, which has never heard of the
    session and answers 404. Phase B enrichment then silently disappears for
    roughly (workers-1)/workers of all consultations.

Moving to multiple workers or instances requires shared session storage
(Redis, or a database row keyed by session_id). That is a deliberate future
change — see the architecture note in TEST_PLAN.md.

Losing these entries on restart is fine by design: they are worth seconds, and
a restart costs the patient one extra consultation turn, never data.
═══════════════════════════════════════════════════════════════════════════

Concurrency notes
-----------------
Every function here runs on the single asyncio event loop, and none of them
awaits in the middle of a read-modify-write on `_sessions` (`await_results`
re-reads nothing across its await). That makes the dict mutations atomic with
respect to other coroutines without a lock. Do not introduce an `await` inside
one of those sequences without also introducing a lock.
"""

import asyncio
import time
import uuid
from typing import Literal

from utils.logger import logger

#: How long a session's results stay retrievable after Phase A.
TTL_SECONDS = 15 * 60

#: Hard ceiling on live sessions. A traffic burst (or a client looping on
#: /analyze) must not grow this dict without bound between prunes. At the cap
#: the oldest sessions are evicted first — they are the ones whose client has
#: most likely already given up.
MAX_SESSIONS = 500

#: Outcome of a Phase B retrieval, so the caller can answer precisely.
#:   ok        — the task finished; `data` holds the result
#:   not_found — unknown or already-expired session id
#:   cancelled — the task was cancelled (shutdown, or eviction under the cap)
#:   failed    — the task raised; `data` is None
Outcome = Literal["ok", "not_found", "cancelled", "failed"]

_sessions: dict[str, dict] = {}


def _consume_exception(task: asyncio.Task) -> None:
    """
    Retrieve a background task's exception the moment it completes.

    Without this, a Phase B task that raises and is never awaited (the client
    closed the tab, or simply never called GET /results) makes asyncio log
    "Task exception was never retrieved" at garbage-collection time — a
    traceback with no request context attached. Reading the exception here
    marks it retrieved and logs it somewhere it can be understood.
    """
    if task.cancelled():
        return
    exc = task.exception()
    if exc is not None:
        logger.error("Phase B task failed in the background: %r", exc, exc_info=exc)


def _drop(session_id: str, *, reason: str) -> None:
    """Remove one session, cancelling its task if it is still running."""
    entry = _sessions.pop(session_id, None)
    if entry is None:
        return
    task = entry["task"]
    if task is not None and not task.done():
        logger.info("Session %s: cancelling in-flight Phase B (%s).", session_id, reason)
        task.cancel()


def _prune() -> None:
    """
    Drop expired entries, then enforce the size cap.

    Called on both create and read, so an idle process still releases memory
    the next time anyone touches the store.
    """
    cutoff = time.time() - TTL_SECONDS
    stale = [sid for sid, entry in _sessions.items() if entry["created_at"] < cutoff]
    for sid in stale:
        _drop(sid, reason="expired")
    if stale:
        logger.info("Session store: pruned %d expired session(s).", len(stale))

    # dicts preserve insertion order and ids are inserted in creation order, so
    # the front of the dict is the oldest.
    overflow = len(_sessions) - MAX_SESSIONS
    if overflow > 0:
        logger.warning(
            "Session store over capacity (%d > %d) — evicting %d oldest session(s).",
            len(_sessions), MAX_SESSIONS, overflow,
        )
        for sid in list(_sessions)[:overflow]:
            _drop(sid, reason="capacity")


def create_session(task: asyncio.Task | None, *, phase_a_data: dict | None = None) -> str:
    """Register a Phase B task and return the session id the client fetches with.

    ``phase_a_data`` is an optional dict carrying the symptoms and diagnosis
    from Phase A, stored so the /results endpoint can persist them to the
    medical_history table when the user is authenticated.
    """
    if task is not None:
        task.add_done_callback(_consume_exception)

    session_id = str(uuid.uuid4())
    _sessions[session_id] = {
        "created_at": time.time(),
        "task": task,
        "phase_a_data": phase_a_data or {},
    }

    # Prune AFTER inserting, not before. Pruning first leaves room for the new
    # entry to push the store one over the cap, so a steady stream of requests
    # sits permanently at MAX_SESSIONS + 1. Inserting first makes the cap exact,
    # and the entry just added is the newest, so it is never the one evicted.
    _prune()
    return session_id


def has_session(session_id: str) -> bool:
    return session_id in _sessions


def session_count() -> int:
    """Live session count. For tests and diagnostics."""
    return len(_sessions)


async def await_results(session_id: str) -> tuple[Outcome, dict | None, dict]:
    """
    Await the background Phase B task for this session.

    Returns (outcome, data, phase_a_data). The caller decides what each outcome
    means over HTTP; this never raises for a failed lookup, only for its own
    cancellation (the client disconnected), which must propagate.

    Retrieval is idempotent: awaiting a finished task returns the same result
    again, so a client that retries the GET gets the same answer rather than a
    404. The session is not consumed on read — it expires on the TTL.

    ``phase_a_data`` is the dict that was passed to ``create_session`` —
    symptoms and diagnosis from Phase A, for medical history persistence.
    """
    _prune()

    entry = _sessions.get(session_id)
    if entry is None:
        return "not_found", None, {}

    task = entry["task"]
    phase_a_data: dict = entry.get("phase_a_data", {})
    if task is None:
        # A session with no work attached. Not reachable via /analyze, but a
        # caller that registers one deserves a valid empty answer, not a crash.
        return "ok", {"medicines": [], "hospitals": []}, phase_a_data

    # asyncio.wait, not `await task`. `await task` on a task that someone else
    # cancels (pruning, shutdown, capacity eviction) raises CancelledError
    # *inside this request*, where Starlette reads it as a client disconnect
    # and the patient's browser sees a dropped connection instead of an answer.
    # asyncio.wait keeps the two cancellations distinct: cancelling the task
    # completes the wait, while cancelling *this request* still raises here, as
    # it should.
    await asyncio.wait({task})

    if task.cancelled():
        logger.warning("Session %s: Phase B was cancelled before it finished.", session_id)
        return "cancelled", None, phase_a_data

    exc = task.exception()
    if exc is not None:
        # Already logged by _consume_exception; this is the request-side view.
        logger.error("Session %s: Phase B failed — %r", session_id, exc)
        return "failed", None, phase_a_data

    return "ok", task.result(), phase_a_data


def shutdown() -> None:
    """
    Cancel every in-flight Phase B task and clear the store.

    Called from the FastAPI shutdown hook. Without it, pending tasks are
    garbage-collected mid-flight and asyncio logs "Task was destroyed but it is
    pending!" once per task.
    """
    if not _sessions:
        return
    logger.info("Session store: shutting down %d session(s).", len(_sessions))
    for sid in list(_sessions):
        _drop(sid, reason="shutdown")
    _sessions.clear()


def _reset_for_tests() -> None:
    """Drop all state. Test-only; never call from request handling."""
    for sid in list(_sessions):
        _drop(sid, reason="test reset")
    _sessions.clear()
def create_session_with_id(session_id: str, task: asyncio.Task | None, *, phase_a_data: dict | None = None) -> str:
    if task is not None:
        task.add_done_callback(_consume_exception)

    _sessions[session_id] = {
        "created_at": time.time(),
        "task": task,
        "phase_a_data": phase_a_data or {},
    }
    _prune()
    return session_id

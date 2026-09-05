"""
Session store lifecycle, concurrency and failure handling.

The store is the only stateful thing in the backend, and every one of its
failure modes shows up as a patient losing their medicine list. These tests
cover each state a session can be retrieved in.
"""

import asyncio
import time

import pytest

import session_store


async def _value(v, delay=0.0):
    if delay:
        await asyncio.sleep(delay)
    return v


async def _boom(delay=0.0):
    if delay:
        await asyncio.sleep(delay)
    raise RuntimeError("phase B exploded")


async def _forever():
    await asyncio.Event().wait()


# ---------------------------------------------------------------------------
# Retrieval outcomes
# ---------------------------------------------------------------------------

async def test_completed_session_returns_ok_and_data():
    sid = session_store.create_session(asyncio.create_task(_value({"medicines": [1]})))
    outcome, data, _ = await session_store.await_results(sid)
    assert outcome == "ok"
    assert data == {"medicines": [1]}


async def test_unknown_session_is_not_found():
    outcome, data, _ = await session_store.await_results("no-such-session")
    assert outcome == "not_found"
    assert data is None


async def test_phase_b_still_running_is_awaited_not_rejected():
    """A GET that arrives before Phase B finishes must wait, not 404."""
    sid = session_store.create_session(asyncio.create_task(_value({"ok": True}, delay=0.05)))
    started = time.monotonic()
    outcome, data, _ = await session_store.await_results(sid)
    assert outcome == "ok"
    assert data == {"ok": True}
    assert time.monotonic() - started >= 0.04


async def test_failed_task_reports_failed_not_empty():
    """
    The distinction the UI depends on: a raising task is 'failed', never a
    successful empty result.
    """
    sid = session_store.create_session(asyncio.create_task(_boom()))
    outcome, data, _ = await session_store.await_results(sid)
    assert outcome == "failed"
    assert data is None


async def test_retrieval_is_idempotent():
    """A client retrying the GET gets the same answer, not a 404."""
    sid = session_store.create_session(asyncio.create_task(_value({"medicines": ["a"]})))
    first = await session_store.await_results(sid)
    second = await session_store.await_results(sid)
    assert first == second == ("ok", {"medicines": ["a"]}, {})


async def test_session_with_no_task_returns_empty_ok():
    sid = session_store.create_session(None)
    outcome, data, _ = await session_store.await_results(sid)
    assert outcome == "ok"
    assert data == {"medicines": [], "hospitals": []}


# ---------------------------------------------------------------------------
# Expiry, capacity, cancellation
# ---------------------------------------------------------------------------

async def test_expired_session_is_pruned_and_not_found():
    sid = session_store.create_session(asyncio.create_task(_value({"medicines": []})))
    await asyncio.sleep(0)  # let the task finish
    # Backdate past the TTL rather than sleeping 15 minutes.
    session_store._sessions[sid]["created_at"] = time.time() - session_store.TTL_SECONDS - 1

    outcome, _, _ = await session_store.await_results(sid)
    assert outcome == "not_found"
    assert session_store.session_count() == 0


async def test_pruning_cancels_the_expired_task():
    task = asyncio.create_task(_forever())
    sid = session_store.create_session(task)
    session_store._sessions[sid]["created_at"] = time.time() - session_store.TTL_SECONDS - 1

    session_store._prune()
    await asyncio.sleep(0)
    assert task.cancelled() or task.done()
    assert session_store.session_count() == 0


async def test_cancelled_task_reports_cancelled_not_a_crash():
    """
    Regression: the store used to `await task` directly, so a task cancelled by
    pruning or shutdown raised CancelledError *inside the request*, which
    Starlette reads as a client disconnect. The patient saw a dropped
    connection instead of an answer.
    """
    task = asyncio.create_task(_forever())
    sid = session_store.create_session(task)

    async def cancel_soon():
        await asyncio.sleep(0.01)
        task.cancel()

    asyncio.create_task(cancel_soon())
    outcome, data, _ = await session_store.await_results(sid)

    assert outcome == "cancelled"
    assert data is None


async def test_capacity_evicts_oldest_sessions():
    session_store.MAX_SESSIONS = 5
    try:
        ids = [
            session_store.create_session(asyncio.create_task(_value({"n": i})))
            for i in range(8)
        ]
        await asyncio.sleep(0)
        assert session_store.session_count() <= 5
        # The oldest are gone, the newest survive.
        assert (await session_store.await_results(ids[0]))[0] == "not_found"
        assert (await session_store.await_results(ids[-1]))[0] == "ok"
    finally:
        session_store.MAX_SESSIONS = 500


async def test_shutdown_cancels_everything():
    tasks = [asyncio.create_task(_forever()) for _ in range(3)]
    for t in tasks:
        session_store.create_session(t)

    session_store.shutdown()
    await asyncio.sleep(0)

    assert session_store.session_count() == 0
    assert all(t.cancelled() or t.done() for t in tasks)


async def test_unawaited_failing_task_does_not_leak_its_exception():
    """
    A client that never calls GET /results must not leave asyncio logging
    "Task exception was never retrieved" at GC time. create_session attaches a
    done-callback that retrieves it.
    """
    task = asyncio.create_task(_boom())
    session_store.create_session(task)
    await asyncio.sleep(0.01)

    assert task.done()
    # Retrieved already by the done-callback; asking again must not raise.
    assert isinstance(task.exception(), RuntimeError)


# ---------------------------------------------------------------------------
# Concurrency
# ---------------------------------------------------------------------------

async def test_concurrent_sessions_do_not_cross_contaminate():
    """Twenty sessions resolved in parallel each get their own result back."""
    ids = {
        i: session_store.create_session(
            asyncio.create_task(_value({"n": i}, delay=(20 - i) * 0.002))
        )
        for i in range(20)
    }

    results = await asyncio.gather(
        *(session_store.await_results(sid) for sid in ids.values())
    )

    for (outcome, data, _), i in zip(results, ids):
        assert outcome == "ok"
        assert data == {"n": i}


async def test_concurrent_readers_of_one_session_agree():
    sid = session_store.create_session(asyncio.create_task(_value({"medicines": ["x"]}, delay=0.02)))
    results = await asyncio.gather(*(session_store.await_results(sid) for _ in range(10)))
    assert all(r == ("ok", {"medicines": ["x"]}, {}) for r in results)


async def test_create_during_pending_read_does_not_disturb_it():
    """
    Race: /analyze creates a new session (which prunes) while an earlier
    GET /results is still awaiting its own task.
    """
    slow = asyncio.create_task(_value({"medicines": ["slow"]}, delay=0.05))
    slow_id = session_store.create_session(slow)

    reader = asyncio.create_task(session_store.await_results(slow_id))
    await asyncio.sleep(0.01)

    for _ in range(5):
        session_store.create_session(asyncio.create_task(_value({"medicines": []})))

    assert await reader == ("ok", {"medicines": ["slow"]}, {})

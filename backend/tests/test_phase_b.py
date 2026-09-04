"""
Phase B failure isolation.

The two enrichment lookups are independent. One failing must never cost the
patient the other, and a failure must never be reported as an empty result —
"no medicine for this condition" and "we could not find out" are different
statements to put in front of someone who is ill.
"""

import asyncio

import pytest

from agents import orchestrator


@pytest.fixture
def tools(monkeypatch):
    """
    Swap both lookups for controllable stand-ins.

    The real ones hit SerpAPI and the local medicines.json; stubbing them makes
    the failure matrix deterministic, which is the only way to test it.
    """

    state = {
        "medicines": {"medicines": [{"name": "Paracetamol"}], "disclaimer_urdu": "ڈاکٹر سے ملیں۔"},
        "hospitals": [{"name": "PIMS", "lat": 33.7, "lng": 73.05}],
        "medicine_error": None,
        "hospital_error": None,
        "medicine_delay": 0.0,
        "hospital_delay": 0.0,
    }

    def fake_medicine_lookup(disease_name):
        if state["medicine_delay"]:
            import time
            time.sleep(state["medicine_delay"])
        if state["medicine_error"]:
            raise state["medicine_error"]
        return state["medicines"]

    async def fake_places_search(lat, lng):
        if state["hospital_delay"]:
            await asyncio.sleep(state["hospital_delay"])
        if state["hospital_error"]:
            raise state["hospital_error"]
        return state["hospitals"]

    import tools.medicine_lookup as med_mod
    import tools.places_search as places_mod

    monkeypatch.setattr(med_mod, "medicine_lookup", fake_medicine_lookup)
    monkeypatch.setattr(places_mod, "places_search", fake_places_search)
    return state


async def test_both_succeed(tools):
    result = await orchestrator.run_phase_b("Viral Fever", 33.6, 73.0)
    assert result["medicines_status"] == "ok"
    assert result["hospitals_status"] == "ok"
    assert result["medicines"] == [{"name": "Paracetamol"}]
    assert len(result["hospitals"]) == 1
    assert result["disclaimer_urdu"] == "ڈاکٹر سے ملیں۔"


async def test_places_fails_medicine_survives(tools):
    """Regression: a raising places_search used to take the medicine list with it."""
    tools["hospital_error"] = RuntimeError("SerpAPI 503")

    result = await orchestrator.run_phase_b("Viral Fever", 33.6, 73.0)

    assert result["medicines_status"] == "ok"
    assert result["medicines"] == [{"name": "Paracetamol"}]
    assert result["hospitals_status"] == "failed"
    assert result["hospitals"] == []


async def test_medicine_fails_places_survives(tools):
    tools["medicine_error"] = ValueError("medicines.json is corrupt")

    result = await orchestrator.run_phase_b("Viral Fever", 33.6, 73.0)

    assert result["hospitals_status"] == "ok"
    assert len(result["hospitals"]) == 1
    assert result["medicines_status"] == "failed"
    assert result["medicines"] == []
    # Still a usable disclaimer even though the lookup that normally carries
    # one never returned.
    assert result["disclaimer_urdu"]


async def test_both_fail_still_returns_a_valid_response(tools):
    """Total failure is a described state, not an unhandled 500."""
    tools["medicine_error"] = RuntimeError("boom")
    tools["hospital_error"] = RuntimeError("bang")

    result = await orchestrator.run_phase_b("Viral Fever", 33.6, 73.0)

    assert result["medicines"] == []
    assert result["hospitals"] == []
    assert result["medicines_status"] == "failed"
    assert result["hospitals_status"] == "failed"
    assert result["disclaimer_urdu"]


async def test_slow_failure_does_not_cancel_the_other_lookup(tools):
    """
    gather(return_exceptions=True) is what makes this hold: without it the
    first exception cancels the sibling coroutine mid-flight.
    """
    tools["medicine_error"] = RuntimeError("fast failure")
    tools["hospital_delay"] = 0.05

    result = await orchestrator.run_phase_b("Viral Fever", 33.6, 73.0)

    assert result["medicines_status"] == "failed"
    assert result["hospitals_status"] == "ok"
    assert len(result["hospitals"]) == 1


async def test_empty_medicine_list_is_ok_not_failed(tools):
    """An empty list from a working lookup is a real answer and must say so."""
    tools["medicines"] = {"medicines": [], "disclaimer_urdu": "ڈاکٹر سے ملیں۔"}

    result = await orchestrator.run_phase_b("Unknown", 33.6, 73.0)

    assert result["medicines"] == []
    assert result["medicines_status"] == "ok"


async def test_malformed_tool_output_is_failed_not_empty(tools):
    """
    A tool that breaks its own contract is 'failed'. Reporting it as an empty
    result would tell the patient there is no treatment for their condition.
    """
    tools["medicines"] = "not a dict"
    tools["hospitals"] = {"not": "a list"}

    result = await orchestrator.run_phase_b("Viral Fever", 33.6, 73.0)

    assert result["medicines_status"] == "failed"
    assert result["hospitals_status"] == "failed"


async def test_lookups_actually_run_concurrently(tools):
    """Serialising them would put the slower one's latency on top of the other."""
    tools["hospital_delay"] = 0.10
    tools["medicine_delay"] = 0.10

    started = asyncio.get_event_loop().time()
    await orchestrator.run_phase_b("Viral Fever", 33.6, 73.0)
    elapsed = asyncio.get_event_loop().time() - started

    assert elapsed < 0.18, f"lookups appear serialised ({elapsed:.3f}s)"


async def test_phase_b_never_raises(tools):
    """
    Whatever the tools do, run_phase_b returns a dict. It runs as a detached
    task, so an escaping exception is only ever seen as a missing result.
    """
    class Nasty(Exception):
        def __str__(self):
            raise Exception("even my repr is broken")

    tools["medicine_error"] = Nasty()
    tools["hospital_error"] = Nasty()

    result = await orchestrator.run_phase_b("X", 0.0, 0.0)
    assert set(result) == {
        "medicines", "hospitals", "disclaimer_urdu",
        "medicines_status", "hospitals_status",
    }

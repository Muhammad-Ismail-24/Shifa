"""
Shared test setup.

Two things happen here before any backend module is imported:

1. The heavyweight external SDKs (google-generativeai, google-genai,
   qdrant-client) are replaced with stand-ins. They are only ever reached
   through code these tests deliberately stub out, and importing the real ones
   would make the suite need API keys, a vector database and a network.

2. `backend/` goes on sys.path, because the application imports itself flat
   (`from utils.logger import logger`) the way uvicorn runs it.

Everything the tests actually assert on — the session store, Phase B's failure
isolation, the endpoints — is real application code.
"""

import asyncio
import sys
import types
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))


def _stub(name: str, **attrs) -> None:
    """Register a placeholder module so `import name` succeeds."""
    if name in sys.modules:
        return
    module = types.ModuleType(name)
    for key, value in attrs.items():
        setattr(module, key, value)
    sys.modules[name] = module


class _Inert:
    """
    Constructs fine, does nothing useful.

    Construction has to succeed because some modules build a client at import
    time (rag/embedder.py instantiates genai.Client at module scope). Actually
    *calling* through one is a test bug, so that raises.
    """

    def __init__(self, *a, **k):
        pass

    def __getattr__(self, name):
        def _boom(*a, **k):
            raise RuntimeError(
                f"A test called into a stubbed external SDK ({name}). "
                "Stub the calling function instead."
            )

        return _boom


# google.generativeai / google.genai
_google = sys.modules.get("google") or types.ModuleType("google")
_google.__path__ = []  # mark as a package so submodule imports resolve
sys.modules["google"] = _google

_stub("google.generativeai", GenerativeModel=_Inert, configure=lambda *a, **k: None)
_stub("google.genai", Client=_Inert)
_stub("google.genai.types", Part=_Inert, GenerateContentConfig=_Inert)
_google.generativeai = sys.modules["google.generativeai"]
_google.genai = sys.modules["google.genai"]

# qdrant-client
_stub("qdrant_client", QdrantClient=_Inert)
_stub(
    "qdrant_client.models",
    PointStruct=_Inert,
    VectorParams=_Inert,
    Distance=_Inert,
)
sys.modules["qdrant_client"].models = sys.modules["qdrant_client.models"]


@pytest.fixture(autouse=True)
def clean_session_store():
    """
    Every test starts and ends with an empty store.

    The store is module-level state by design, so without this a leftover task
    from one test can be pruned, cancelled or awaited by the next.
    """
    import session_store

    session_store._reset_for_tests()
    yield
    session_store._reset_for_tests()


@pytest.fixture
def anyio_backend():
    return "asyncio"


def run(coro):
    """Run one coroutine to completion. Keeps the async tests dependency-free."""
    return asyncio.run(coro)

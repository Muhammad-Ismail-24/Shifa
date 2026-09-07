import time
from typing import Dict, Any

# In-memory store for polling status
pipeline_status_store: Dict[str, Dict[str, Any]] = {}

def cleanup_status_store():
    cutoff = time.time() - 3600 # 1 hour
    stale = [sid for sid, data in pipeline_status_store.items() if data.get("created_at", 0) < cutoff]
    for sid in stale:
        pipeline_status_store.pop(sid, None)

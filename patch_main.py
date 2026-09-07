import re

with open('backend/main.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Add imports if necessary
if 'from fastapi import BackgroundTasks' not in content:
    content = content.replace('from fastapi import', 'from fastapi import BackgroundTasks,')

if 'from status_store import' not in content:
    import_stmt = '''
import uuid
import time
from status_store import pipeline_status_store, cleanup_status_store
'''
    content = content.replace('import session_store', import_stmt + '\nimport session_store')

# Find the analyze function and replace it
new_analyze = '''
async def run_full_pipeline_task(session_id: str, body: AnalyzeRequest):
    import time
    cleanup_status_store()
    pipeline_status_store[session_id] = {"status": "processing"}
    try:
        from agents.orchestrator import run_phase_b, run_phase_b_stage1, run_pipeline_phase_a
        from agents.triage_agent import evaluate_triage
        
        triage = await evaluate_triage(latest_input=body.urdu_text, history=body.history)
        if triage.get("status") == "clarification_needed":
            pipeline_status_store[session_id] = {
                "status": "completed",
                "result": {
                    "session_id": None,
                    "diseases": [],
                    "medicines": [],
                    "hospitals": [],
                    "response_text_urdu": triage.get("question_urdu", "?? ?? ????? ?? ???? ??? ???? ???????"),
                    "is_emergency": False,
                    "disclaimer_urdu": "???? ??? ???? ?????? ?? ???? ??? ???? ???????",
                }
            }
            return
            
        result = await run_pipeline_phase_a(
            body.urdu_text,
            body.latitude,
            body.longitude,
            body.history,
        )

        voice_summary = None
        needs_phase_b = result.pop("needs_phase_b", False)
        
        result_payload = {
            "session_id": session_id if needs_phase_b else None,
            "voice_summary": None,
            **result
        }

        if needs_phase_b:
            top_disease = result.pop("top_disease", "Unknown")
            symptoms = result.pop("symptoms", [])

            try:
                stage1 = await run_phase_b_stage1(
                    top_disease,
                    original_text=body.urdu_text,
                )
                voice_summary = stage1["voice_summary"]
            except Exception as exc:
                logger.error("Stage 1 voice summary failed: %s", exc)

            result_payload["voice_summary"] = voice_summary
            
            task = asyncio.create_task(
                run_phase_b(
                    top_disease, body.latitude, body.longitude,
                    diseases=result.get("diseases", []),
                    original_text=body.urdu_text,
                )
            )
            session_store.create_session_with_id(
                session_id,
                task,
                phase_a_data={
                    "symptoms": ", ".join(symptoms) if symptoms else "",
                    "diagnosis": top_disease,
                },
            )
        else:
            result.pop("top_disease", None)
            result.pop("symptoms", None)
            
        pipeline_status_store[session_id] = {
            "status": "completed",
            "result": result_payload
        }
            
    except Exception as e:
        logger.error(f"Pipeline task failed: {e}")
        pipeline_status_store[session_id] = {
            "status": "error",
            "result": {
                "session_id": None,
                "diseases": [],
                "medicines": [],
                "hospitals": [],
                "response_text_urdu": "???? ????? ??? ??? ????? ??? ? ??? ??? ?????? ???? ?????",
                "is_emergency": False,
                "disclaimer_urdu": "???? ??? ?????? ???? ?????"
            }
        }


@app.post("/analyze")
async def analyze(body: AnalyzeRequest, background_tasks: BackgroundTasks):
    """
    Main analysis endpoint. Returns instantly with processing status.
    """
    logger.info(
        "POST /analyze (async) — text length=%d, lat=%.4f, lng=%.4f, history_len=%d",
        len(body.urdu_text),
        body.latitude,
        body.longitude,
        len(body.history),
    )
    validate_analyze_request(body.urdu_text, body.latitude, body.longitude, body.history)
    
    session_id = str(uuid.uuid4())
    background_tasks.add_task(run_full_pipeline_task, session_id, body)
    
    return {"status": "processing", "session_id": session_id}

@app.get("/status/{session_id}")
async def check_status(session_id: str):
    data = pipeline_status_store.get(session_id)
    if not data:
        return {"status": "processing"}
    return data
'''

# Find the analyze function start and end
# It starts at @app.post("/analyze", response_model=AnalyzeResponse)
# It ends at @app.get("/results/{session_id}", response_model=ResultsResponse)
start_idx = content.find('@app.post("/analyze"')
end_idx = content.find('@app.get("/results/{session_id}"')

if start_idx != -1 and end_idx != -1:
    content = content[:start_idx] + new_analyze + '\n\n' + content[end_idx:]
    with open('backend/main.py', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Patched main.py successfully")
else:
    print("Could not find analyze function bounds")

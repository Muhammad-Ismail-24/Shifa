# Turn 1: evaluate history + input → proceed or clarify

import json
from config.prompts import TRIAGE_EVALUATION_PROMPT
from utils.ai_client import generate_with_retry
from utils.model_router import Phase

async def evaluate_triage(latest_input: str, history: list[dict]) -> dict:
    """
    Evaluate whether the patient's input has enough medical context.

    Args:
        latest_input: The patient's latest Urdu message.
        history: List of previous conversation turns,
                 each with 'role' and 'content' keys.

    Returns:
        {"status": "proceed"}
        OR
        {"status": "clarification_needed", "question_urdu": str}
    """
    history_text = "\n".join(f"{msg['role']}: {msg['content']}" for msg in history) if history else "No previous history."
    
    full_prompt = f"{TRIAGE_EVALUATION_PROMPT}\n\nConversation History:\n{history_text}\n\nLatest Patient Input:\n{latest_input}"

    raw_response = await generate_with_retry(
        full_prompt,
        phase=Phase.TRIAGE,
    )
    
    raw_text = raw_response.strip()
    if raw_text.startswith("```json"):
        raw_text = raw_text[7:]
    if raw_text.startswith("```"):
        raw_text = raw_text[3:]
    if raw_text.endswith("```"):
        raw_text = raw_text[:-3]
        
    return json.loads(raw_text.strip())


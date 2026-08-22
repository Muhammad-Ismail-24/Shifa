# Turn 1: evaluate history + input → proceed or clarify

import json
from config.prompts import TRIAGE_EVALUATION_PROMPT
from utils.llm_router import generate_json_with_fallback


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
    history_text = "\n".join(
        f"{msg['role']}: {msg['content']}" for msg in history
    ) if history else "(no previous conversation)"

    prompt = (
        f"{TRIAGE_EVALUATION_PROMPT}\n\n"
        f"History:\n{history_text}\n\n"
        f"Latest message:\n{latest_input}"
    )

    raw = await generate_json_with_fallback(prompt)
    return json.loads(raw)

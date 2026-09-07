# Turn 1: evaluate history + input → proceed or clarify

import logging
from config.prompts import TRIAGE_EVALUATION_PROMPT
from utils.ai_client import generate_with_retry
from utils.model_router import Phase, sanitize_json, safe_json_parse

logger = logging.getLogger(__name__)

# Gemini stops mid-generation when a token cap is hit, leaving unterminated
# JSON behind. "proceed" keeps the consultation moving — the symptom
# extractor asks for clarification if the input really is too thin.
TRIAGE_PARSE_FALLBACK = {
    "status": "proceed",
    "reasoning": "parsing failed, proceeding safely",
}

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

    parsed = safe_json_parse(sanitize_json(raw_response), TRIAGE_PARSE_FALLBACK)
    if not isinstance(parsed, dict):
        logger.warning(
            "Triage returned %s, expected dict — using safe fallback.",
            type(parsed).__name__,
        )
        return dict(TRIAGE_PARSE_FALLBACK)
    return parsed


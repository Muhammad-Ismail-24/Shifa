import asyncio
import google.generativeai as genai
from utils.logger import logger
from utils.model_router import ModelRouter, Phase

async def generate_with_retry(
    prompt: str,
    system_instruction: str = None,
    media_data: list | None = None,
    phase: Phase | None = None,
    max_output_tokens: int | None = None,
) -> str:
    """
    Centralized Gemini call with model fallback and retry.

    No hardcoded timeout — the underlying SDK's default connection lifespan
    governs, allowing free-tier deployments as much time as the platform
    (Render / Fly.io / etc.) permits.

    Optional parameters:
      - media_data: list of {"mime_type": str, "data": bytes} parts appended
        after the prompt, for multimodal requests (audio/images).
      - phase: routes model selection through ModelRouter instead of the
        default chain.
      - max_output_tokens: explicit cap on generated tokens.  When omitted,
        the per-phase default from ModelRouter is used (if any).
    """
    # Primary and fallback models, selected centrally by phase.
    models = ModelRouter.route(phase)
    max_retries = 3

    # Resolve token limit: explicit arg > phase default > None (unlimited).
    token_limit = max_output_tokens or ModelRouter.max_tokens(phase)
    gen_config = (
        genai.GenerationConfig(max_output_tokens=token_limit)
        if token_limit
        else None
    )

    for model_name in models:
        for attempt in range(max_retries):
            try:
                model = genai.GenerativeModel(model_name)
                # Assuming older SDK signature for broader compatibility
                full_prompt = f"{system_instruction}\n\n{prompt}" if system_instruction else prompt
                contents = [full_prompt, *media_data] if media_data else full_prompt
                if hasattr(model, "generate_content_async"):
                    res = model.generate_content_async(
                        contents,
                        generation_config=gen_config,
                    )
                    if asyncio.iscoroutine(res):
                        response = await res
                    else:
                        response = res
                else:
                    # Legacy sync path — offload to a worker thread so the
                    # event loop is never blocked.
                    response = await asyncio.to_thread(
                        model.generate_content,
                        contents,
                        generation_config=gen_config,
                    )
                return response.text
            except Exception as e:
                error_msg = str(e).lower()
                if "503" in error_msg or "429" in error_msg or "unavailable" in error_msg:
                    sleep_time = 2 ** attempt  # 1s, 2s, 4s
                    logger.warning(f"API busy ({model_name}). Retrying in {sleep_time}s... (Attempt {attempt+1}/{max_retries})")
                    await asyncio.sleep(sleep_time)
                    continue
                elif "404" in error_msg:
                    logger.warning(f"Model {model_name} not found. Pivoting to fallback.")
                    break # Break the retry loop, move to the next model in the list
                else:
                    logger.error(f"Unexpected error with {model_name}: {e}")
                    break # Move to fallback model
    
    raise Exception("All models and retries failed due to high demand or API errors.")

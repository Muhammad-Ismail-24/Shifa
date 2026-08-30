import asyncio
import google.generativeai as genai
from utils.logger import logger

async def generate_with_retry(prompt: str, system_instruction: str = None) -> str:
    # Primary and fallback models
    models = ["gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.7-flash"]
    max_retries = 3

    for model_name in models:
        for attempt in range(max_retries):
            try:
                model = genai.GenerativeModel(model_name)
                # Assuming older SDK signature for broader compatibility
                full_prompt = f"{system_instruction}\n\n{prompt}" if system_instruction else prompt
                response = await model.generate_content_async(full_prompt)
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

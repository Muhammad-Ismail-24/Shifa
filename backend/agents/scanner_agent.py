import base64
import json
import google.generativeai as genai
from config.settings import settings
import asyncio
from config.prompts import SCANNER_PROMPT
from utils.logger import logger

genai.configure(api_key=settings.GEMINI_API_KEY)

async def scan_medicine_image(image_base64: str, mime_type: str = "image/jpeg") -> dict:
    """
    Takes a base64 encoded image and passes it to Gemini 1.5 Flash vision.
    Returns a dict with medicine_name and explanation_urdu.
    """
    try:
        # Decode base64 to bytes if it has data URI prefix
        if "," in image_base64:
            image_base64 = image_base64.split(",")[1]
            
        image_data = base64.b64decode(image_base64)
        
        prompt = SCANNER_PROMPT
        
        models = [
            "gemini-3.1-flash-lite",
            "gemini-3.5-flash-lite",
            "gemini-3.5-flash",
            "gemini-3.7-flash",
            "gemini-2.5-flash-lite",
        ]
        max_retries = 3
        text = None

        for model_name in models:
            for attempt in range(max_retries):
                try:
                    model = genai.GenerativeModel(model_name)
                    content_parts = [
                        prompt,
                        {"mime_type": mime_type, "data": image_data}
                    ]
                    if hasattr(model, "generate_content_async"):
                        res = model.generate_content_async(content_parts)
                        response = await res if asyncio.iscoroutine(res) else res
                    else:
                        res = model.generate_content(content_parts)
                        response = await res if asyncio.iscoroutine(res) else res
                    text = response.text
                    break # Success, break retry loop
                except Exception as e:
                    error_msg = str(e).lower()
                    if "503" in error_msg or "429" in error_msg or "unavailable" in error_msg:
                        sleep_time = 2 ** attempt
                        logger.warning(f"API busy ({model_name}). Retrying in {sleep_time}s... (Attempt {attempt+1}/{max_retries})")
                        await asyncio.sleep(sleep_time)
                        continue
                    elif "404" in error_msg:
                        logger.warning(f"Model {model_name} not found. Pivoting to fallback.")
                        break # Break retry loop, move to next model
                    else:
                        logger.error(f"Unexpected error with {model_name}: {e}")
                        break # Break retry loop, move to next model
            
            if text:
                break # Success, break model loop
                
        if not text:
            raise Exception("All models and retries failed.")
        # Strip markdown json block if present
        if text.startswith("```json"):
            text = text.replace("```json", "").replace("```", "").strip()
        elif text.startswith("```"):
            text = text.replace("```", "").strip()
            
        return json.loads(text)
        
    except Exception as e:
        logger.error(f"Error in scan_medicine_image: {e}")
        return {
            "medicine_name": "Unknown",
            "explanation_urdu": "معذرت، ہم اس دوا کو پہچان نہیں سکے۔ براہ کرم صاف تصویر دوبارہ لیں یا ڈاکٹر سے رجوع کریں۔\nیہ صرف عمومی معلومات ہے۔ براہ کرم استعمال سے پہلے ڈاکٹر سے مشورہ کریں۔"
        }


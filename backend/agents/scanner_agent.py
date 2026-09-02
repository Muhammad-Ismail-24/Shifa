import base64
import json
import google.generativeai as genai
from config.settings import settings
from config.prompts import SCANNER_PROMPT
from utils.logger import logger

genai.configure(api_key=settings.GEMINI_API_KEY)

async def scan_medicine_image(image_base64: str, mime_type: str = "image/jpeg") -> dict:
    """
    Takes a base64 encoded image and passes it to Gemini 1.5 Flash vision.
    Returns a dict with medicine_name and explanation_urdu.
    """
    try:
        model = genai.GenerativeModel("gemini-1.5-flash")

        # Decode base64 to bytes if it has data URI prefix
        if "," in image_base64:
            image_base64 = image_base64.split(",")[1]

        image_data = base64.b64decode(image_base64)

        prompt = SCANNER_PROMPT

        response = model.generate_content([
            prompt,
            {"mime_type": mime_type, "data": image_data}
        ])

        text = response.text
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

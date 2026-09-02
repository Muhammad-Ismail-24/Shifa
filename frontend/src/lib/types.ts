// TypeScript interfaces for all API shapes.
//
// This file is the frontend half of the Zaheen <-> Sufiyan contract. It mirrors
// the POST /analyze response as the backend actually builds it — verified
// against backend/main.py (AnalyzeResponse), backend/agents/orchestrator.py and
// the JSON contracts in backend/config/prompts.py. Treat any future mismatch as
// a contract bug rather than patching around it here.

export interface Disease {
  /** English disease name. Emitted as "disease" by DISEASE_IDENTIFICATION_PROMPT. */
  disease: string;
  /** "high" | "medium" | "low" — kept as string to match the backend exactly. */
  confidence: string;
  /** Urdu disease name. Emitted as "urdu" by DISEASE_IDENTIFICATION_PROMPT. */
  urdu: string;
}

export interface Medicine {
  name: string;
  name_urdu: string;
  dosage_urdu: string;
  otc: boolean;
}

export interface Hospital {
  name: string;
  lat: number;
  lng: number;
  address: string;
  /**
   * Null until distance calculation is implemented — tools/places_search.py
   * currently sets this to None on every result.
   */
  distance_km: number | null;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AnalyzeRequest {
  urdu_text: string;
  latitude: number;
  longitude: number;
  /** Backend is stateless; the frontend carries the conversation. [] on turn 1. */
  history: ConversationMessage[];
}

export interface AnalyzeResponse {
  diseases: Disease[];
  medicines: Medicine[];
  hospitals: Hospital[];
  /** Full spoken Urdu response, OR a clarifying question when triage needs more. */
  response_text_urdu: string;
  is_emergency: boolean;
  disclaimer_urdu: string;
}

/**
 * Triage short-circuit: empty arrays plus a question in response_text_urdu.
 * This is NOT an empty-results condition — it means the conversation continues.
 */
export function isClarificationTurn(res: AnalyzeResponse): boolean {
  return (
    !res.is_emergency &&
    res.diseases.length === 0 &&
    res.medicines.length === 0 &&
    res.response_text_urdu.trim().length > 0
  );
}

export interface ScanMedicineRequest {
  image_base64: string;
  mime_type: string;
}

export interface ScanMedicineResponse {
  medicine_name: string;
  explanation_urdu: string;
}

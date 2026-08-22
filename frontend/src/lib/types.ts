// TypeScript interfaces for all API shapes.
//
// This file is the frontend half of the Zaheen <-> Sufiyan contract. It mirrors
// the documented POST /analyze Pydantic models. The backend is still an empty
// scaffold, so these shapes come from the team specification rather than from
// running code — re-verify against backend/main.py the moment it lands, and
// treat any mismatch as a contract bug rather than patching around it here.

export interface Disease {
  name: string;
  name_urdu: string;
  /** "high" | "medium" | "low" — kept as string to match the backend exactly. */
  confidence: string;
  explanation_urdu: string;
}

export interface Medicine {
  name: string;
  name_urdu: string;
  dosage_urdu: string;
  otc: boolean;
}

export interface Hospital {
  name: string;
  distance_km: number;
  lat: number;
  lng: number;
  address: string;
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

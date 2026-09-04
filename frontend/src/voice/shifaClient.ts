/**
 * The seam between the landing page and Shifa's conversation backend.
 *
 * The backend is currently an empty scaffold, so this module is the documented
 * integration point rather than a working pipeline. Two modes, chosen once at
 * construction and never mixed:
 *
 *   LIVE  VITE_API_URL is set -> real POST /analyze via lib/api.ts.
 *   MOCK  no backend configured, or VITE_SHIFA_MOCK=true -> local demo only.
 *
 * MOCK EXISTS SO THE UI CAN BE DEVELOPED WITHOUT A BACKEND. It is deliberately
 * non-diagnostic: it only ever returns a triage clarification question, never a
 * disease, medicine or dosage. Shifa is a health product and a mock must not be
 * capable of putting invented medical claims in front of a patient.
 *
 * WIRE THE REAL BACKEND HERE: set VITE_API_URL to the Railway deployment. No
 * other change is required — the request/response contract in lib/types.ts
 * already matches the documented Pydantic models.
 */

import { analyze, isBackendConfigured, ShifaApiError } from '../lib/api';
import type { AnalyzeResponse, ConversationMessage } from '../lib/types';
import { getPositionOrFallback } from '../lib/utils';

const FORCE_MOCK = import.meta.env.VITE_SHIFA_MOCK === 'true';

/** Urdu clarification prompts. Questions only — never guidance. */
const MOCK_CLARIFICATIONS = [
  'آپ کو یہ تکلیف کب سے ہو رہی ہے؟',
  'کیا آپ کو بخار بھی ہے؟',
  'درد جسم کے کس حصے میں ہے؟',
];

export type ShifaMode = 'live' | 'mock';

export class ShifaVoiceClient {
  readonly mode: ShifaMode;
  private history: ConversationMessage[] = [];
  private mockTurn = 0;

  constructor() {
    this.mode = !isBackendConfigured || FORCE_MOCK ? 'mock' : 'live';
  }

  getHistory(): readonly ConversationMessage[] {
    return this.history;
  }

  resetConversation(): void {
    this.history = [];
    this.mockTurn = 0;
  }

  /**
   * Submit one completed utterance and get Shifa's structured reply.
   * History is appended here so callers cannot forget to maintain it.
   */
  async submitUtterance(urduText: string): Promise<AnalyzeResponse> {
    const text = urduText.trim();
    if (!text) throw new ShifaApiError('server', 'Empty utterance');

    const response =
      this.mode === 'mock' ? await this.mockResponse() : await this.liveResponse(text);

    this.history = [
      ...this.history,
      { role: 'user', content: text },
      { role: 'assistant', content: response.response_text_urdu },
    ];

    return response;
  }

  private async liveResponse(text: string): Promise<AnalyzeResponse> {
    const { latitude, longitude } = await getPositionOrFallback();
    return analyze({
      urdu_text: text,
      latitude,
      longitude,
      history: [...this.history],
    });
  }

  /** Local demo only. Never reached when VITE_API_URL is set. */
  private async mockResponse(): Promise<AnalyzeResponse> {
    await delay(900 + Math.min(this.mockTurn, 2) * 250);
    const question = MOCK_CLARIFICATIONS[this.mockTurn % MOCK_CLARIFICATIONS.length];
    this.mockTurn += 1;

    return {
      session_id: null,
      diseases: [],
      medicines: [],
      hospitals: [],
      response_text_urdu: question,
      is_emergency: false,
      disclaimer_urdu: 'یہ صرف عمومی معلومات ہے۔ ڈاکٹر سے ضرور ملیں۔',
    };
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// All POST /analyze calls — nowhere else.
//
// Project rule: components never talk to the backend directly. Everything that
// crosses the Zaheen <-> Sufiyan boundary goes through this module so the
// request shape stays in one reviewable place.

import axios from 'axios';
import { supabase } from './supabaseClient';
import type {
  AnalyzeRequest,
  AnalyzeResponse,
  LookupStatus,
  ResultsResponse,
  ScanMedicineRequest,
  ScanMedicineResponse,
} from './types';

const baseURL = import.meta.env.VITE_API_URL ?? '';

export const isBackendConfigured = Boolean(baseURL);

/**
 * URL of the backend TTS endpoint (GET /synthesize) for `text`.
 *
 * Returns null when no backend is configured, so ShifaSpeech's
 * audioUrlResolver can fall back to browser speech synthesis.
 */
export function synthesizeUrl(text: string): string | null {
  if (!isBackendConfigured) return null;
  return `${baseURL}/synthesize?text=${encodeURIComponent(text)}`;
}

const client = axios.create({
  baseURL,
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' },
});

// ---------------------------------------------------------------------------
// Inject the Supabase JWT into every outgoing request.
// If the user is not signed in (e.g. WhatsApp or an anonymous session), the
// header is simply absent — the backend's get_current_user dependency handles
// that gracefully with auto_error=False.
// ---------------------------------------------------------------------------
client.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  return config;
});

export class ShifaApiError extends Error {
  readonly kind: 'network' | 'server' | 'timeout';
  constructor(kind: 'network' | 'server' | 'timeout', message: string) {
    super(message);
    this.name = 'ShifaApiError';
    this.kind = kind;
  }
}

export async function analyze(payload: AnalyzeRequest): Promise<AnalyzeResponse> {
  if (!isBackendConfigured) {
    throw new ShifaApiError('network', 'VITE_API_URL is not configured');
  }

  try {
    const { data } = await client.post<AnalyzeResponse>('/analyze', payload, {
      timeout: 120_000, // 2 min — triage + Phase A + Stage 1 voice summary
    });
    return data;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      if (err.code === 'ECONNABORTED') {
        throw new ShifaApiError('timeout', 'Shifa took too long to respond');
      }
      if (err.response) {
        throw new ShifaApiError('server', `Backend returned ${err.response.status}`);
      }
    }
    throw new ShifaApiError('network', 'Could not reach Shifa');
  }
}

function allFailed(status: LookupStatus): ResultsResponse {
  return {
    medicines: [],
    hospitals: [],
    medicines_status: status,
    hospitals_status: status,
  };
}

/**
 * Phase B fetch. Single request, not a poll: the backend started these lookups
 * when /analyze returned and this call awaits that same task.
 *
 * Never throws. The patient already has a correct medical answer on screen and
 * enrichment is supplementary — but the *reason* it is missing is carried back
 * in the status fields rather than flattened into empty lists, so the UI can
 * say "we could not look this up" instead of "there is no medicine for this".
 *
 * Pass `signal` to drop a fetch whose turn is no longer on screen.
 */
export async function fetchResults(
  sessionId: string,
  signal?: AbortSignal,
): Promise<ResultsResponse> {
  if (!isBackendConfigured) {
    return allFailed('failed');
  }

  try {
    const { data } = await client.get<ResultsResponse>(
      `/results/${encodeURIComponent(sessionId)}`,
      { signal },
    );
    return {
      medicines: data?.medicines ?? [],
      hospitals: data?.hospitals ?? [],
      medicines_status: data?.medicines_status ?? 'ok',
      hospitals_status: data?.hospitals_status ?? 'ok',
      soap_note_english: data?.soap_note_english,
      voice_summary: data?.voice_summary,
    };
  } catch (err) {
    if (axios.isCancel(err)) throw err; // the caller aborted; not a lookup failure

    // 404 means the session expired or the backend restarted. Distinct from a
    // lookup error: the results are gone rather than unobtainable, and the
    // patient can get them back by asking again.
    if (axios.isAxiosError(err) && err.response?.status === 404) {
      return allFailed('expired');
    }
    return allFailed('failed');
  }
}

export async function health(): Promise<boolean> {
  if (!isBackendConfigured) return false;
  try {
    const { data } = await client.get<{ status: string }>('/health');
    return data?.status === 'ok';
  } catch {
    return false;
  }
}

export async function scanMedicine(payload: ScanMedicineRequest): Promise<ScanMedicineResponse> {
  if (!isBackendConfigured) {
    throw new ShifaApiError('network', 'VITE_API_URL is not configured');
  }

  try {
    const { data } = await client.post<ScanMedicineResponse>('/scan-medicine', payload);
    return data;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      if (err.code === 'ECONNABORTED') {
        throw new ShifaApiError('timeout', 'Shifa took too long to respond');
      }
      if (err.response) {
        throw new ShifaApiError('server', `Backend returned ${err.response.status}`);
      }
    }
    throw new ShifaApiError('network', 'Could not reach Shifa');
  }
}


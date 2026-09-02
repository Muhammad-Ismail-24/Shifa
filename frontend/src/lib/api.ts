// All POST /analyze calls — nowhere else.
//
// Project rule: components never talk to the backend directly. Everything that
// crosses the Zaheen <-> Sufiyan boundary goes through this module so the
// request shape stays in one reviewable place.

import axios from 'axios';
import type { AnalyzeRequest, AnalyzeResponse, ScanMedicineRequest, ScanMedicineResponse } from './types';

const baseURL = import.meta.env.VITE_API_URL ?? '';

export const isBackendConfigured = Boolean(baseURL);

const client = axios.create({
  baseURL,
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' },
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
    const { data } = await client.post<AnalyzeResponse>('/analyze', payload);
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


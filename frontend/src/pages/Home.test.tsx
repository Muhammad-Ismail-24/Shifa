/**
 * Dashboard regression tests.
 *
 * The focus is the things that are invisible until they hurt someone: a stale
 * enrichment landing on the wrong consultation, an emergency with a medicine
 * list underneath it, a failed lookup phrased as "no treatment", and the mic
 * submitting twice.
 */

import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import Home from './Home';
import * as api from '../lib/api';
import * as speech from '../lib/speech';
import type { AnalyzeResponse, ResultsResponse } from '../lib/types';
import { MockRecognition, installMockRecognition, uninstallRecognition } from '../test/mockSpeechRecognition';

vi.mock('../lib/api');
vi.mock('../lib/speech', async (importOriginal) => ({
  ...(await importOriginal<typeof speech>()),
  speakUrdu: vi.fn().mockResolvedValue(undefined),
  cancelSpeech: vi.fn(),
}));

const analyze = vi.mocked(api.analyze);
const fetchResults = vi.mocked(api.fetchResults);

function phaseA(overrides: Partial<AnalyzeResponse> = {}): AnalyzeResponse {
  return {
    session_id: 'sess-1',
    diseases: [{ disease: 'Viral Fever', confidence: 'high', urdu: 'وائرل بخار' }],
    medicines: [],
    hospitals: [],
    response_text_urdu: 'آرام کریں۔',
    is_emergency: false,
    disclaimer_urdu: 'ڈاکٹر سے ملیں۔',
    ...overrides,
  };
}

function phaseB(overrides: Partial<ResultsResponse> = {}): ResultsResponse {
  return {
    medicines: [{ name: 'Paracetamol', name_urdu: 'پیراسیٹامول', dosage_urdu: 'ایک گولی', otc: true }],
    hospitals: [],
    medicines_status: 'ok',
    hospitals_status: 'ok',
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderHome() {
  return render(
    // Same future flags main.tsx opts into, so the test renders under the
    // router semantics the app actually ships with (and without the warnings).
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Home />
    </MemoryRouter>,
  );
}

async function ask(user: ReturnType<typeof userEvent.setup>, text: string) {
  const field = screen.getByLabelText('Describe your symptoms in Urdu');
  await user.type(field, text);
  await user.click(screen.getByLabelText('Send'));
}

beforeEach(() => {
  vi.clearAllMocks();
  installMockRecognition();
  fetchResults.mockResolvedValue(phaseB());
  // Deny geolocation by default; tests that care install their own.
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    writable: true,
    value: {
      getCurrentPosition: (_ok: unknown, err: (e: unknown) => void) =>
        err({ code: 1, message: 'denied' }),
    },
  });
});

afterEach(() => {
  uninstallRecognition();
});

// -------------------------------------------------------------------------
// Stale-request protection — the highest-risk defect in the dashboard
// -------------------------------------------------------------------------

describe('stale enrichment', () => {
  it("never attaches request A's medicines to request B", async () => {
    const user = userEvent.setup();
    const slowA = deferred<ResultsResponse>();

    analyze
      .mockResolvedValueOnce(phaseA({
        session_id: 'sess-A',
        diseases: [{ disease: 'Malaria', confidence: 'high', urdu: 'ملیریا' }],
      }))
      .mockResolvedValueOnce(phaseA({
        session_id: 'sess-B',
        diseases: [{ disease: 'Dengue', confidence: 'high', urdu: 'ڈینگی' }],
      }));

    fetchResults
      .mockReturnValueOnce(slowA.promise)
      .mockResolvedValueOnce(phaseB({
        medicines: [{ name: 'B-MEDICINE', name_urdu: 'ب', dosage_urdu: 'ب', otc: true }],
      }));

    renderHome();

    await ask(user, 'A');
    await screen.findByText('Malaria');

    // Turn B supersedes turn A while A's enrichment is still in flight.
    await ask(user, 'B');
    await screen.findByText('Dengue');
    await screen.findByText('B-MEDICINE');

    // A's Phase B now lands, late.
    await act(async () => {
      slowA.resolve(phaseB({
        medicines: [{ name: 'A-MEDICINE', name_urdu: 'الف', dosage_urdu: 'الف', otc: true }],
      }));
      await slowA.promise;
    });

    expect(screen.queryByText('A-MEDICINE')).not.toBeInTheDocument();
    expect(screen.getByText('B-MEDICINE')).toBeInTheDocument();
    expect(screen.getByText('Dengue')).toBeInTheDocument();
    expect(screen.queryByText('Malaria')).not.toBeInTheDocument();
  });

  it("does not let a stale fetch clear the new turn's loading state", async () => {
    const user = userEvent.setup();
    const slowA = deferred<ResultsResponse>();
    const neverB = deferred<ResultsResponse>();

    analyze
      .mockResolvedValueOnce(phaseA({ session_id: 'sess-A' }))
      .mockResolvedValueOnce(phaseA({ session_id: 'sess-B' }));
    fetchResults.mockReturnValueOnce(slowA.promise).mockReturnValueOnce(neverB.promise);

    renderHome();
    await ask(user, 'A');
    await screen.findByText('Viral Fever');
    await ask(user, 'B');
    await screen.findByText('Viral Fever');

    await act(async () => {
      slowA.resolve(phaseB());
      await slowA.promise;
    });

    // B is still loading, so the skeleton must still be up — not the
    // "nothing suggested" copy that A's arrival would otherwise trigger.
    expect(screen.getByLabelText('Looking up medicines')).toBeInTheDocument();
  });

  it('aborts the previous enrichment fetch when a new turn starts', async () => {
    const user = userEvent.setup();
    analyze.mockResolvedValue(phaseA());
    fetchResults.mockReturnValue(deferred<ResultsResponse>().promise);

    renderHome();
    await ask(user, 'A');
    await screen.findByText('Viral Fever');

    const firstSignal = fetchResults.mock.calls[0][1] as AbortSignal;
    expect(firstSignal.aborted).toBe(false);

    await ask(user, 'B');
    await waitFor(() => expect(firstSignal.aborted).toBe(true));
  });
});

// -------------------------------------------------------------------------
// Emergency authority
// -------------------------------------------------------------------------

describe('emergency', () => {
  it('shows the directive alone, with no disease or medicine cards', async () => {
    const user = userEvent.setup();
    analyze.mockResolvedValue(phaseA({
      session_id: null,
      diseases: [],
      is_emergency: true,
      response_text_urdu: 'فوری طور پر ہسپتال جائیں',
    }));

    renderHome();
    await ask(user, 'سینے میں درد');

    await screen.findByRole('alertdialog');
    expect(screen.queryByLabelText('Findings')).not.toBeInTheDocument();
    expect(screen.queryByText('Suggested relief')).not.toBeInTheDocument();
    expect(fetchResults).not.toHaveBeenCalled();
  });

  it('clears an earlier consultation, so no medicine sits under the directive', async () => {
    const user = userEvent.setup();
    analyze
      .mockResolvedValueOnce(phaseA())
      .mockResolvedValueOnce(phaseA({
        session_id: null,
        diseases: [],
        is_emergency: true,
        response_text_urdu: 'فوری طور پر ہسپتال جائیں',
      }));

    renderHome();
    await ask(user, 'بخار');
    await screen.findByText('Paracetamol');

    await ask(user, 'سینے میں درد');
    await screen.findByRole('alertdialog');

    expect(screen.queryByLabelText('Findings')).not.toBeInTheDocument();
    expect(screen.queryByText('Paracetamol')).not.toBeInTheDocument();
  });

  it("a previous turn's late enrichment cannot appear beneath an emergency", async () => {
    const user = userEvent.setup();
    const slowA = deferred<ResultsResponse>();

    analyze
      .mockResolvedValueOnce(phaseA({ session_id: 'sess-A' }))
      .mockResolvedValueOnce(phaseA({
        session_id: null, diseases: [], is_emergency: true,
        response_text_urdu: 'فوری طور پر ہسپتال جائیں',
      }));
    fetchResults.mockReturnValueOnce(slowA.promise);

    renderHome();
    await ask(user, 'بخار');
    await screen.findByText('Viral Fever');

    await ask(user, 'سینے میں درد');
    await screen.findByRole('alertdialog');

    await act(async () => {
      slowA.resolve(phaseB({
        medicines: [{ name: 'STALE-MED', name_urdu: 'س', dosage_urdu: 'س', otc: true }],
      }));
      await slowA.promise;
    });

    expect(screen.queryByText('STALE-MED')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Findings')).not.toBeInTheDocument();
  });

  it('does not double-speak: the overlay owns the emergency voice', async () => {
    const user = userEvent.setup();
    analyze.mockResolvedValue(phaseA({
      session_id: null, diseases: [], is_emergency: true,
      response_text_urdu: 'فوری طور پر ہسپتال جائیں',
    }));

    renderHome();
    await ask(user, 'سینے میں درد');
    await screen.findByRole('alertdialog');

    // EmergencyAlert speaks once on mount; the page must not also speak.
    expect(vi.mocked(speech.speakUrdu)).toHaveBeenCalledTimes(1);
  });
});

// -------------------------------------------------------------------------
// Phase B states
// -------------------------------------------------------------------------

describe('Phase B states', () => {
  it('shows a skeleton while loading, never "no medicine"', async () => {
    const user = userEvent.setup();
    analyze.mockResolvedValue(phaseA());
    fetchResults.mockReturnValue(deferred<ResultsResponse>().promise);

    renderHome();
    await ask(user, 'بخار');
    await screen.findByText('Viral Fever');

    expect(screen.getByLabelText('Looking up medicines')).toBeInTheDocument();
    expect(screen.queryByText(/کوئی عام دوا تجویز نہیں/)).not.toBeInTheDocument();
  });

  it('a failed lookup says we could not check, not that nothing exists', async () => {
    const user = userEvent.setup();
    analyze.mockResolvedValue(phaseA());
    fetchResults.mockResolvedValue(phaseB({ medicines: [], medicines_status: 'failed' }));

    renderHome();
    await ask(user, 'بخار');

    await screen.findByText(/دواؤں کی فہرست ابھی حاصل نہیں ہو سکی/);
    expect(screen.queryByText(/کوئی عام دوا تجویز نہیں/)).not.toBeInTheDocument();
  });

  it('an expired session tells the patient to ask again', async () => {
    const user = userEvent.setup();
    analyze.mockResolvedValue(phaseA());
    fetchResults.mockResolvedValue(phaseB({ medicines: [], medicines_status: 'expired' }));

    renderHome();
    await ask(user, 'بخار');
    await screen.findByText(/یہ نتائج محفوظ نہیں رہے/);
  });

  it('a genuine empty result is stated as such', async () => {
    const user = userEvent.setup();
    analyze.mockResolvedValue(phaseA());
    fetchResults.mockResolvedValue(phaseB({ medicines: [], medicines_status: 'ok' }));

    renderHome();
    await ask(user, 'بخار');
    await screen.findByText(/کوئی عام دوا تجویز نہیں کی گئی/);
  });

  it('keeps medicines when only the hospital search failed', async () => {
    const user = userEvent.setup();
    analyze.mockResolvedValue(phaseA());
    fetchResults.mockResolvedValue(phaseB({ hospitals: [], hospitals_status: 'failed' }));

    renderHome();
    await ask(user, 'بخار');

    await screen.findByText('Paracetamol');
    await screen.findByText(/قریبی ہسپتالوں کی تلاش ابھی مکمل نہیں ہو سکی/);
  });

  it('keeps hospitals when only the medicine lookup failed', async () => {
    const user = userEvent.setup();
    analyze.mockResolvedValue(phaseA());
    fetchResults.mockResolvedValue(phaseB({
      medicines: [],
      medicines_status: 'failed',
      hospitals: [{ name: 'PIMS', lat: 33.7, lng: 73.0, address: 'G-8/3', distance_km: 2 }],
      hospitals_status: 'ok',
    }));

    renderHome();
    await ask(user, 'بخار');

    await screen.findByText('PIMS');
    await screen.findByText(/دواؤں کی فہرست ابھی حاصل نہیں ہو سکی/);
  });

  it('marks the hospital list as approximate when geolocation was denied', async () => {
    const user = userEvent.setup();
    analyze.mockResolvedValue(phaseA());
    fetchResults.mockResolvedValue(phaseB({
      hospitals: [{ name: 'PIMS', lat: 33.7, lng: 73.0, address: 'G-8/3', distance_km: 2 }],
    }));

    renderHome();
    await ask(user, 'بخار');

    await screen.findByText('PIMS');
    expect(screen.getByText(/تخمینی مقام پر مبنی/)).toBeInTheDocument();
  });
});

// -------------------------------------------------------------------------
// Triage loop
// -------------------------------------------------------------------------

describe('triage', () => {
  it('keeps the results panel hidden and re-enables the input', async () => {
    const user = userEvent.setup();
    analyze.mockResolvedValue(phaseA({
      session_id: null,
      diseases: [],
      response_text_urdu: 'آپ کو کہاں تکلیف ہو رہی ہے؟',
    }));

    renderHome();
    await ask(user, 'مجھے تکلیف ہے');

    await screen.findByText('آپ کو کہاں تکلیف ہو رہی ہے؟');
    expect(screen.queryByLabelText('Findings')).not.toBeInTheDocument();
    expect(fetchResults).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Describe your symptoms in Urdu')).toBeEnabled();
  });

  it('carries the full history into the next turn', async () => {
    const user = userEvent.setup();
    analyze.mockResolvedValue(phaseA({
      session_id: null, diseases: [], response_text_urdu: 'کہاں؟',
    }));

    renderHome();
    await ask(user, 'تکلیف');
    await screen.findByText('کہاں؟');
    await ask(user, 'سر میں');

    await waitFor(() => expect(analyze).toHaveBeenCalledTimes(2));
    expect(analyze.mock.calls[1][0].history).toEqual([
      { role: 'user', content: 'تکلیف' },
      { role: 'assistant', content: 'کہاں؟' },
    ]);
  });
});

// -------------------------------------------------------------------------
// Geolocation independence
// -------------------------------------------------------------------------

describe('geolocation', () => {
  it('submits without waiting for a location fix', async () => {
    const user = userEvent.setup();
    // Never calls back — the permission prompt is simply ignored.
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true, writable: true, value: { getCurrentPosition: () => {} },
    });
    analyze.mockResolvedValue(phaseA());

    renderHome();
    await ask(user, 'بخار');

    await waitFor(() => expect(analyze).toHaveBeenCalledTimes(1));
    const { latitude, longitude } = analyze.mock.calls[0][0];
    expect(Number.isFinite(latitude)).toBe(true);
    expect(Number.isFinite(longitude)).toBe(true);
  });

  it('completes the consultation when permission is denied', async () => {
    const user = userEvent.setup();
    analyze.mockResolvedValue(phaseA());

    renderHome();
    await ask(user, 'بخار');
    await screen.findByText('Viral Fever');
  });

  it('a late fix does not retro-apply to a request already sent', async () => {
    const user = userEvent.setup();
    let deliver: ((pos: unknown) => void) | null = null;
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true, writable: true,
      value: { getCurrentPosition: (ok: (p: unknown) => void) => { deliver = ok; } },
    });
    analyze.mockResolvedValue(phaseA());

    renderHome();
    await ask(user, 'بخار');
    await waitFor(() => expect(analyze).toHaveBeenCalledTimes(1));
    const sentLat = analyze.mock.calls[0][0].latitude;

    await act(async () => {
      deliver?.({ coords: { latitude: 24.86, longitude: 67.0 } });
    });

    // The already-sent request is unchanged; only the next turn uses the fix.
    expect(analyze.mock.calls[0][0].latitude).toBe(sentLat);

    await ask(user, 'اور سر درد');
    await waitFor(() => expect(analyze).toHaveBeenCalledTimes(2));
    expect(analyze.mock.calls[1][0].latitude).toBeCloseTo(24.86);
  });
});

// -------------------------------------------------------------------------
// Voice
// -------------------------------------------------------------------------

describe('voice input', () => {
  it('toggles on and off without submitting', async () => {
    const user = userEvent.setup();
    analyze.mockResolvedValue(phaseA());
    renderHome();

    const mic = screen.getByLabelText('Start recording');
    await user.click(mic);
    expect(screen.getByLabelText('Stop recording')).toHaveAttribute('aria-pressed', 'true');

    await act(async () => {
      MockRecognition.latest.emitPartial('مجھے بخار');
    });

    await user.click(screen.getByLabelText('Stop recording'));

    expect(analyze).not.toHaveBeenCalled();
    // The partial stays in the field for the patient to send or edit.
    expect(screen.getByLabelText('Describe your symptoms in Urdu')).toHaveValue('مجھے بخار');
  });

  it('auto-submits exactly once per utterance and turns the mic off', async () => {
    const user = userEvent.setup();
    analyze.mockResolvedValue(phaseA());
    renderHome();

    await user.click(screen.getByLabelText('Start recording'));
    const rec = MockRecognition.latest;

    await act(async () => {
      rec.emitFinal('مجھے دو دن سے بخار ہے');
    });
    // A second final from the same activation must be ignored.
    await act(async () => {
      rec.emitFinal('مجھے دو دن سے بخار ہے');
    });

    await waitFor(() => expect(analyze).toHaveBeenCalledTimes(1));
    expect(rec.aborted).toBe(true);
    await waitFor(() =>
      expect(screen.getByLabelText('Start recording')).toBeInTheDocument(),
    );
  });

  it('a manual send while dictating does not also auto-submit', async () => {
    const user = userEvent.setup();
    analyze.mockResolvedValue(phaseA());
    renderHome();

    await user.click(screen.getByLabelText('Start recording'));
    const rec = MockRecognition.latest;

    await user.type(screen.getByLabelText('Describe your symptoms in Urdu'), 'بخار');
    await user.click(screen.getByLabelText('Send'));
    await waitFor(() => expect(analyze).toHaveBeenCalledTimes(1));

    // The recogniser was still live when the patient pressed send; whatever it
    // heard must not become a second consultation.
    await act(async () => {
      rec.emitFinal('کچھ اور');
    });

    expect(analyze).toHaveBeenCalledTimes(1);
  });

  it('handles permission denial without breaking the text path', async () => {
    const user = userEvent.setup();
    analyze.mockResolvedValue(phaseA());
    renderHome();

    await user.click(screen.getByLabelText('Start recording'));
    await act(async () => {
      MockRecognition.latest.emitError('not-allowed');
    });

    await screen.findByText(/Microphone access is off/);
    await ask(user, 'بخار');
    await screen.findByText('Viral Fever');
  });

  it('disables the mic on a browser without SpeechRecognition', async () => {
    uninstallRecognition();
    analyze.mockResolvedValue(phaseA());
    renderHome();
    expect(screen.getByLabelText('Start recording')).toBeDisabled();
    expect(screen.getByLabelText('Describe your symptoms in Urdu')).toBeEnabled();
  });

  it('does not claim to be recording when the recogniser refuses to start', async () => {
    const user = userEvent.setup();
    MockRecognition.failOnStart = true;
    renderHome();

    await user.click(screen.getByLabelText('Start recording'));

    expect(screen.getByLabelText('Start recording')).toHaveAttribute('aria-pressed', 'false');
    await screen.findByText(/couldn't start listening/);
  });
});

// -------------------------------------------------------------------------
// Input bar lifecycle
// -------------------------------------------------------------------------

describe('input bar', () => {
  it('disables during the call and re-enables when Phase A returns', async () => {
    const user = userEvent.setup();
    const pending = deferred<AnalyzeResponse>();
    analyze.mockReturnValue(pending.promise);

    renderHome();
    await ask(user, 'بخار');

    const field = screen.getByLabelText('Describe your symptoms in Urdu');
    expect(field).toBeDisabled();
    expect(screen.getByLabelText('Start recording')).toBeDisabled();

    await act(async () => {
      pending.resolve(phaseA({ session_id: null, diseases: [], response_text_urdu: 'کہاں؟' }));
      await pending.promise;
    });

    await waitFor(() => expect(field).toBeEnabled());
    expect(screen.getByLabelText('Start recording')).toBeEnabled();
  });

  it('rapid repeated sends produce one request, not several', async () => {
    const user = userEvent.setup();
    const pending = deferred<AnalyzeResponse>();
    analyze.mockReturnValue(pending.promise);

    renderHome();
    const field = screen.getByLabelText('Describe your symptoms in Urdu');
    await user.type(field, 'بخار');

    const send = screen.getByLabelText('Send');
    await user.click(send);
    await user.click(send).catch(() => {});
    await user.click(send).catch(() => {});

    expect(analyze).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve(phaseA());
      await pending.promise;
    });
  });

  it('re-enables after a network failure and shows an Urdu error bubble', async () => {
    const user = userEvent.setup();
    analyze.mockRejectedValue(new Error('offline'));

    renderHome();
    await ask(user, 'بخار');

    await screen.findByText(/شفا سے رابطہ نہیں ہو سکا/);
    expect(screen.getByLabelText('Describe your symptoms in Urdu')).toBeEnabled();
    expect(screen.queryByLabelText('Findings')).not.toBeInTheDocument();
  });
});

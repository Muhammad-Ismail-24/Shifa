import { describe, expect, it, beforeEach } from 'vitest';

import { WaveformRenderer } from '../waveform';
import type { AudioSampleBuffer } from '../audioEngine';

const FFT = 2048;

/** Minimal AnalyserNode stand-in that replays a fixed time-domain frame. */
function fakeAnalyser(fill: (i: number) => number): AnalyserNode {
  return {
    fftSize: FFT,
    getByteTimeDomainData(target: Uint8Array) {
      for (let i = 0; i < target.length; i++) target[i] = fill(i);
    },
  } as unknown as AnalyserNode;
}

function newBuffer(): AudioSampleBuffer {
  return new Uint8Array(FFT);
}

function makeRenderer() {
  const canvas = document.createElement('canvas');
  // jsdom has no 2d context and logs a "Not implemented" trace for every call.
  // Returning null explicitly exercises the renderer's headless path quietly.
  canvas.getContext = (() => null) as HTMLCanvasElement['getContext'];
  return new WaveformRenderer(canvas);
}

/** Run enough frames for the temporal smoothing to converge. */
function settle(r: WaveformRenderer, analyser: AnalyserNode | null, state: string, frames = 90, envelope = 0) {
  const buffer = newBuffer();
  for (let i = 0; i < frames; i++) {
    r.render(analyser, buffer, analyser ? 'mic' : 'generated', state, envelope, i * 16);
  }
}

describe('waveform renderer', () => {
  let renderer: WaveformRenderer;
  beforeEach(() => {
    renderer = makeRenderer();
  });

  it('renders a flat line for digital silence', () => {
    settle(renderer, fakeAnalyser(() => 128), 'listening');
    expect(renderer.peakExcursion()).toBeLessThan(0.02);
  });

  it('gates out low-level room tone', () => {
    // +/- 1 LSB of dither around centre.
    settle(renderer, fakeAnalyser((i) => 128 + (i % 2 === 0 ? 1 : -1)), 'listening');
    expect(renderer.peakExcursion()).toBeLessThan(0.02);
  });

  it('produces real excursion from a speech-like signal', () => {
    // 200Hz-ish sine at moderate level — a voiced vowel.
    const analyser = fakeAnalyser((i) => 128 + Math.round(Math.sin(i / 12) * 70));
    settle(renderer, analyser, 'user-speaking');
    expect(renderer.peakExcursion()).toBeGreaterThan(0.1);
  });

  it('does not cancel the signal through the spatial kernel', () => {
    // Regression guard. An earlier version took |peak| per bin and applied an
    // alternating sign, producing a Nyquist-rate sequence. The [0.25,0.5,0.25]
    // smoothing kernel has exactly zero gain at Nyquist, so the mic waveform
    // collapsed to a flat line no matter how loud the input was.
    const loud = fakeAnalyser((i) => 128 + Math.round(Math.sin(i / 8) * 120));
    settle(renderer, loud, 'user-speaking');
    expect(renderer.peakExcursion()).toBeGreaterThan(0.15);
  });

  it('scales louder input to a larger excursion than quiet input', () => {
    const quiet = makeRenderer();
    settle(quiet, fakeAnalyser((i) => 128 + Math.round(Math.sin(i / 12) * 18)), 'user-speaking');

    const loud = makeRenderer();
    settle(loud, fakeAnalyser((i) => 128 + Math.round(Math.sin(i / 12) * 110)), 'user-speaking');

    expect(loud.peakExcursion()).toBeGreaterThan(quiet.peakExcursion());
  });

  it('clamps absurdly loud input instead of exploding off the card', () => {
    const clipping = fakeAnalyser((i) => (i % 2 === 0 ? 255 : 0));
    settle(renderer, clipping, 'user-speaking');
    // Normalised space is -1..1; the ceiling must hold.
    expect(renderer.peakExcursion()).toBeLessThanOrEqual(1.0001);
  });

  it('keeps idle nearly flat but not perfectly straight', () => {
    settle(renderer, null, 'idle');
    const peak = renderer.peakExcursion();
    expect(peak).toBeGreaterThan(0.01); // visibly a wave, not a divider rule
    expect(peak).toBeLessThan(0.25); // still "nearly flat"
  });

  it('gives thinking more presence than idle', () => {
    const idle = makeRenderer();
    settle(idle, null, 'idle', 200);
    const thinking = makeRenderer();
    settle(thinking, null, 'thinking', 200);
    expect(thinking.peakExcursion()).toBeGreaterThan(idle.peakExcursion());
  });

  it('generates thinking motion deterministically', () => {
    // Not Math.random(): the same clock must give the same shape.
    const a = makeRenderer();
    const b = makeRenderer();
    settle(a, null, 'thinking', 60);
    settle(b, null, 'thinking', 60);
    expect(Array.from(a.getPoints())).toEqual(Array.from(b.getPoints()));
  });

  it('damps amplitude under prefers-reduced-motion but keeps working', () => {
    const normal = makeRenderer();
    settle(normal, fakeAnalyser((i) => 128 + Math.round(Math.sin(i / 12) * 90)), 'user-speaking');

    const reduced = makeRenderer();
    reduced.setReducedMotion(true);
    settle(reduced, fakeAnalyser((i) => 128 + Math.round(Math.sin(i / 12) * 90)), 'user-speaking');

    expect(reduced.peakExcursion()).toBeLessThan(normal.peakExcursion());
    // Still a functional indicator, not switched off.
    expect(reduced.peakExcursion()).toBeGreaterThan(0.02);
  });

  it('decays rather than snapping when the signal stops', () => {
    const analyser = fakeAnalyser((i) => 128 + Math.round(Math.sin(i / 12) * 100));
    settle(renderer, analyser, 'user-speaking');
    const loudPeak = renderer.peakExcursion();

    const buffer = newBuffer();
    // A single silent frame must not zero the line. The timestamp must be a
    // realistic next frame: decay is time-based, so an artificial multi-second
    // jump would legitimately collapse the line and prove nothing.
    renderer.render(fakeAnalyser(() => 128), buffer, 'mic', 'user-speaking', 0, 90 * 16);
    const afterOne = renderer.peakExcursion();

    expect(afterOne).toBeLessThan(loudPeak);
    expect(afterOne).toBeGreaterThan(loudPeak * 0.5);
  });
});

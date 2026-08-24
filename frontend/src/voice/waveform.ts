/**
 * The audio-reactive line at the bottom of the status card.
 *
 * Design constraint from the reference: a single thin black stroke with rounded
 * caps — no bars, no fill, no glow. So this is not a spectrum analyser. It bins
 * the *time-domain* signal into a small number of control points and draws a
 * Catmull-Rom spline through them, which is what makes speech read as smooth
 * peaks rather than raw jagged sample noise.
 *
 * Everything is preallocated. This runs at 60fps for the entire session, so a
 * single per-frame array allocation would be a GC sawtooth in the profile.
 */

import type { AudioSampleBuffer } from './audioEngine';
import type { WaveSource } from './voiceState';

/** Control points across the width. Enough for speech detail, few enough to stay smooth. */
const POINTS = 56;

/** Logical drawing space, matching the reference SVG's viewBox. */
const VIEW_W = 220;
const VIEW_H = 50;
const CENTER_Y = 28;

const STROKE_WIDTH = 1.8;

/** Nominal frame interval, used for the first sample only. */
const WAVE_FRAME_MS = 16.7;
/** tau 21ms / 111ms reproduce the previous 0.45 / 0.14 per-frame coefficients. */
const WAVE_ATTACK_TAU_MS = 21;
const WAVE_RELEASE_TAU_MS = 111;

function clampWaveDt(dt: number): number {
  if (!Number.isFinite(dt) || dt <= 0) return WAVE_FRAME_MS;
  return dt > 100 ? 100 : dt;
}

function waveAlpha(dt: number, tauMs: number): number {
  return 1 - Math.exp(-dt / tauMs);
}

/** Peak vertical excursion in logical units, before per-state scaling. */
const MAX_AMPLITUDE = 19;

export interface WaveformStateStyle {
  /** Multiplier on the incoming signal. */
  gain: number;
  /** Ceiling on excursion, 0..1 of MAX_AMPLITUDE. */
  ceiling: number;
  /** Baseline motion when there is no signal at all. */
  idleAmplitude: number;
}

/**
 * Per-state amplitude character. These numbers are the difference between
 * "alive" and "music visualiser", so they are intentionally conservative.
 */
export const WAVE_STYLES: Record<string, WaveformStateStyle> = {
  idle: { gain: 0, ceiling: 0.2, idleAmplitude: 0.17 },
  'requesting-permission': { gain: 0, ceiling: 0.24, idleAmplitude: 0.2 },
  listening: { gain: 5.2, ceiling: 0.45, idleAmplitude: 0.16 },
  'user-speaking': { gain: 6.5, ceiling: 1.0, idleAmplitude: 0.14 },
  thinking: { gain: 0, ceiling: 0.42, idleAmplitude: 0.38 },
  speaking: { gain: 6.0, ceiling: 0.85, idleAmplitude: 0.1 },
  interrupted: { gain: 5.5, ceiling: 0.5, idleAmplitude: 0.06 },
  error: { gain: 0, ceiling: 0.16, idleAmplitude: 0.12 },
  'mic-denied': { gain: 0, ceiling: 0.16, idleAmplitude: 0.12 },
};

const DEFAULT_STYLE: WaveformStateStyle = WAVE_STYLES.idle;

export class WaveformRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;

  /** Smoothed control points, in normalised -1..1 space. */
  private points = new Float32Array(POINTS);
  /** Scratch target for the current frame. */
  private target = new Float32Array(POINTS);
  /** Scratch for the spatial smoothing pass. */
  private scratch = new Float32Array(POINTS);

  private cssWidth = VIEW_W;
  private cssHeight = VIEW_H;
  private dpr = 1;

  private reducedMotion = false;

  /** Previous frame timestamp, for frame-rate-independent smoothing. */
  private lastTime = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.resize();
  }

  setReducedMotion(value: boolean): void {
    this.reducedMotion = value;
  }

  /** Match the backing store to the element's CSS box. Cheap when unchanged. */
  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width || VIEW_W;
    const h = rect.height || VIEW_H;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    if (w === this.cssWidth && h === this.cssHeight && dpr === this.dpr) return;

    this.cssWidth = w;
    this.cssHeight = h;
    this.dpr = dpr;

    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
  }

  /**
   * Advance and draw one frame.
   *
   * @param analyser  live analyser when source is 'mic'/'output', else null
   * @param buffer    preallocated scratch matching analyser.fftSize
   * @param source    which signal drives the line
   * @param stateKey  VoiceState value, selects the amplitude character
   * @param envelope  0..1 fallback level for 'output' when no analyser exists
   * @param timeMs    monotonic clock for generated motion
   */
  render(
    analyser: AnalyserNode | null,
    buffer: AudioSampleBuffer,
    source: WaveSource,
    stateKey: string,
    envelope: number,
    timeMs: number,
  ): void {
    const style = WAVE_STYLES[stateKey] ?? DEFAULT_STYLE;

    if (source === 'generated' || !analyser) {
      this.fillGenerated(stateKey, envelope, timeMs, style);
    } else {
      this.fillFromAnalyser(analyser, buffer, style);
    }

    const dt = this.lastTime === 0 ? WAVE_FRAME_MS : clampWaveDt(timeMs - this.lastTime);
    this.lastTime = timeMs;

    this.smoothSpatial();
    this.smoothTemporal(dt);

    // No 2d context under jsdom, and nothing to paint into on a detached
    // canvas. The processing above still runs so it can be asserted on.
    if (this.ctx) this.draw(this.ctx);
  }

  /** Current smoothed control points, normalised to -1..1. Exposed for tests. */
  getPoints(): Readonly<Float32Array> {
    return this.points;
  }

  /** Largest absolute excursion in the current frame. Exposed for tests. */
  peakExcursion(): number {
    let peak = 0;
    for (let i = 0; i < POINTS; i++) {
      const a = Math.abs(this.points[i]);
      if (a > peak) peak = a;
    }
    return peak;
  }

  /** Bin the time-domain signal into POINTS peak values. */
  private fillFromAnalyser(analyser: AnalyserNode, buffer: AudioSampleBuffer, style: WaveformStateStyle): void {
    analyser.getByteTimeDomainData(buffer);

    const n = buffer.length;
    const binSize = Math.floor(n / POINTS) || 1;

    for (let i = 0; i < POINTS; i++) {
      const start = i * binSize;
      const end = Math.min(start + binSize, n);

      // Signed extreme of the bin, not |peak|: keeping the sign traces the
      // actual waveform so the line oscillates about the centre on its own.
      // (An |peak| value with an alternating sign applied would be a
      // Nyquist-rate signal, which the spatial kernel below nulls to zero.)
      let extreme = 0;
      let mag = 0;
      for (let j = start; j < end; j++) {
        const v = (buffer[j] - 128) / 128;
        const a = v < 0 ? -v : v;
        if (a > mag) {
          mag = a;
          extreme = v;
        }
      }

      // Noise gate, then gain. Below the gate the line goes genuinely flat
      // rather than shimmering on room tone.
      const gated = mag < 0.012 ? 0 : mag - 0.012;
      const signed = extreme < 0 ? -gated : gated;
      let v = signed * style.gain;
      if (v > style.ceiling) v = style.ceiling;
      else if (v < -style.ceiling) v = -style.ceiling;

      // Taper the ends so the stroke settles onto the centre line at the edges.
      this.target[i] = v * edgeTaper(i);
    }
  }

  /**
   * Motion for states with no meaningful audio source.
   *
   * THINKING is the important one: two travelling sines at incommensurable
   * frequencies produce a slow, coherent interference pattern that reads as
   * deliberate processing. Deterministic on purpose — Math.random() here is
   * exactly the fake visualiser this design must not be.
   */
  private fillGenerated(
    stateKey: string,
    envelope: number,
    timeMs: number,
    style: WaveformStateStyle,
  ): void {
    const t = timeMs / 1000;

    for (let i = 0; i < POINTS; i++) {
      const x = i / (POINTS - 1);
      let v: number;

      if (stateKey === 'thinking') {
        const a = Math.sin(x * 7.0 - t * 1.15);
        const b = Math.sin(x * 4.3 + t * 0.78);
        v = (a * 0.6 + b * 0.4) * style.idleAmplitude;
      } else if (stateKey === 'speaking') {
        // Envelope-driven fallback when the TTS provider exposes no signal.
        const a = Math.sin(x * 9.5 - t * 3.4);
        const b = Math.sin(x * 5.1 + t * 2.2);
        v = (a * 0.55 + b * 0.45) * (style.idleAmplitude + envelope * style.ceiling);
      } else {
        // Idle breath: barely perceptible, one slow wave across the width.
        const breath = Math.sin(t * 0.55) * 0.5 + 0.5;
        v =
          (Math.sin(x * 5.6 - t * 0.42) * 0.62 + Math.sin(x * 2.7 + t * 0.28) * 0.38) *
          style.idleAmplitude *
          (0.6 + breath * 0.4);
      }

      this.target[i] = v * edgeTaper(i);
    }
  }

  /** Three-tap blur across neighbours — removes single-bin spikes. */
  private smoothSpatial(): void {
    const src = this.target;
    const dst = this.scratch;

    dst[0] = (src[0] * 2 + src[1]) / 3;
    for (let i = 1; i < POINTS - 1; i++) {
      dst[i] = src[i - 1] * 0.25 + src[i] * 0.5 + src[i + 1] * 0.25;
    }
    dst[POINTS - 1] = (src[POINTS - 1] * 2 + src[POINTS - 2]) / 3;

    this.scratch = src;
    this.target = dst;
  }

  /**
   * Asymmetric attack/release — snappy onset, natural decay.
   * Time-based so the line behaves the same at 30fps as at 60fps.
   */
  private smoothTemporal(dt: number): void {
    const damp = this.reducedMotion ? 0.4 : 1;
    const attack = waveAlpha(dt, WAVE_ATTACK_TAU_MS);
    const release = waveAlpha(dt, WAVE_RELEASE_TAU_MS);

    for (let i = 0; i < POINTS; i++) {
      const goal = this.target[i] * damp;
      const rising = Math.abs(goal) > Math.abs(this.points[i]);
      this.points[i] += (goal - this.points[i]) * (rising ? attack : release);
    }
  }

  /** Stroke a Catmull-Rom spline through the control points. */
  private draw(ctx: CanvasRenderingContext2D): void {
    const { cssWidth: w, cssHeight: h, dpr } = this;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const scaleX = w / VIEW_W;
    const scaleY = h / VIEW_H;
    const step = VIEW_W / (POINTS - 1);

    const px = (i: number) => i * step * scaleX;
    const py = (i: number) => (CENTER_Y + this.points[i] * MAX_AMPLITUDE) * scaleY;

    ctx.beginPath();
    ctx.moveTo(px(0), py(0));

    for (let i = 0; i < POINTS - 1; i++) {
      const i0 = i === 0 ? 0 : i - 1;
      const i3 = i + 2 > POINTS - 1 ? POINTS - 1 : i + 2;

      // Catmull-Rom control points expressed as a cubic Bezier segment.
      const c1x = px(i) + (px(i + 1) - px(i0)) / 6;
      const c1y = py(i) + (py(i + 1) - py(i0)) / 6;
      const c2x = px(i + 1) - (px(i3) - px(i)) / 6;
      const c2y = py(i + 1) - (py(i3) - py(i)) / 6;

      ctx.bezierCurveTo(c1x, c1y, c2x, c2y, px(i + 1), py(i + 1));
    }

    ctx.strokeStyle = '#000';
    ctx.lineWidth = STROKE_WIDTH * Math.min(scaleX, scaleY) * 1.15;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}

/** Smooth 0..1 window that pins both ends of the line to centre. */
function edgeTaper(i: number): number {
  const x = i / (POINTS - 1);
  return Math.sin(Math.PI * x) ** 0.65;
}

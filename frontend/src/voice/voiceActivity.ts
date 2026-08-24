/**
 * Voice activity detection with hysteresis.
 *
 * The requirement that shapes this file: ambient room noise must never make the
 * UI look like it is hearing speech, and the gap between two words must never
 * be read as the end of a sentence. Both are solved with two thresholds and two
 * timers rather than one of each.
 */

export interface VoiceActivityOptions {
  /** RMS above which audio counts as speech. */
  speechThreshold?: number;
  /** RMS below which audio counts as silence. Lower than speechThreshold. */
  silenceThreshold?: number;
  /** Sustained speech required before declaring the user is speaking (ms). */
  minSpeechMs?: number;
  /** Sustained silence after speech before the utterance is complete (ms). */
  silenceHoldMs?: number;
  /** Hard ceiling on a single utterance (ms). */
  maxUtteranceMs?: number;
}

const DEFAULTS: Required<VoiceActivityOptions> = {
  // Tuned against a laptop mic in a quiet room with echoCancellation on.
  // Retune empirically per deployment; these are a starting point, not gospel.
  speechThreshold: 0.045,
  silenceThreshold: 0.022,
  minSpeechMs: 200,
  silenceHoldMs: 900,
  maxUtteranceMs: 20000,
};

export type VoiceActivityEvent = 'speech-start' | 'speech-end' | 'utterance-timeout' | null;

/** Nominal frame interval, used for the very first sample only. */
const FRAME_MS = 16.7;

/**
 * Smoothing time constants, chosen to reproduce the previous 60fps feel:
 * alpha = 1 - exp(-dt/tau), so tau 39ms == the old 0.35 per-frame coefficient
 * and tau 130ms == the old 0.12.
 */
const ATTACK_TAU_MS = 39;
const RELEASE_TAU_MS = 130;
const NOISE_FLOOR_TAU_MS = 830;

/** Clamp dt so a backgrounded tab cannot resume with one enormous step. */
function clampDt(dt: number): number {
  if (!Number.isFinite(dt) || dt <= 0) return FRAME_MS;
  return dt > 100 ? 100 : dt;
}

function alphaFor(dt: number, tauMs: number): number {
  return 1 - Math.exp(-dt / tauMs);
}

export class VoiceActivityDetector {
  private opts: Required<VoiceActivityOptions>;

  private speaking = false;
  private aboveSince = 0;
  private belowSince = 0;
  private utteranceStart = 0;

  /** Exponentially smoothed RMS — what the UI should react to. */
  private smoothed = 0;

  /** Rolling estimate of the room's noise floor, used to bias the gate. */
  private noiseFloor = 0.01;

  /** Timestamp of the previous frame, for time-based smoothing. */
  private lastNow = 0;

  constructor(options: VoiceActivityOptions = {}) {
    this.opts = { ...DEFAULTS, ...options };
  }

  reset(): void {
    this.speaking = false;
    this.aboveSince = 0;
    this.belowSince = 0;
    this.utteranceStart = 0;
    this.smoothed = 0;
    this.lastNow = 0;
  }

  get smoothedLevel(): number {
    return this.smoothed;
  }

  get isSpeaking(): boolean {
    return this.speaking;
  }

  /**
   * Feed one frame. Returns a transition event, or null when nothing changed.
   *
   * `suppress` is set while Shifa is speaking through the speakers: echo
   * cancellation is imperfect, so raising the bar there is what stops Shifa
   * from interrupting itself.
   */
  push(level: number, now: number, suppress = false): VoiceActivityEvent {
    // Time-based rather than per-frame smoothing. With a fixed per-frame
    // coefficient the attack/release times stretch with the frame rate, so a
    // 30fps phone would react half as fast as a 60fps laptop and a throttled
    // background tab would barely react at all. Deriving alpha from dt makes
    // the behaviour identical everywhere.
    const dt = this.lastNow === 0 ? FRAME_MS : clampDt(now - this.lastNow);
    this.lastNow = now;

    // Asymmetric: rise fast so the waveform feels immediate, fall slowly so it
    // decays musically instead of snapping to zero between words.
    const tau = level > this.smoothed ? ATTACK_TAU_MS : RELEASE_TAU_MS;
    this.smoothed += (level - this.smoothed) * alphaFor(dt, tau);

    if (!this.speaking) {
      // Track the floor only while quiet, so speech never inflates it.
      const floorTarget = Math.min(level, this.noiseFloor * 2 + 0.005);
      this.noiseFloor += (floorTarget - this.noiseFloor) * alphaFor(dt, NOISE_FLOOR_TAU_MS);
    }

    const gate = suppress ? 2.4 : 1;
    const speechAt = Math.max(this.opts.speechThreshold, this.noiseFloor * 3) * gate;
    const silenceAt = Math.max(this.opts.silenceThreshold, this.noiseFloor * 1.8) * gate;

    if (!this.speaking) {
      if (this.smoothed >= speechAt) {
        if (this.aboveSince === 0) this.aboveSince = now;
        if (now - this.aboveSince >= this.opts.minSpeechMs) {
          this.speaking = true;
          this.belowSince = 0;
          this.utteranceStart = this.aboveSince;
          return 'speech-start';
        }
      } else {
        this.aboveSince = 0;
      }
      return null;
    }

    if (now - this.utteranceStart >= this.opts.maxUtteranceMs) {
      this.speaking = false;
      this.aboveSince = 0;
      this.belowSince = 0;
      return 'utterance-timeout';
    }

    if (this.smoothed <= silenceAt) {
      if (this.belowSince === 0) this.belowSince = now;
      if (now - this.belowSince >= this.opts.silenceHoldMs) {
        this.speaking = false;
        this.aboveSince = 0;
        this.belowSince = 0;
        return 'speech-end';
      }
    } else {
      this.belowSince = 0;
    }

    return null;
  }
}

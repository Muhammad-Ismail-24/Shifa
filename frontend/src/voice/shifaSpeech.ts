/**
 * Shifa's outgoing voice, and the signal that drives the SPEAKING waveform.
 *
 * There are two playback paths, and the difference matters:
 *
 *  1. AUDIO-ELEMENT path (preferred). Any TTS that yields a URL or Blob plays
 *     through an <audio> element routed into a real AnalyserNode, so the
 *     waveform follows Shifa's actual output signal sample by sample.
 *
 *  2. SPEECH-SYNTHESIS path (fallback, and what the team spec mandates today).
 *     window.speechSynthesis renders straight to the output device and exposes
 *     no audio stream — there is no supported way to route it into Web Audio.
 *     So instead of faking amplitude, this path derives a real *envelope* from
 *     the utterance's own onboundary/onstart/onend events: genuine timing from
 *     genuine TTS progress, marked as such via `signalKind` so the UI never
 *     claims more fidelity than it has.
 *
 * Point an `audioUrlResolver` at a server TTS endpoint and path 1 takes over
 * with no other change.
 */

import type { AudioEngine } from './audioEngine';

export type SpeechSignalKind = 'analyser' | 'envelope' | 'none';

export interface SpeakHandle {
  /** Resolves when playback finishes or is cancelled. */
  done: Promise<void>;
  cancel: () => void;
}

export type AudioUrlResolver = (text: string) => Promise<string | null>;

export class ShifaSpeech {
  private engine: AudioEngine;
  private audioEl: HTMLAudioElement | null = null;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private cancelled = false;

  private envelope = 0;
  private envelopeDecayFrom = 0;
  private signal: SpeechSignalKind = 'none';

  /** Supply to switch onto the real-analyser path. */
  audioUrlResolver: AudioUrlResolver | null = null;

  constructor(engine: AudioEngine) {
    this.engine = engine;
  }

  /**
   * Unlock the browser's speech synthesis engine during a user gesture.
   *
   * Chrome and Safari revoke the "user activation" token ~5 seconds after the
   * click. Our API round-trip takes 15-20s, so by the time the Urdu response
   * arrives, `speechSynthesis.speak()` is silently blocked by autoplay policy.
   *
   * Calling this method **inside the click handler** speaks a zero-length
   * silent utterance, which creates an active speech session that persists
   * past the gesture timeout. The real `speak()` call then succeeds later.
   */
  warmSynthesis(): void {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    if (!synth) return;

    // Cancel any prior queue, then speak a silent empty utterance.
    synth.cancel();
    const warm = new SpeechSynthesisUtterance('');
    warm.volume = 0;
    warm.rate = 10; // finish instantly
    synth.speak(warm);
  }

  get signalKind(): SpeechSignalKind {
    return this.signal;
  }

  /**
   * Envelope 0..1 for the waveform when no analyser is available.
   * Decays between word boundaries so the line breathes with speech cadence.
   */
  get currentEnvelope(): number {
    if (this.signal !== 'envelope') return 0;
    const elapsed = performance.now() - this.envelopeDecayFrom;
    const decayed = this.envelope * Math.exp(-elapsed / 260);
    return decayed < 0.02 ? 0.12 : decayed;
  }

  speak(text: string, lang = 'ur-PK'): SpeakHandle {
    this.cancel();
    this.cancelled = false;

    let cancelFn = () => {};
    const done = new Promise<void>((resolve) => {
      void this.begin(text, lang, resolve).then((fn) => {
        cancelFn = fn;
      });
    });

    return {
      done,
      cancel: () => {
        this.cancelled = true;
        cancelFn();
        this.cancel();
      },
    };
  }

  private async begin(text: string, lang: string, resolve: () => void): Promise<() => void> {
    // Path 1: real audio stream, real analyser.
    if (this.audioUrlResolver) {
      try {
        const url = await this.audioUrlResolver(text);
        if (this.cancelled) {
          resolve();
          return () => {};
        }
        if (url) return this.playElement(url, resolve);
      } catch {
        // fall through to speech synthesis
      }
    }

    // Path 2: browser speech synthesis + real event envelope.
    return this.playSynthesis(text, lang, resolve);
  }

  private async playElement(url: string, resolve: () => void): Promise<() => void> {
    const el = this.audioEl ?? new Audio();
    el.crossOrigin = 'anonymous';
    el.src = url;
    this.audioEl = el;

    const analyser = await this.engine.connectOutputElement(el);
    this.signal = analyser ? 'analyser' : 'envelope';
    this.envelope = 0.5;
    this.envelopeDecayFrom = performance.now();

    const finish = () => {
      el.removeEventListener('ended', finish);
      el.removeEventListener('error', finish);
      this.signal = 'none';
      resolve();
    };
    el.addEventListener('ended', finish);
    el.addEventListener('error', finish);

    try {
      await el.play();
    } catch {
      // Autoplay blocked (Safari/iOS outside a gesture) — surface as finished
      // rather than stranding the caller in SPEAKING forever.
      finish();
    }

    return () => {
      el.pause();
      finish();
    };
  }

  private playSynthesis(text: string, lang: string, resolve: () => void): () => void {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    if (!synth) {
      this.signal = 'none';
      resolve();
      return () => {};
    }

    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = lang;
    utter.rate = 0.95;
    this.currentUtterance = utter;

    this.signal = 'envelope';
    this.envelope = 0.45;
    this.envelopeDecayFrom = performance.now();

    // Each word boundary is a real event from the real synthesiser. Pumping the
    // envelope here is what makes the line track Shifa's actual speech cadence.
    utter.onboundary = () => {
      this.envelope = 0.55 + Math.min(0.35, this.envelope * 0.3);
      this.envelopeDecayFrom = performance.now();
    };

    const finish = () => {
      this.signal = 'none';
      this.currentUtterance = null;
      resolve();
    };
    utter.onend = finish;
    utter.onerror = finish;

    synth.speak(utter);

    return () => {
      synth.cancel();
      finish();
    };
  }

  /** Stop immediately — used for barge-in and conversation teardown. */
  cancel(): void {
    if (this.audioEl) {
      this.audioEl.pause();
    }
    if (typeof window !== 'undefined' && window.speechSynthesis && this.currentUtterance) {
      window.speechSynthesis.cancel();
      this.currentUtterance = null;
    }
    this.signal = 'none';
  }

  /** Duck rather than stop — gentler barge-in when supported. */
  duck(): void {
    if (this.audioEl) this.audioEl.volume = 0.25;
  }

  unduck(): void {
    if (this.audioEl) this.audioEl.volume = 1;
  }
}

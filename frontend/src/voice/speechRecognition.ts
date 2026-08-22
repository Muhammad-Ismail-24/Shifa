/**
 * Urdu speech-to-text via the browser Web Speech API.
 *
 * The team specification mandates window.webkitSpeechRecognition with
 * lang = 'ur-PK' (free, no key, good enough on Chrome/Edge). This wrapper
 * exists so the rest of the app never touches the vendor-prefixed global, and
 * so a server STT can replace it behind the same interface later.
 *
 * Note SpeechRecognition opens its own microphone internally and does not
 * expose that stream, so the waveform analyser must run its own getUserMedia.
 * Two concurrent captures is the documented cost of using this API; Chrome and
 * Edge handle it, and it is the reason mic teardown is explicit everywhere.
 */

export interface RecognitionCallbacks {
  onPartial?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (kind: 'no-speech' | 'not-allowed' | 'network' | 'unknown') => void;
  onEnd?: () => void;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
}

type RecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getRecognitionCtor() !== null;
}

export class UrduSpeechRecognizer {
  private recognition: SpeechRecognitionLike | null = null;
  private running = false;
  private lang: string;

  constructor(lang = 'ur-PK') {
    this.lang = lang;
  }

  get isRunning(): boolean {
    return this.running;
  }

  start(callbacks: RecognitionCallbacks): boolean {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return false;
    if (this.running) return true;

    const rec = new Ctor();
    rec.lang = this.lang;
    // Continuous so multi-turn conversation does not need a click per sentence;
    // utterance boundaries come from the local VAD.
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = String(result[0]?.transcript ?? '').trim();
        if (!transcript) continue;
        if (result.isFinal) {
          callbacks.onFinal?.(transcript);
        } else {
          interim += `${transcript} `;
        }
      }
      const trimmed = interim.trim();
      if (trimmed) callbacks.onPartial?.(trimmed);
    };

    rec.onerror = (event: any) => {
      const code = String(event?.error ?? '');
      if (code === 'no-speech') callbacks.onError?.('no-speech');
      else if (code === 'not-allowed' || code === 'service-not-allowed') callbacks.onError?.('not-allowed');
      else if (code === 'network') callbacks.onError?.('network');
      else if (code !== 'aborted') callbacks.onError?.('unknown');
    };

    rec.onend = () => {
      this.running = false;
      callbacks.onEnd?.();
    };

    this.recognition = rec;
    try {
      rec.start();
      this.running = true;
      return true;
    } catch {
      this.running = false;
      return false;
    }
  }

  stop(): void {
    if (!this.recognition) return;
    try {
      this.recognition.stop();
    } catch {
      /* already stopped */
    }
  }

  abort(): void {
    if (!this.recognition) return;
    try {
      this.recognition.abort();
    } catch {
      /* already stopped */
    }
    this.running = false;
    this.recognition = null;
  }
}

/**
 * A controllable stand-in for window.SpeechRecognition.
 *
 * jsdom has no Web Speech API, and the real one needs a microphone and a
 * network service. This lets a test drive the exact sequence that matters:
 * start, partial, final, abort — and assert how many times the app submits.
 */

export class MockRecognition {
  static instances: MockRecognition[] = [];
  /** Make `start()` throw, the way Chrome does when the mic is already held. */
  static failOnStart = false;

  lang = '';
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  started = false;
  aborted = false;

  onresult: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  onend: (() => void) | null = null;

  constructor() {
    MockRecognition.instances.push(this);
  }

  start() {
    if (MockRecognition.failOnStart) throw new Error('already started');
    this.started = true;
  }

  stop() {
    this.started = false;
    this.onend?.();
  }

  abort() {
    this.aborted = true;
    this.started = false;
    this.onend?.();
  }

  // ---- test drivers ----

  emitPartial(text: string) {
    this.onresult?.({
      resultIndex: 0,
      results: [Object.assign([{ transcript: text }], { isFinal: false })],
    });
  }

  emitFinal(text: string) {
    this.onresult?.({
      resultIndex: 0,
      results: [Object.assign([{ transcript: text }], { isFinal: true })],
    });
  }

  emitError(code: string) {
    this.onerror?.({ error: code });
  }

  static reset() {
    MockRecognition.instances = [];
    MockRecognition.failOnStart = false;
  }

  static get latest(): MockRecognition {
    const last = MockRecognition.instances.at(-1);
    if (!last) throw new Error('No recogniser was constructed — the mic never started.');
    return last;
  }
}

export function installMockRecognition() {
  MockRecognition.reset();
  (window as any).SpeechRecognition = MockRecognition;
  (window as any).webkitSpeechRecognition = MockRecognition;
}

export function uninstallRecognition() {
  delete (window as any).SpeechRecognition;
  delete (window as any).webkitSpeechRecognition;
}

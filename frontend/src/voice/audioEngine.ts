/**
 * Owns every Web Audio resource on the page: one AudioContext, one microphone
 * stream, one input analyser, one output analyser.
 *
 * Centralised because the two classic bugs in a voice UI are both lifecycle
 * bugs — leaking a second AudioContext per conversation, and calling
 * createMediaElementSource twice on the same <audio> element (which throws
 * InvalidStateError and permanently mutes that element). Both are structurally
 * impossible here: the context is a singleton and element sources are cached.
 */

const FFT_SIZE = 2048;

/**
 * Time-domain scratch buffer.
 *
 * Explicitly backed by ArrayBuffer: TypeScript 5.7 made TypedArrays generic
 * over their buffer, and analyser.getByteTimeDomainData rejects a
 * SharedArrayBuffer-backed view. Naming it once keeps that detail out of every
 * signature that passes a buffer around.
 */
export type AudioSampleBuffer = Uint8Array<ArrayBuffer>;

/** Constraints are best-effort — Safari and Firefox honour different subsets. */
const MIC_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

export class MicPermissionDeniedError extends Error {
  constructor() {
    super('Microphone permission denied');
    this.name = 'MicPermissionDeniedError';
  }
}

export class MicUnavailableError extends Error {
  constructor(message = 'No microphone available') {
    super(message);
    this.name = 'MicUnavailableError';
  }
}

type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext ??
    null
  );
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;

  private inputAnalyser: AnalyserNode | null = null;
  private outputAnalyser: AnalyserNode | null = null;

  /**
   * An <audio> element may only ever be passed to createMediaElementSource
   * once per context. Cache the node so repeated speak() calls reuse it.
   */
  private elementSources = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();

  /** Scratch buffers, allocated once — the render loop must not allocate. */
  readonly inputBuffer: AudioSampleBuffer = new Uint8Array(FFT_SIZE);
  readonly outputBuffer: AudioSampleBuffer = new Uint8Array(FFT_SIZE);

  isSupported(): boolean {
    return getAudioContextCtor() !== null;
  }

  /**
   * Lazily create the context. Must be called from a user gesture on Safari and
   * iOS, where a context created outside one starts (and stays) suspended.
   */
  async ensureContext(): Promise<AudioContext> {
    const Ctor = getAudioContextCtor();
    if (!Ctor) throw new MicUnavailableError('Web Audio is not supported in this browser');

    if (!this.ctx || this.ctx.state === 'closed') {
      this.ctx = new Ctor();
    }
    if (this.ctx.state === 'suspended') {
      // Rejects when not inside a gesture; the caller decides whether that is fatal.
      await this.ctx.resume().catch(() => undefined);
    }
    return this.ctx;
  }

  /**
   * Open the microphone and wire it to the input analyser.
   * Idempotent: a second call while a live stream exists is a no-op.
   */
  async startMicrophone(): Promise<AnalyserNode> {
    if (this.micStream && this.inputAnalyser && this.hasLiveTrack()) {
      return this.inputAnalyser;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new MicUnavailableError('This browser cannot access a microphone');
    }

    const ctx = await this.ensureContext();

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: MIC_CONSTRAINTS });
    } catch (err) {
      // Retry bare audio:true — some browsers reject the constraint bag itself
      // rather than falling back, and a plain stream beats no stream at all.
      const name = (err as DOMException)?.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        throw new MicPermissionDeniedError();
      }
      if (name === 'OverconstrainedError' || name === 'TypeError') {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (retryErr) {
          const retryName = (retryErr as DOMException)?.name;
          if (retryName === 'NotAllowedError' || retryName === 'SecurityError') {
            throw new MicPermissionDeniedError();
          }
          throw new MicUnavailableError();
        }
      } else {
        throw new MicUnavailableError();
      }
    }

    this.micStream = stream;
    this.micSource = ctx.createMediaStreamSource(stream);

    const analyser = ctx.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    // Light built-in smoothing; the perceptual smoothing lives in the renderer.
    analyser.smoothingTimeConstant = 0.6;

    this.micSource.connect(analyser);
    // Deliberately NOT connected to ctx.destination — routing the mic to the
    // speakers is how you build a feedback loop.
    this.inputAnalyser = analyser;

    return analyser;
  }

  private hasLiveTrack(): boolean {
    return (this.micStream?.getAudioTracks() ?? []).some((t) => t.readyState === 'live');
  }

  /** Fully release the microphone. The OS indicator must go out. */
  stopMicrophone(): void {
    this.micSource?.disconnect();
    this.micSource = null;

    this.micStream?.getTracks().forEach((track) => track.stop());
    this.micStream = null;

    this.inputAnalyser?.disconnect();
    this.inputAnalyser = null;
  }

  /**
   * Route a playing media element through an analyser so the outgoing waveform
   * is driven by Shifa's real audio signal.
   *
   * Returns null when the element is cross-origin without CORS: the context
   * taints and the analyser reads pure silence, which would be worse than
   * falling back to the speech-envelope path.
   */
  async connectOutputElement(el: HTMLMediaElement): Promise<AnalyserNode | null> {
    try {
      const ctx = await this.ensureContext();

      let source = this.elementSources.get(el);
      if (!source) {
        source = ctx.createMediaElementSource(el);
        this.elementSources.set(el, source);
      }

      if (!this.outputAnalyser) {
        const analyser = ctx.createAnalyser();
        analyser.fftSize = FFT_SIZE;
        analyser.smoothingTimeConstant = 0.6;
        this.outputAnalyser = analyser;
      }

      source.disconnect();
      source.connect(this.outputAnalyser);
      // Must reach the speakers, otherwise inserting the analyser silences Shifa.
      this.outputAnalyser.connect(ctx.destination);

      return this.outputAnalyser;
    } catch {
      return null;
    }
  }

  disconnectOutput(): void {
    this.outputAnalyser?.disconnect();
  }

  getInputAnalyser(): AnalyserNode | null {
    return this.inputAnalyser;
  }

  getOutputAnalyser(): AnalyserNode | null {
    return this.outputAnalyser;
  }

  /** Release everything. Called on conversation end and component unmount. */
  async dispose(): Promise<void> {
    this.stopMicrophone();
    this.disconnectOutput();
    this.outputAnalyser = null;

    if (this.ctx && this.ctx.state !== 'closed') {
      await this.ctx.close().catch(() => undefined);
    }
    this.ctx = null;
  }
}

/**
 * Root-mean-square of a time-domain byte buffer, normalised to roughly 0..1.
 * Byte samples are centred on 128, so deviation from centre is the signal.
 */
export function rms(buffer: AudioSampleBuffer, sampleCount: number): number {
  let sum = 0;
  for (let i = 0; i < sampleCount; i++) {
    const v = (buffer[i] - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / sampleCount);
}

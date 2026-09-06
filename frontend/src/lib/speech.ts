// STT + TTS Web Speech API wrappers.
//
// The real implementations live in `src/voice/`, where they sit next to the
// analyser and state machine they are coupled to. This module re-exports them
// under the path the team specification names, so there is exactly one
// implementation rather than two that drift apart.

export {
  UrduSpeechRecognizer,
  isSpeechRecognitionSupported,
  type RecognitionCallbacks,
} from '../voice/speechRecognition';

export { ShifaSpeech, type SpeakHandle, type SpeechSignalKind } from '../voice/shifaSpeech';

import { ShifaSpeech, type AudioUrlResolver } from '../voice/shifaSpeech';
import { AudioEngine } from '../voice/audioEngine';
import { synthesizeUrl } from './api';

let sharedSpeech: ShifaSpeech | null = null;

/**
 * Resolve spoken text to server TTS audio (ElevenLabs via GET /synthesize).
 *
 * Returns null when no backend is configured, which sends ShifaSpeech down
 * its browser speech-synthesis fallback path instead.
 */
export const serverTtsResolver: AudioUrlResolver = (text: string): Promise<string | null> =>
  Promise.resolve(synthesizeUrl(text));

/**
 * Convenience wrapper matching the specified `speakUrdu(text)` signature, for
 * callers outside the landing page (Results page TTS, EmergencyAlert).
 *
 * The landing page does NOT use this — it drives ShifaSpeech directly so it can
 * read the output signal for the waveform. Use this only where you just need
 * Shifa to say something.
 */
export function speakUrdu(text: string): Promise<void> {
  if (!sharedSpeech) {
    sharedSpeech = new ShifaSpeech(new AudioEngine());
    // Prefer the real server voice; fall back to browser synthesis when the
    // backend is not configured or /synthesize fails to load.
    sharedSpeech.audioUrlResolver = serverTtsResolver;
  }
  return sharedSpeech.speak(text, 'ur-PK').done;
}

export function cancelSpeech(): void {
  sharedSpeech?.cancel();
}

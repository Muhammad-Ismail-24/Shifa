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

import { ShifaSpeech } from '../voice/shifaSpeech';
import { AudioEngine } from '../voice/audioEngine';

let sharedSpeech: ShifaSpeech | null = null;

/**
 * Convenience wrapper matching the specified `speakUrdu(text)` signature, for
 * callers outside the landing page (Results page TTS, EmergencyAlert).
 *
 * The landing page does NOT use this — it drives ShifaSpeech directly so it can
 * read the output signal for the waveform. Use this only where you just need
 * Shifa to say something.
 */
export function speakUrdu(text: string): Promise<void> {
  if (!sharedSpeech) sharedSpeech = new ShifaSpeech(new AudioEngine());
  return sharedSpeech.speak(text, 'ur-PK').done;
}

export function cancelSpeech(): void {
  sharedSpeech?.cancel();
}

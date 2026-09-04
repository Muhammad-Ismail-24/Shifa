/**
 * Microphone dictation as a persistent toggle.
 *
 * Distinct from useVoiceSession, which owns a full hands-free conversation
 * (VAD, barge-in, output analyser). The dashboard needs something much smaller:
 * the mic fills a text field the patient can see and correct before sending, so
 * a recogniser and two callbacks is the whole requirement.
 *
 * Toggle semantics, not push-to-talk: the mic stays on until the patient turns
 * it off or a final transcript arrives and auto-submits. Turning it off never
 * submits — a patient who changes their mind mid-sentence must be able to stop
 * without sending half a symptom to the model.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { UrduSpeechRecognizer, isSpeechRecognitionSupported } from './speechRecognition';

interface Options {
  /** Live partial transcript — painted into the input field as it arrives. */
  onPartial: (text: string) => void;
  /** A completed utterance. Fires once, after the mic has already stopped. */
  onFinal: (text: string) => void;
  onError?: (message: string) => void;
}

export interface Dictation {
  isRecording: boolean;
  supported: boolean;
  toggle: () => void;
  stop: () => void;
}

export function useDictation({ onPartial, onFinal, onError }: Options): Dictation {
  const [isRecording, setIsRecording] = useState(false);

  const recognizerRef = useRef<UrduSpeechRecognizer | null>(null);
  if (!recognizerRef.current) recognizerRef.current = new UrduSpeechRecognizer('ur-PK');

  // Callbacks live in refs so the recogniser is started with whatever the
  // latest render closed over, without restarting it on every keystroke.
  const handlers = useRef({ onPartial, onFinal, onError });
  handlers.current = { onPartial, onFinal, onError };

  /** Guards the auto-submit so a late onEnd cannot fire it a second time. */
  const submittedRef = useRef(false);

  const stop = useCallback(() => {
    submittedRef.current = true;
    recognizerRef.current?.abort();
    setIsRecording(false);
  }, []);

  const start = useCallback(() => {
    if (!isSpeechRecognitionSupported()) {
      handlers.current.onError?.('This browser cannot listen. Please type instead.');
      return;
    }

    submittedRef.current = false;

    const started = recognizerRef.current!.start({
      onPartial: (text) => handlers.current.onPartial(text),
      onFinal: (text) => {
        const utterance = text.trim();
        if (!utterance || submittedRef.current) return;

        // One utterance per activation: stop first so the recogniser is not
        // still listening while the request is in flight.
        submittedRef.current = true;
        recognizerRef.current?.abort();
        setIsRecording(false);
        handlers.current.onFinal(utterance);
      },
      onError: (kind) => {
        if (kind === 'no-speech') return; // benign — the patient just paused
        submittedRef.current = true;
        setIsRecording(false);
        handlers.current.onError?.(
          kind === 'not-allowed'
            ? 'Microphone access is off. Please type instead.'
            : "Shifa couldn't hear you. Try again, or type instead.",
        );
      },
      onEnd: () => setIsRecording(false),
    });

    // Only claim to be recording once the recogniser actually is. It returns
    // false when start() throws (another recogniser already holds the mic, or
    // the tab is not permitted one) — showing a live green mic in that state
    // would have the patient speaking to nothing.
    if (!started) {
      submittedRef.current = true;
      handlers.current.onError?.("Shifa couldn't start listening. Please type instead.");
      return;
    }
    setIsRecording(true);
  }, []);

  const toggle = useCallback(() => {
    if (isRecording) stop();
    else start();
  }, [isRecording, start, stop]);

  // The OS microphone indicator must clear when the page unmounts.
  useEffect(() => () => recognizerRef.current?.abort(), []);

  return { isRecording, supported: isSpeechRecognitionSupported(), toggle, stop };
}

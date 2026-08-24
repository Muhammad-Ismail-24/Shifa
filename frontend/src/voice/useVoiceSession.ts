/**
 * The conversation controller. Owns the state machine and every audio resource,
 * and is the only place transitions happen.
 *
 * React specifics: audio objects live in refs (they must survive re-render and
 * must not be recreated), while the values the UI paints from live in state.
 * The frame loop reads refs only, so it never re-renders per frame.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AudioEngine, MicPermissionDeniedError, rms, type AudioSampleBuffer } from './audioEngine';
import { ShifaSpeech } from './shifaSpeech';
import { ShifaVoiceClient } from './shifaClient';
import { UrduSpeechRecognizer, isSpeechRecognitionSupported } from './speechRecognition';
import { VoiceActivityDetector } from './voiceActivity';
import { subscribeFrame } from './rafHub';
import { VoiceState, canTransition, waveSourceFor, type VoiceStateValue, type WaveSource } from './voiceState';
import { isClarificationTurn } from '../lib/types';

export interface VoiceSession {
  state: VoiceStateValue;
  /** Live partial transcript of what the patient is saying. */
  userText: string;
  /** Shifa's most recent reply. */
  shifaText: string;
  /** Calm, human-readable error copy. Never a stack trace. */
  errorMessage: string;
  /** Smoothed 0..1 input level, for ambient environment response. */
  level: number;
  mode: 'live' | 'mock';
  isEmergency: boolean;
  start: () => void;
  stop: () => void;
  retry: () => void;
  /** Read by the waveform each frame. */
  getWaveInputs: () => {
    analyser: AnalyserNode | null;
    buffer: AudioSampleBuffer;
    source: WaveSource;
    envelope: number;
  };
}

export function useVoiceSession(): VoiceSession {
  const [state, setState] = useState<VoiceStateValue>(VoiceState.IDLE);
  const [userText, setUserText] = useState('');
  const [shifaText, setShifaText] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [level, setLevel] = useState(0);
  const [isEmergency, setIsEmergency] = useState(false);

  const engineRef = useRef<AudioEngine | null>(null);
  const speechRef = useRef<ShifaSpeech | null>(null);
  const clientRef = useRef<ShifaVoiceClient | null>(null);
  const recognizerRef = useRef<UrduSpeechRecognizer | null>(null);
  const vadRef = useRef<VoiceActivityDetector | null>(null);

  /** Mirror of `state` readable from the frame loop without re-subscribing. */
  const stateRef = useRef<VoiceStateValue>(VoiceState.IDLE);
  /** Final transcript accumulated for the utterance in flight. */
  const finalTextRef = useRef('');
  const submittingRef = useRef(false);

  if (!engineRef.current) engineRef.current = new AudioEngine();
  if (!speechRef.current) speechRef.current = new ShifaSpeech(engineRef.current);
  if (!clientRef.current) clientRef.current = new ShifaVoiceClient();
  if (!recognizerRef.current) recognizerRef.current = new UrduSpeechRecognizer('ur-PK');
  if (!vadRef.current) vadRef.current = new VoiceActivityDetector();

  /** The only way state changes. Illegal transitions are dropped, not applied. */
  const transition = useCallback((next: VoiceStateValue): boolean => {
    const current = stateRef.current;
    if (!canTransition(current, next)) return false;
    stateRef.current = next;
    setState(next);
    return true;
  }, []);

  const fail = useCallback(
    (message: string) => {
      finalTextRef.current = '';
      submittingRef.current = false;
      setErrorMessage(message);
      transition(VoiceState.ERROR);
    },
    [transition],
  );

  const teardown = useCallback(() => {
    recognizerRef.current?.abort();
    speechRef.current?.cancel();
    engineRef.current?.stopMicrophone();
    vadRef.current?.reset();
    finalTextRef.current = '';
    submittingRef.current = false;
    setLevel(0);
  }, []);

  /** Submit the completed utterance: THINKING -> SPEAKING -> LISTENING. */
  const submit = useCallback(async () => {
    if (submittingRef.current) return;

    const text = finalTextRef.current.trim();
    finalTextRef.current = '';
    if (!text) {
      transition(VoiceState.LISTENING);
      return;
    }

    submittingRef.current = true;
    if (!transition(VoiceState.THINKING)) {
      submittingRef.current = false;
      return;
    }

    try {
      const response = await clientRef.current!.submitUtterance(text);
      setIsEmergency(response.is_emergency);

      // A triage clarification is a continuing conversation, not empty results.
      const reply = response.response_text_urdu?.trim();
      if (!reply) {
        setShifaText('');
        transition(VoiceState.LISTENING);
        return;
      }

      setShifaText(reply);
      if (isClarificationTurn(response)) {
        // Intentionally identical handling — the difference is what the
        // Results view does with it, not how the landing page speaks it.
      }

      if (!transition(VoiceState.SPEAKING)) return;

      const handle = speechRef.current!.speak(reply, 'ur-PK');
      await handle.done;

      // Barge-in may already have moved us to INTERRUPTED/LISTENING.
      if (stateRef.current === VoiceState.SPEAKING) {
        transition(VoiceState.LISTENING);
      }
    } catch (err) {
      const message =
        err && typeof err === 'object' && 'kind' in err && (err as { kind: string }).kind === 'timeout'
          ? 'Shifa took too long to respond. Try once more.'
          : "Shifa couldn't respond just now. Try once more.";
      fail(message);
    } finally {
      submittingRef.current = false;
    }
  }, [transition, fail]);

  const start = useCallback(async () => {
    setErrorMessage('');
    setIsEmergency(false);
    setUserText('');
    setShifaText('');
    clientRef.current!.resetConversation();

    if (!transition(VoiceState.REQUESTING_PERMISSION)) return;

    try {
      await engineRef.current!.startMicrophone();
    } catch (err) {
      if (err instanceof MicPermissionDeniedError) {
        setErrorMessage('Microphone access is off.');
        transition(VoiceState.MIC_DENIED);
      } else {
        fail("I couldn't access your microphone.");
      }
      return;
    }

    vadRef.current!.reset();
    if (!transition(VoiceState.LISTENING)) return;

    if (isSpeechRecognitionSupported()) {
      recognizerRef.current!.start({
        onPartial: (text) => setUserText(text),
        onFinal: (text) => {
          finalTextRef.current = `${finalTextRef.current} ${text}`.trim();
          setUserText(finalTextRef.current);
        },
        onError: (kind) => {
          if (kind === 'not-allowed') {
            setErrorMessage('Microphone access is off.');
            transition(VoiceState.MIC_DENIED);
          } else if (kind === 'network') {
            fail("I couldn't reach the speech service. Try again.");
          }
          // 'no-speech' is normal silence; the VAD owns that path.
        },
      });
    }
  }, [transition, fail]);

  const stop = useCallback(() => {
    teardown();
    clientRef.current!.resetConversation();
    setUserText('');
    setShifaText('');
    setIsEmergency(false);
    stateRef.current = VoiceState.IDLE;
    setState(VoiceState.IDLE);
  }, [teardown]);

  const retry = useCallback(() => {
    teardown();
    stateRef.current = VoiceState.IDLE;
    setState(VoiceState.IDLE);
    setErrorMessage('');
    void start();
  }, [teardown, start]);

  /** Per-frame VAD. Reads refs only — no re-render unless something changes. */
  useEffect(() => {
    const engine = engineRef.current!;
    const vad = vadRef.current!;
    let lastPublished = 0;

    return subscribeFrame((time) => {
      const current = stateRef.current;
      const analyser = engine.getInputAnalyser();
      if (!analyser) return;

      const listeningStates =
        current === VoiceState.LISTENING ||
        current === VoiceState.USER_SPEAKING ||
        current === VoiceState.SPEAKING ||
        current === VoiceState.INTERRUPTED;
      if (!listeningStates) return;

      analyser.getByteTimeDomainData(engine.inputBuffer);
      const raw = rms(engine.inputBuffer, engine.inputBuffer.length);

      // While Shifa speaks, raise the bar so imperfect echo cancellation cannot
      // make Shifa interrupt itself.
      const suppress = current === VoiceState.SPEAKING;
      const event = vad.push(raw, time, suppress);

      // Publish the smoothed level sparingly; this drives ambient motion only.
      if (time - lastPublished > 60) {
        lastPublished = time;
        setLevel(vad.smoothedLevel);
      }

      if (event === 'speech-start') {
        if (current === VoiceState.SPEAKING) {
          // Barge-in: the patient talked over Shifa.
          speechRef.current!.cancel();
          if (transition(VoiceState.INTERRUPTED)) transition(VoiceState.LISTENING);
        } else if (current === VoiceState.LISTENING) {
          transition(VoiceState.USER_SPEAKING);
        }
      } else if (event === 'speech-end' || event === 'utterance-timeout') {
        if (current === VoiceState.USER_SPEAKING) void submit();
      }
    });
  }, [transition, submit]);

  // Release the microphone and context on unmount. The OS indicator must clear.
  useEffect(() => {
    return () => {
      recognizerRef.current?.abort();
      speechRef.current?.cancel();
      void engineRef.current?.dispose();
    };
  }, []);

  const getWaveInputs = useCallback(() => {
    const engine = engineRef.current!;
    const speech = speechRef.current!;
    const source = waveSourceFor(stateRef.current);

    if (source === 'mic') {
      return {
        analyser: engine.getInputAnalyser(),
        buffer: engine.inputBuffer,
        source,
        envelope: 0,
      };
    }
    if (source === 'output') {
      const analyser = speech.signalKind === 'analyser' ? engine.getOutputAnalyser() : null;
      return {
        analyser,
        buffer: engine.outputBuffer,
        // Fall back to the real speech envelope when the provider exposes no stream.
        source: analyser ? ('output' as WaveSource) : ('generated' as WaveSource),
        envelope: speech.currentEnvelope,
      };
    }
    return { analyser: null, buffer: engine.inputBuffer, source, envelope: 0 };
  }, []);

  const mode = clientRef.current!.mode;

  return useMemo(
    () => ({
      state,
      userText,
      shifaText,
      errorMessage,
      level,
      mode,
      isEmergency,
      start: () => void start(),
      stop,
      retry,
      getWaveInputs,
    }),
    [state, userText, shifaText, errorMessage, level, mode, isEmergency, start, stop, retry, getWaveInputs],
  );
}

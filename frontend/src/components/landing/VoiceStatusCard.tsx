/**
 * The reference's "Latest findings" panel, now Shifa's live conversation state.
 *
 * Geometry, radius, padding, frost treatment and entrance animation are the
 * reference's, unchanged. What varies is the content, which is a pure function
 * of the voice state — no local booleans, no imperative DOM writes.
 */

import { useMemo, useEffect, useRef } from 'react';

import { VoiceState, type VoiceStateValue, type WaveSource } from '../../voice/voiceState';
import type { AudioSampleBuffer } from '../../voice/audioEngine';
import type { ConversationMessage } from '../../lib/types';
import { AudioWaveform } from './AudioWaveform';
import { GlassBackdrop } from './GlassBackdrop';
import { CARD_COPY, announcementFor } from './cardCopy';
import { UrduText } from '../UrduText';

interface Props {
  cardRef: React.RefObject<HTMLElement>;
  videoRef: React.RefObject<HTMLVideoElement>;
  liquidGlass: boolean;
  state: VoiceStateValue;
  userText: string;
  shifaText: string;
  history?: ConversationMessage[];
  errorMessage: string;
  onRetry: () => void;
  getWaveInputs: () => {
    analyser: AnalyserNode | null;
    buffer: AudioSampleBuffer;
    source: WaveSource;
    envelope: number;
  };
}

export function VoiceStatusCard({
  cardRef,
  videoRef,
  liquidGlass,
  state,
  userText,
  shifaText,
  history = [],
  errorMessage,
  onRetry,
  getWaveInputs,
}: Props) {
  const copy = CARD_COPY[state];
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [history, userText]);

  // Show at most one transcript line — the hero must stay sparse. Shifa's reply
  const transcript = useMemo(() => {
    if (state === VoiceState.SPEAKING && shifaText) {
      return { label: 'Shifa', text: shifaText, urdu: true };
    }
    if ((state === VoiceState.USER_SPEAKING || state === VoiceState.THINKING || state === VoiceState.LISTENING) && userText) {
      return { label: 'You', text: userText, urdu: true };
    }
    if (state === VoiceState.LISTENING && shifaText) {
      return { label: 'Shifa', text: shifaText, urdu: true };
    }
    return null;
  }, [state, shifaText, userText]);

  const body = state === VoiceState.ERROR && errorMessage ? errorMessage : copy.body;
  const recoverable = state === VoiceState.ERROR || state === VoiceState.MIC_DENIED;

  return (
    <aside
      className={`card group${liquidGlass ? '' : ' card--fallback'}`}
      data-glass-card
      ref={cardRef as React.RefObject<HTMLElement>}
    >
      <GlassBackdrop cardRef={cardRef} videoRef={videoRef} enabled={liquidGlass} />

      <div className="card__frost" aria-hidden="true" />

      <div className="card__head">
        <h2 className="card__title">Shifa</h2>
        <span className="card__index">{copy.status}</span>
      </div>

      <div className="card__body">
        {history.length > 0 ? (
          <div className="flex flex-col gap-4 overflow-y-auto max-h-[60vh] w-full p-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {history.map((msg, index) => (
              <div key={index} className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <UrduText
                  className={`max-w-[80%] rounded-2xl px-5 py-3 text-[15px] ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white rounded-br-none'
                      : 'bg-white/80 backdrop-blur text-gray-900 rounded-bl-none shadow-sm'
                  }`}
                >
                  {msg.content}
                </UrduText>
              </div>
            ))}
            {transcript && transcript.label === 'You' ? (
              <div className="flex w-full justify-end">
                <UrduText className="max-w-[80%] rounded-2xl px-5 py-3 text-[15px] bg-blue-600/70 text-white rounded-br-none">
                  {transcript.text}
                </UrduText>
              </div>
            ) : null}
            <div ref={scrollRef} />
          </div>
        ) : (
          <div className="card__state" key={state}>
            <div className="finding">
              <h3 className="finding__title">{copy.heading}</h3>
              {body ? <p className="finding__text">{body}</p> : null}
            </div>

            {transcript ? (
              <div className="transcript">
                <span className="transcript__label">{transcript.label}</span>
                <p
                  className={`transcript__text${transcript.urdu ? ' transcript__text--urdu' : ''}`}
                  dir={transcript.urdu ? 'rtl' : undefined}
                  lang={transcript.urdu ? 'ur' : undefined}
                >
                  {transcript.text}
                </p>
              </div>
            ) : null}

            {recoverable ? (
              <button className="card__retry" type="button" onClick={onRetry}>
                Try again
              </button>
            ) : null}
          </div>
        )}

        {/* Status is announced politely; the waveform alone must never be the
            only way to know what Shifa is doing. */}
        <p className="sr-only" role="status" aria-live="polite">
          {announcementFor(state)}
        </p>
      </div>

      <AudioWaveform stateKey={state} getInputs={getWaveInputs} />
    </aside>
  );
}

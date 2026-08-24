/**
 * The reference's "Latest findings" panel, now Shifa's live conversation state.
 *
 * Geometry, radius, padding, frost treatment and entrance animation are the
 * reference's, unchanged. What varies is the content, which is a pure function
 * of the voice state — no local booleans, no imperative DOM writes.
 */

import { useMemo } from 'react';

import { VoiceState, type VoiceStateValue, type WaveSource } from '../../voice/voiceState';
import type { AudioSampleBuffer } from '../../voice/audioEngine';
import { AudioWaveform } from './AudioWaveform';
import { GlassBackdrop } from './GlassBackdrop';
import { CARD_COPY, announcementFor } from './cardCopy';

interface Props {
  cardRef: React.RefObject<HTMLElement>;
  videoRef: React.RefObject<HTMLVideoElement>;
  liquidGlass: boolean;
  state: VoiceStateValue;
  userText: string;
  shifaText: string;
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
  errorMessage,
  onRetry,
  getWaveInputs,
}: Props) {
  const copy = CARD_COPY[state];

  // Show at most one transcript line — the hero must stay sparse. Shifa's reply
  // wins while it speaks; otherwise the patient's own words are echoed back.
  const transcript = useMemo(() => {
    if (state === VoiceState.SPEAKING && shifaText) {
      return { label: 'Shifa', text: shifaText, urdu: true };
    }
    if ((state === VoiceState.USER_SPEAKING || state === VoiceState.THINKING) && userText) {
      return { label: 'You', text: userText, urdu: true };
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
        {/* key drives the crossfade: a new state mounts a new node */}
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

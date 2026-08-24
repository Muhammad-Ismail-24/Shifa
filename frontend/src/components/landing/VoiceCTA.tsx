/**
 * The chamfered call to action. Geometry is the reference's polygon, unchanged.
 *
 * The label always names the action the click performs. The spec sketched
 * "Listening" as the in-conversation label, but a button whose visible text
 * does not describe what pressing it does is both a WCAG 2.5.3 problem and a
 * trap — there would be no way to end a conversation. Listening state is
 * carried by the pulsing indicator here and stated outright on the card.
 */

import { VoiceState, isConversationActive, type VoiceStateValue } from '../../voice/voiceState';

interface Props {
  state: VoiceStateValue;
  onStart: () => void;
  onStop: () => void;
}

function labelFor(state: VoiceStateValue): string {
  if (state === VoiceState.REQUESTING_PERMISSION) return 'Allow microphone';
  if (isConversationActive(state)) return 'End conversation';
  if (state === VoiceState.MIC_DENIED) return 'Try again';
  return 'Talk to Shifa';
}

export function VoiceCTA({ state, onStart, onStop }: Props) {
  const active = isConversationActive(state);
  const requesting = state === VoiceState.REQUESTING_PERMISSION;
  const label = labelFor(state);

  return (
    <button
      className="chamfer"
      type="button"
      disabled={requesting}
      onClick={active ? onStop : onStart}
    >
      <span className="chamfer__glass" aria-hidden="true" />
      <svg className="chamfer__outline" viewBox="0 0 260 48" preserveAspectRatio="none" aria-hidden="true">
        <polygon
          points="14,0 260,0 260,34 246,48 0,48 0,14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span className="chamfer__label">{label}</span>

      {active && !requesting ? (
        <span className="chamfer__live" aria-hidden="true" />
      ) : (
        <svg
          className="icon"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M5 12h14" />
          <path d="m12 5 7 7-7 7" />
        </svg>
      )}
    </button>
  );
}

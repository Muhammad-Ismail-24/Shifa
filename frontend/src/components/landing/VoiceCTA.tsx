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
  onSubmit: () => void;
}

function labelFor(state: VoiceStateValue): string {
  if (state === VoiceState.REQUESTING_PERMISSION) return 'Allow microphone';
  if (state === VoiceState.LISTENING || state === VoiceState.USER_SPEAKING) return 'Tap to Send';
  if (state === VoiceState.THINKING) return 'Thinking...';
  if (state === VoiceState.SPEAKING) return 'Shifa is speaking';
  if (state === VoiceState.MIC_DENIED) return 'Try again';
  return 'Tap to Speak';
}

export function VoiceCTA({ state, onStart, onStop, onSubmit }: Props) {
  const active = isConversationActive(state);
  const requesting = state === VoiceState.REQUESTING_PERMISSION;
  const isListening = state === VoiceState.LISTENING || state === VoiceState.USER_SPEAKING;
  const isBusy = state === VoiceState.THINKING || state === VoiceState.SPEAKING;
  
  const label = labelFor(state);

  const handleClick = () => {
    if (isListening) {
      onSubmit();
    } else if (!active) {
      onStart();
    } else {
      onStop();
    }
  };

  // Turn button red when listening
  const glassColorClass = isListening ? 'chamfer__glass--listening bg-red-500/20' : '';
  const textColorClass = isListening ? 'text-red-600' : 'text-black';

  return (
    <button
      className={`chamfer ${textColorClass}`}
      type="button"
      disabled={requesting || isBusy}
      onClick={handleClick}
    >
      <span className={`chamfer__glass ${glassColorClass}`} aria-hidden="true" />
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

      {isListening ? (
        <span className="w-3 h-3 bg-red-600 rounded-full animate-pulse" aria-hidden="true" />
      ) : active && !requesting ? (
        <span className="chamfer__live bg-current" aria-hidden="true" />
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
          <path d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
        </svg>
      )}
    </button>
  );
}

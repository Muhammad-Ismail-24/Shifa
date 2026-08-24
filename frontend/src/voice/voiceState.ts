/**
 * The single source of truth for what Shifa is doing.
 *
 * Every visual surface (card copy, status label, waveform amplitude, CTA text,
 * ambient orb response) derives from this one value. Deliberately a state
 * machine rather than a spread of booleans: `isListening && !isThinking` style
 * conditions are what let a voice UI get stuck in an impossible state, and a
 * stuck THINKING is the failure mode users notice most.
 */

export const VoiceState = {
  IDLE: 'idle',
  REQUESTING_PERMISSION: 'requesting-permission',
  LISTENING: 'listening',
  USER_SPEAKING: 'user-speaking',
  THINKING: 'thinking',
  SPEAKING: 'speaking',
  INTERRUPTED: 'interrupted',
  ERROR: 'error',
  MIC_DENIED: 'mic-denied',
} as const;

export type VoiceStateValue = (typeof VoiceState)[keyof typeof VoiceState];

/**
 * Legal transitions. Anything not listed here is a bug, not a rare path.
 *
 * Note every non-terminal state has an edge into ERROR/MIC_DENIED, and both of
 * those have an edge back out — §35 requires that no async flow can strand the
 * UI, so recovery is part of the graph rather than an afterthought.
 */
const TRANSITIONS: Record<VoiceStateValue, readonly VoiceStateValue[]> = {
  [VoiceState.IDLE]: [VoiceState.REQUESTING_PERMISSION, VoiceState.ERROR],

  [VoiceState.REQUESTING_PERMISSION]: [
    VoiceState.LISTENING,
    VoiceState.MIC_DENIED,
    VoiceState.ERROR,
    VoiceState.IDLE,
  ],

  [VoiceState.LISTENING]: [
    VoiceState.USER_SPEAKING,
    VoiceState.THINKING,
    VoiceState.IDLE,
    VoiceState.ERROR,
  ],

  [VoiceState.USER_SPEAKING]: [
    VoiceState.LISTENING,
    VoiceState.THINKING,
    VoiceState.IDLE,
    VoiceState.ERROR,
  ],

  [VoiceState.THINKING]: [
    VoiceState.SPEAKING,
    VoiceState.LISTENING,
    VoiceState.IDLE,
    VoiceState.ERROR,
  ],

  [VoiceState.SPEAKING]: [
    VoiceState.LISTENING,
    VoiceState.INTERRUPTED,
    VoiceState.IDLE,
    VoiceState.ERROR,
  ],

  // Barge-in: the user talked over Shifa. Always resolves into LISTENING.
  [VoiceState.INTERRUPTED]: [VoiceState.LISTENING, VoiceState.IDLE, VoiceState.ERROR],

  [VoiceState.ERROR]: [VoiceState.IDLE, VoiceState.REQUESTING_PERMISSION, VoiceState.LISTENING],
  [VoiceState.MIC_DENIED]: [VoiceState.IDLE, VoiceState.REQUESTING_PERMISSION],
};

export function canTransition(from: VoiceStateValue, to: VoiceStateValue): boolean {
  if (from === to) return true;
  return TRANSITIONS[from].includes(to);
}

/** States in which a live microphone stream should exist. */
export function wantsMicrophone(state: VoiceStateValue): boolean {
  return (
    state === VoiceState.LISTENING ||
    state === VoiceState.USER_SPEAKING ||
    state === VoiceState.THINKING ||
    state === VoiceState.SPEAKING ||
    state === VoiceState.INTERRUPTED
  );
}

/** States that represent an active conversation (drives the CTA label). */
export function isConversationActive(state: VoiceStateValue): boolean {
  return wantsMicrophone(state) || state === VoiceState.REQUESTING_PERMISSION;
}

/**
 * Which signal the waveform should follow.
 *  - 'mic'       real microphone analyser
 *  - 'output'    real Shifa TTS analyser / speech envelope
 *  - 'generated' no meaningful audio source exists (idle breath, thinking)
 */
export type WaveSource = 'mic' | 'output' | 'generated';

export function waveSourceFor(state: VoiceStateValue): WaveSource {
  switch (state) {
    case VoiceState.LISTENING:
    case VoiceState.USER_SPEAKING:
    case VoiceState.INTERRUPTED:
      return 'mic';
    case VoiceState.SPEAKING:
      return 'output';
    default:
      return 'generated';
  }
}

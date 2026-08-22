/**
 * Every string the status card can show, keyed by voice state.
 *
 * Centralised so the card component stays a renderer and the copy stays
 * reviewable in one place — important here because this is a health product and
 * the wording is a safety surface, not decoration. Nothing in this file makes a
 * medical claim: the card describes what Shifa is *doing*, never what the
 * patient *has*. Diagnosis text only ever arrives from the backend.
 */

import { VoiceState, type VoiceStateValue } from '../../voice/voiceState';

export interface CardCopy {
  /** Small monospace-ish marker in the card header. */
  status: string;
  heading: string;
  body: string;
}

export const CARD_COPY: Record<VoiceStateValue, CardCopy> = {
  [VoiceState.IDLE]: {
    status: '// READY',
    heading: 'Talk to me',
    body: "Tell me what happened in your own words. You don't need to know the right terminology.",
  },
  [VoiceState.REQUESTING_PERMISSION]: {
    status: '// MICROPHONE',
    heading: 'Allow microphone access',
    body: 'Your browser will ask for permission. Shifa only listens while you choose to talk.',
  },
  [VoiceState.LISTENING]: {
    status: '// LISTENING',
    heading: "I'm listening",
    body: 'Speak naturally. Take your time.',
  },
  [VoiceState.USER_SPEAKING]: {
    status: '// HEARING YOU',
    heading: 'I can hear you',
    body: 'Keep going — I’ll wait until you’re finished.',
  },
  [VoiceState.THINKING]: {
    status: '// THINKING',
    heading: 'Understanding your situation',
    body: 'Working through what you shared.',
  },
  [VoiceState.SPEAKING]: {
    status: '// SPEAKING',
    heading: 'Here’s what I understand so far.',
    body: '',
  },
  [VoiceState.INTERRUPTED]: {
    status: '// LISTENING',
    heading: 'Go ahead',
    body: 'I’ve stopped — tell me more.',
  },
  [VoiceState.ERROR]: {
    status: '// PAUSED',
    heading: 'Something interrupted us',
    body: '',
  },
  [VoiceState.MIC_DENIED]: {
    status: '// MICROPHONE',
    heading: 'Microphone access is off',
    body: 'Shifa needs your microphone to listen. Turn it on in your browser’s site settings, then try again.',
  },
};

/** Screen-reader announcement for the live status region. */
export function announcementFor(state: VoiceStateValue): string {
  const copy = CARD_COPY[state];
  return `Shifa status: ${copy.heading}`;
}

import { describe, expect, it } from 'vitest';

import {
  VoiceState,
  canTransition,
  isConversationActive,
  wantsMicrophone,
  waveSourceFor,
} from '../voiceState';

describe('voice state machine', () => {
  it('walks the happy path end to end', () => {
    expect(canTransition(VoiceState.IDLE, VoiceState.REQUESTING_PERMISSION)).toBe(true);
    expect(canTransition(VoiceState.REQUESTING_PERMISSION, VoiceState.LISTENING)).toBe(true);
    expect(canTransition(VoiceState.LISTENING, VoiceState.USER_SPEAKING)).toBe(true);
    expect(canTransition(VoiceState.USER_SPEAKING, VoiceState.THINKING)).toBe(true);
    expect(canTransition(VoiceState.THINKING, VoiceState.SPEAKING)).toBe(true);
    expect(canTransition(VoiceState.SPEAKING, VoiceState.LISTENING)).toBe(true);
  });

  it('supports barge-in from speaking', () => {
    expect(canTransition(VoiceState.SPEAKING, VoiceState.INTERRUPTED)).toBe(true);
    expect(canTransition(VoiceState.INTERRUPTED, VoiceState.LISTENING)).toBe(true);
  });

  it('routes permission denial to its own state', () => {
    expect(canTransition(VoiceState.REQUESTING_PERMISSION, VoiceState.MIC_DENIED)).toBe(true);
    expect(canTransition(VoiceState.MIC_DENIED, VoiceState.REQUESTING_PERMISSION)).toBe(true);
  });

  it('always offers a way out of a terminal-looking state', () => {
    // The failure this guards against is a UI stuck forever in THINKING/ERROR.
    expect(canTransition(VoiceState.ERROR, VoiceState.IDLE)).toBe(true);
    expect(canTransition(VoiceState.ERROR, VoiceState.LISTENING)).toBe(true);
    expect(canTransition(VoiceState.THINKING, VoiceState.ERROR)).toBe(true);
    expect(canTransition(VoiceState.MIC_DENIED, VoiceState.IDLE)).toBe(true);
  });

  it('rejects illegal jumps', () => {
    expect(canTransition(VoiceState.IDLE, VoiceState.SPEAKING)).toBe(false);
    expect(canTransition(VoiceState.IDLE, VoiceState.LISTENING)).toBe(false);
    expect(canTransition(VoiceState.THINKING, VoiceState.USER_SPEAKING)).toBe(false);
    expect(canTransition(VoiceState.MIC_DENIED, VoiceState.LISTENING)).toBe(false);
  });

  it('keeps the microphone open across a full turn, and closed at rest', () => {
    expect(wantsMicrophone(VoiceState.IDLE)).toBe(false);
    expect(wantsMicrophone(VoiceState.MIC_DENIED)).toBe(false);
    expect(wantsMicrophone(VoiceState.LISTENING)).toBe(true);
    // Must stay open while Shifa talks, otherwise barge-in cannot work.
    expect(wantsMicrophone(VoiceState.SPEAKING)).toBe(true);
  });

  it('drives the CTA label from conversation activity', () => {
    expect(isConversationActive(VoiceState.IDLE)).toBe(false);
    expect(isConversationActive(VoiceState.REQUESTING_PERMISSION)).toBe(true);
    expect(isConversationActive(VoiceState.THINKING)).toBe(true);
  });

  it('picks the right waveform signal per state', () => {
    expect(waveSourceFor(VoiceState.LISTENING)).toBe('mic');
    expect(waveSourceFor(VoiceState.USER_SPEAKING)).toBe('mic');
    expect(waveSourceFor(VoiceState.SPEAKING)).toBe('output');
    // No meaningful audio source exists in these states.
    expect(waveSourceFor(VoiceState.THINKING)).toBe('generated');
    expect(waveSourceFor(VoiceState.IDLE)).toBe('generated');
  });
});

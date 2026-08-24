import { describe, expect, it } from 'vitest';

import { VoiceActivityDetector } from '../voiceActivity';

/** Feed a constant level for a span of simulated time at a given frame rate. */
function feed(
  vad: VoiceActivityDetector,
  level: number,
  fromMs: number,
  durationMs: number,
  suppress = false,
  stepMs = 16,
) {
  const events: string[] = [];
  for (let t = fromMs; t <= fromMs + durationMs; t += stepMs) {
    const e = vad.push(level, t, suppress);
    if (e) events.push(e);
  }
  return events;
}


describe('voice activity detection', () => {
  it('does not report speech from room tone', () => {
    const vad = new VoiceActivityDetector();
    const events = feed(vad, 0.008, 0, 3000);
    expect(events).toEqual([]);
    expect(vad.isSpeaking).toBe(false);
  });

  it('requires sustained energy before declaring speech', () => {
    const vad = new VoiceActivityDetector({ minSpeechMs: 200 });
    // A 100ms blip — a door closing, not a word.
    const events = feed(vad, 0.3, 0, 100);
    expect(events).toEqual([]);
  });

  it('detects a real utterance and its end', () => {
    const vad = new VoiceActivityDetector();
    const start = feed(vad, 0.35, 0, 600);
    expect(start).toContain('speech-start');

    const end = feed(vad, 0.002, 700, 1600);
    expect(end).toContain('speech-end');
  });

  it('does not end the utterance during a between-word gap', () => {
    const vad = new VoiceActivityDetector({ silenceHoldMs: 900 });
    feed(vad, 0.35, 0, 600);
    expect(vad.isSpeaking).toBe(true);

    // 400ms pause — shorter than the hold, so the turn must continue.
    const events = feed(vad, 0.002, 700, 400);
    expect(events).not.toContain('speech-end');
    expect(vad.isSpeaking).toBe(true);
  });

  it('caps a runaway utterance', () => {
    const vad = new VoiceActivityDetector({ maxUtteranceMs: 1000 });
    feed(vad, 0.4, 0, 400);
    const events = feed(vad, 0.4, 400, 1200);
    expect(events).toContain('utterance-timeout');
  });

  it('raises the bar while Shifa is speaking, so it cannot interrupt itself', () => {
    const suppressed = new VoiceActivityDetector();
    // Speaker bleed that would trip the normal threshold.
    expect(feed(suppressed, 0.07, 0, 1200, true)).toEqual([]);

    const open = new VoiceActivityDetector();
    expect(feed(open, 0.07, 0, 1200, false)).toContain('speech-start');
  });

  it('ends an utterance at the same wall-clock time regardless of frame rate', () => {
    // The release path is where per-frame smoothing hurt most: decaying below
    // the silence threshold took a fixed number of FRAMES, so at 15fps it took
    // several times longer in wall-clock than at 60fps. A patient on a low-end
    // Android would have waited seconds for Shifa to notice they had stopped.
    const endAt = (stepMs: number): number | null => {
      const vad = new VoiceActivityDetector();
      for (let t = 0; t <= 900; t += stepMs) vad.push(0.35, t); // speaking
      for (let t = 900; t <= 6000; t += stepMs) {
        if (vad.push(0.001, t) === 'speech-end') return t;
      }
      return null;
    };

    const at60 = endAt(16);
    const at30 = endAt(33);
    const at15 = endAt(66);

    expect(at60).not.toBeNull();
    expect(at30).not.toBeNull();
    expect(at15).not.toBeNull();

    // Allow two frames of the sampling rate: an event can only fire on a frame
    // boundary, so that much quantisation is inherent rather than drift.
    expect(Math.abs((at30 as number) - (at60 as number))).toBeLessThanOrEqual(2 * 33);
    expect(Math.abs((at15 as number) - (at60 as number))).toBeLessThanOrEqual(2 * 66);
  });

  it('survives a throttled tab resuming with a huge time gap', () => {
    const vad = new VoiceActivityDetector();
    feed(vad, 0.002, 0, 200);
    // Tab backgrounded for 30s, then one frame arrives.
    expect(() => vad.push(0.002, 30000)).not.toThrow();
    expect(vad.smoothedLevel).toBeLessThan(0.05);
  });

  it('smooths the published level rather than tracking raw jitter', () => {
    const vad = new VoiceActivityDetector();
    vad.push(1.0, 0);
    // One loud frame must not slam the level to full scale.
    expect(vad.smoothedLevel).toBeLessThan(0.5);
    expect(vad.smoothedLevel).toBeGreaterThan(0);
  });
});

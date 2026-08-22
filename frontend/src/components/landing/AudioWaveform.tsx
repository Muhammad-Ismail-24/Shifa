/**
 * The audio-reactive line at the bottom of the status card.
 *
 * A canvas rather than an SVG path: this repaints at 60fps for the whole
 * session, and swapping a `d` attribute every frame would mean re-parsing path data
 * and re-running layout on every tick. Marked aria-hidden — it is a decorative
 * echo of the status text, which is what assistive tech actually reads.
 */

import { useEffect, useRef } from 'react';

import { subscribeFrame } from '../../voice/rafHub';
import { WaveformRenderer } from '../../voice/waveform';
import type { AudioSampleBuffer } from '../../voice/audioEngine';
import type { WaveSource } from '../../voice/voiceState';

interface WaveInputs {
  analyser: AnalyserNode | null;
  buffer: AudioSampleBuffer;
  source: WaveSource;
  envelope: number;
}

interface Props {
  stateKey: string;
  getInputs: () => WaveInputs;
}

export function AudioWaveform({ stateKey, getInputs }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<WaveformRenderer | null>(null);

  // Read through refs inside the frame loop so prop changes never re-subscribe.
  const stateRef = useRef(stateKey);
  stateRef.current = stateKey;
  const inputsRef = useRef(getInputs);
  inputsRef.current = getInputs;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new WaveformRenderer(canvas);
    rendererRef.current = renderer;

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const applyMotion = () => renderer.setReducedMotion(motionQuery.matches);
    applyMotion();
    motionQuery.addEventListener('change', applyMotion);

    const observer = new ResizeObserver(() => renderer.resize());
    observer.observe(canvas);

    const unsubscribe = subscribeFrame((time) => {
      const { analyser, buffer, source, envelope } = inputsRef.current();
      renderer.render(analyser, buffer, source, stateRef.current, envelope, time);
    });

    return () => {
      unsubscribe();
      observer.disconnect();
      motionQuery.removeEventListener('change', applyMotion);
      rendererRef.current = null;
    };
  }, []);

  return <canvas ref={canvasRef} className="card__wave" aria-hidden="true" />;
}

/**
 * The refracted window inside the status card.
 *
 * Renders the viewport-sized duplicate layer and drives glassCardSync from the
 * shared frame loop. See voice/glassCardSync.ts for why the duplicate is
 * viewport-sized rather than card-sized — it is not an optimisation oversight.
 */

import { useEffect, useRef } from 'react';

import { createGlassCardSync } from '../../voice/glassCardSync';
import { subscribeFrame } from '../../voice/rafHub';

interface Props {
  cardRef: React.RefObject<HTMLElement>;
  videoRef: React.RefObject<HTMLVideoElement>;
  enabled: boolean;
}

export function GlassBackdrop({ cardRef, videoRef, enabled }: Props) {
  const dupRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!enabled) return;

    const card = cardRef.current;
    const dup = dupRef.current;
    const target = canvasRef.current;
    const video = videoRef.current;
    if (!card || !dup || !target || !video) return;

    const sync = createGlassCardSync({ card, dup, target, video });
    return subscribeFrame(() => sync());
  }, [enabled, cardRef, videoRef]);

  if (!enabled) return null;

  return (
    <div id="dup-video-container" ref={dupRef} aria-hidden="true">
      <canvas id="dup-image" ref={canvasRef} />
    </div>
  );
}

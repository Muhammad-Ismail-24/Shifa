/**
 * Liquid-glass window sync — ported from the Planetary Pulse reference.
 *
 * The card is a window into a full-viewport duplicate of the background video.
 * Each frame the duplicate layer is offset by the negative of the card's
 * position and sized to the viewport, so its pixels line up exactly with the
 * real background behind the card; the card's own overflow/border-radius does
 * the clipping.
 *
 * Sizing the duplicate to the viewport (rather than the card) is load-bearing:
 * the SVG filter shifts each colour channel by a different amount, so the
 * leading edges of the filtered element show hard channel-separation bands. At
 * viewport size those bands fall outside the card and only clean refraction is
 * visible. Do not "optimise" this down to the card's own dimensions.
 */

const DUP_PIXEL_RATIO = 1;

/**
 * Bleed, in CSS px, added on every side of the duplicate layer.
 *
 * The reference sized the duplicate to exactly the viewport, which pushes the
 * filter's channel-separation bands off-screen only while the card sits well
 * inside the viewport. In the stacked mobile layout the card spans nearly the
 * full width and sits ~20-35px from the edge, so those bands landed *inside*
 * the card as a hard rainbow stripe down its leading edge.
 *
 * Extending the layer past the viewport moves the artefact outside any card
 * that is itself on-screen. Must exceed the largest feDisplacementMap scale
 * (65) with room for the turbulence offset.
 */
const DUP_BLEED = 120;

export interface GlassCardNodes {
  card: HTMLElement;
  dup: HTMLElement;
  target: HTMLCanvasElement;
  video: HTMLVideoElement;
}

export function createGlassCardSync(nodes: GlassCardNodes): () => void {
  const { card, dup, target, video } = nodes;
  const ctx = target.getContext('2d');
  if (!ctx) return () => {};

  return function syncGlassCard(): void {
    const rect = card.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    if (!video.videoWidth || !video.videoHeight) return;

    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;

    const layerW = vw + DUP_BLEED * 2;
    const layerH = vh + DUP_BLEED * 2;

    dup.style.left = `${-rect.left - DUP_BLEED}px`;
    dup.style.top = `${-rect.top - DUP_BLEED}px`;
    dup.style.width = `${layerW}px`;
    dup.style.height = `${layerH}px`;

    // The SVG filter's cost scales with the pixel count of this layer, so the
    // duplicate stays at 1x even on retina. What shows through the card is a
    // soft refraction, where the extra density is not worth 4x the filter work.
    const w = Math.round(layerW * DUP_PIXEL_RATIO);
    const h = Math.round(layerH * DUP_PIXEL_RATIO);
    if (target.width !== w || target.height !== h) {
      target.width = w;
      target.height = h;
    }

    // Mirror the background's object-fit: cover crop, so the duplicate samples
    // exactly the region of the frame that is on screen behind the card, then
    // extend that sample by the same bleed applied to the layer above. Sampling
    // outside the frame is well-defined (transparent) and keeps the visible
    // region pixel-aligned with the real background.
    const cover = Math.max(vw / video.videoWidth, vh / video.videoHeight);
    const bleedSrc = DUP_BLEED / cover;
    const sw = vw / cover + bleedSrc * 2;
    const sh = vh / cover + bleedSrc * 2;
    const sx = (video.videoWidth - vw / cover) / 2 - bleedSrc;
    const sy = (video.videoHeight - vh / cover) / 2 - bleedSrc;

    try {
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, w, h);
    } catch {
      // frame not decodable yet
    }
  };
}

/**
 * Whether the browser can actually run the refraction pipeline.
 * Drives the progressive-enhancement fallback chain:
 *   full liquid glass -> backdrop-filter glass -> translucent frosted panel.
 */
export function supportsLiquidGlass(): boolean {
  if (typeof document === 'undefined') return false;
  const canvas = document.createElement('canvas');
  if (!canvas.getContext('2d')) return false;
  // Safari historically shipped SVG filters but not filter-on-canvas via CSS
  // url(); CSS.supports is the cheapest honest probe available.
  return typeof CSS !== 'undefined' && CSS.supports('filter', 'url(#liquid-glass-refraction)');
}

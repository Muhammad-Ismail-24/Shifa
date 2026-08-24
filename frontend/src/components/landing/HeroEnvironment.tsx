/**
 * The full-bleed background orb.
 *
 * Kept as the reference's prerecorded clip: it is the page's visual identity and
 * a hand-rolled shader orb would be a downgrade. The ambient audio response is
 * applied as a sub-1% transform on this element, which is enough to feel alive
 * without the environment ever pumping like a music visualiser.
 *
 * The source is configurable via VITE_HERO_VIDEO_URL — see README for the
 * licensing note before this ships.
 */

import { forwardRef } from 'react';

const FALLBACK_SRC =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260816_125506_3a597378-ec85-4ebd-bd22-03b45508ac62.mp4';

const SRC = import.meta.env.VITE_HERO_VIDEO_URL || FALLBACK_SRC;

export const HeroEnvironment = forwardRef<HTMLVideoElement>((_props, ref) => (
  <video
    ref={ref}
    id="bg-video"
    className="bg-video"
    aria-hidden="true"
    autoPlay
    muted
    loop
    playsInline
    preload="auto"
    /* crossOrigin is required for the duplicate canvas to stay untainted;
       without it drawImage poisons the canvas and the glass goes black. */
    crossOrigin="anonymous"
    src={SRC}
  />
));

HeroEnvironment.displayName = 'HeroEnvironment';

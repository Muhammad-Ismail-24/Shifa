/**
 * Shifa's landing page — the reference composition, driven by a real voice
 * session.
 *
 * Layout notes carried over deliberately: .hero is pointer-events: none and
 * interactive children opt back in, the two bottom columns sit at opposite ends
 * of the area under the navbar, and the card is bottom-right at a fixed
 * 340x460 on desktop.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import { ArchitecturalRules } from '../components/landing/ArchitecturalRules';
import { HeroCopy } from '../components/landing/HeroCopy';
import { HeroEnvironment } from '../components/landing/HeroEnvironment';
import { MenuDrawer } from '../components/landing/MenuDrawer';
import { ShifaNav } from '../components/landing/ShifaNav';
import { VoiceCTA } from '../components/landing/VoiceCTA';
import { VoiceStatusCard } from '../components/landing/VoiceStatusCard';
import { supportsLiquidGlass } from '../voice/glassCardSync';
import { useVoiceSession } from '../voice/useVoiceSession';
import { VoiceState, type VoiceStateValue } from '../voice/voiceState';
import { clamp, lerp } from '../lib/utils';

/**
 * DEV-ONLY state preview: `?state=thinking` pins the card to one state so the
 * visual states can be reviewed without holding a conversation.
 *
 * Gated on import.meta.env.DEV, so Vite eliminates the whole branch from a
 * production build — it is a development affordance, never demo behaviour.
 */
function useStatePreview(): VoiceStateValue | null {
  if (!import.meta.env.DEV) return null;
  const requested = new URLSearchParams(window.location.search).get('state');
  if (!requested) return null;
  const valid = Object.values(VoiceState) as string[];
  return valid.includes(requested) ? (requested as VoiceStateValue) : null;
}

const PREVIEW_TRANSCRIPTS: Partial<Record<VoiceStateValue, { user: string; shifa: string }>> = {
  [VoiceState.USER_SPEAKING]: { user: 'مجھے تین دن سے بخار اور سر درد ہے', shifa: '' },
  [VoiceState.THINKING]: { user: 'مجھے تین دن سے بخار اور سر درد ہے', shifa: '' },
  [VoiceState.SPEAKING]: { user: '', shifa: 'آپ کو یہ تکلیف کب سے ہو رہی ہے؟' },
};

export default function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);
  const cardRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const session = useVoiceSession();
  const preview = useStatePreview();

  const state = preview ?? session.state;
  const previewText = preview ? PREVIEW_TRANSCRIPTS[preview] : undefined;

  // Probe once: the result cannot change for the page's lifetime.
  const liquidGlass = useMemo(() => supportsLiquidGlass(), []);

  /**
   * Ambient environment response. The orb scales by at most 1.8% at full voice
   * energy — enough to register peripherally, far too little to read as a
   * reactive visualiser. Written to a CSS variable so the compositor animates
   * it rather than React re-rendering the video element.
   */
  useEffect(() => {
    const energy = clamp(session.level * 6, 0, 1);
    document.documentElement.style.setProperty('--env-scale', lerp(1, 1.018, energy).toFixed(4));
  }, [session.level]);

  return (
    <>
      <HeroEnvironment ref={videoRef} />

      <main className="hero">
        <ArchitecturalRules />

        <ShifaNav menuOpen={menuOpen} onOpenMenu={() => setMenuOpen(true)} />

        <div className="hero-bottom">
          <div className="lede">
            <HeroCopy />

            <VoiceCTA state={state} onStart={session.start} onStop={session.stop} />

            <p className="lede__privacy">
              Your microphone starts only when you choose to talk.
            </p>
          </div>

          <VoiceStatusCard
            cardRef={cardRef}
            videoRef={videoRef}
            liquidGlass={liquidGlass}
            state={state}
            userText={previewText?.user ?? session.userText}
            shifaText={previewText?.shifa ?? session.shifaText}
            errorMessage={
              preview === VoiceState.ERROR
                ? "Shifa couldn't respond just now. Try once more."
                : session.errorMessage
            }
            onRetry={session.retry}
            getWaveInputs={session.getWaveInputs}
          />
        </div>
      </main>

      <MenuDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}

/**
 * How It Works — the product page.
 *
 * Desktop uses sticky scroll storytelling: the demo panel stays put while the
 * three steps scroll past, changing state as each step becomes the active one.
 * Mobile does not depend on sticky behaviour at all — each step simply carries
 * its own panel inline, in order.
 *
 * Step copy is from pages.md. Terminology stays at "preliminary", "possible"
 * and "guidance"; nothing here implies diagnosis or certainty.
 */

import { useEffect, useRef, useState } from 'react';

import { PageHero } from '../components/informational/PageHero';
import { PageShell } from '../components/informational/PageShell';
import { Reveal } from '../components/informational/Reveal';
import { SafetyNotice } from '../components/informational/SafetyNotice';
import { ShifaCTA } from '../components/informational/ShifaCTA';
import { VoiceJourney } from '../components/informational/VoiceJourney';

const STEPS = [
  {
    index: '01',
    title: 'Speak your symptoms in Urdu',
    body: [
      'Open Shifa and tap the microphone. Speak naturally, the way you would describe your symptoms to a friend or family member. You do not need to use medical terms. Just say what you feel, in your own words, in Urdu.',
      'Shifa listens carefully and understands natural, conversational Urdu — including regional expressions and informal phrasing.',
    ],
  },
  {
    index: '02',
    title: 'Shifa analyses what you described',
    body: [
      'Within seconds, Shifa’s AI engine processes what you described. It cross-references your symptoms against a curated medical knowledge base, identifies possible causes, and determines the appropriate level of care.',
      'You do not wait long. You do not fill out any forms. The analysis happens instantly, in the background, so the experience feels like a conversation — not a medical procedure.',
    ],
  },
  {
    index: '03',
    title: 'Receive guidance and find help nearby',
    body: [
      'Shifa delivers a preliminary assessment of what your symptoms may indicate, explained in plain, simple Urdu that anyone can understand.',
      'It offers basic over-the-counter medicine suggestions for common, non-emergency conditions — clearly labelled with dosage guidance where appropriate — and the nearest hospitals and clinics to your current location, found automatically using your GPS coordinates.',
    ],
  },
];

export default function HowItWorks() {
  const [active, setActive] = useState(0);
  const stepRefs = useRef<(HTMLElement | null)[]>([]);

  /**
   * Drives the sticky panel.
   *
   * Deliberately NOT gated on a desktop media query. Gating it at mount meant
   * that loading below 1024px and then widening the window - an ordinary
   * desktop resize - left the observer never created and the sticky panel
   * frozen on step 1. Observing three elements is cheap, and `active` is only
   * ever read by the desktop sticky panel (the stacked mobile panels use a
   * fixed step index), so running it at every width is harmless.
   */
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const i = stepRefs.current.indexOf(entry.target as HTMLElement);
          if (i >= 0) setActive(i);
        }
      },
      // A band across the middle of the viewport: a step becomes active when it
      // reaches the reader's eye line, not when it first peeks in.
      { rootMargin: '-45% 0px -45% 0px', threshold: 0 },
    );

    for (const el of stepRefs.current) if (el) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <PageShell title="How it works">
      <PageHero
        eyebrow="How it works"
        title={
          <>
            Speak. Understand.
            <br />
            <em>Find help.</em>
          </>
        }
        standfirst="Shifa was designed to be as simple as a conversation. No training needed. No instructions to read. If you can speak, you can use Shifa."
      />

      <section className="doc__section">
        <div className="doc__wrap">
          <ul className="promises">
            {['No typing', 'No medical terminology', 'No complicated forms'].map((item, i) => (
              <Reveal as="li" className="promises__item" key={item} delay={i * 80}>
                {item}
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      {/* --- Sticky scroll storytelling ----------------------------------- */}
      <section className="doc__section doc__section--divide" aria-labelledby="steps-heading">
        <div className="doc__wrap">
          <h2 className="sr-only" id="steps-heading">
            Three steps to health guidance
          </h2>

          <div className="story">
            <div className="story__steps">
              {STEPS.map((step, i) => (
                <article
                  className={`story__step${active === i ? ' is-active' : ''}`}
                  key={step.index}
                  ref={(el) => {
                    stepRefs.current[i] = el;
                  }}
                >
                  <span className="doc__eyebrow doc__eyebrow--plain">
                    <span className="doc__index">{step.index}</span>
                    <span>Step {step.index}</span>
                  </span>

                  <h3 className="doc__h2 story__stepTitle">{step.title}</h3>

                  {step.body.map((paragraph) => (
                    <p className="doc__p" key={paragraph.slice(0, 32)}>
                      {paragraph}
                    </p>
                  ))}

                  {/* Mobile / tablet: the panel travels with its own step. */}
                  <div className="story__inlinePanel">
                    <VoiceJourney step={i} />
                  </div>
                </article>
              ))}
            </div>

            {/* Desktop: one panel, pinned, changing state as steps pass. */}
            <div className="story__sticky">
              <VoiceJourney step={active} />
            </div>
          </div>
        </div>
      </section>

      <section className="doc__section doc__section--divide">
        <div className="doc__wrap doc__wrap--narrow">
          <SafetyNotice label="Important">
            <p className="doc__p">
              Shifa provides preliminary, informational guidance based on the symptoms you
              describe. It does not diagnose, and it is not for emergencies. If your symptoms
              are serious, persistent, or worsening, seek in-person medical care.
            </p>
          </SafetyNotice>
        </div>
      </section>

      <ShifaCTA
        title="You have already read more instructions than Shifa needs."
        body="There is nothing to learn and nothing to fill in. Open Shifa, tap the microphone, and say what you feel."
      />
    </PageShell>
  );
}

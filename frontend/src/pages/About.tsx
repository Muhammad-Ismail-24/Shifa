/**
 * About Shifa — the mission page.
 *
 * Deliberately ordered so the human case is made before any technology is
 * mentioned: mission, the people it is for, what the team believes, and only
 * then how it is built. Copy is from pages.md; the scenarios are written as
 * representative situations, never as testimonials, and no person, hospital,
 * statistic or endorsement is invented.
 */

import { BridgePath } from '../components/informational/BridgePath';
import { PageHero } from '../components/informational/PageHero';
import { PageShell } from '../components/informational/PageShell';
import { Reveal } from '../components/informational/Reveal';
import { SectionHeader } from '../components/informational/SectionHeader';
import { ShifaCTA } from '../components/informational/ShifaCTA';
import { UrduAccent } from '../components/informational/UrduAccent';

/**
 * Representative situations drawn from pages.md. Labelled in the markup as
 * scenarios rather than customer stories — Shifa has no users to quote, and a
 * health product must not manufacture social proof.
 */
const SCENARIOS = [
  {
    place: 'Outside Dera Ghazi Khan',
    line: 'A mother who does not know if her child’s fever is serious.',
  },
  {
    place: 'Rural Sindh',
    line: 'A farmer who has been ignoring chest pain because the nearest clinic is two hours away.',
  },
  {
    place: 'Anywhere',
    line: 'Every person who has ever felt that healthcare was a privilege that belonged to someone else.',
  },
];

const BELIEFS = [
  {
    index: '01',
    statement: 'Access to basic health information is not a luxury.',
  },
  {
    index: '02',
    statement: 'Language should never be a barrier between a person and their wellbeing.',
  },
  {
    index: '03',
    statement:
      'Technology, designed with empathy, can reach the people that systems have long forgotten.',
  },
];

const TECHNOLOGY = [
  {
    term: 'Voice first',
    detail:
      'No reading required. No typing required. No prior experience with technology required.',
  },
  {
    term: 'Large language AI',
    detail:
      'Understands natural, conversational Urdu — including regional expressions and informal phrasing.',
  },
  {
    term: 'Retrieval-augmented generation',
    detail:
      'Symptoms are cross-referenced against a curated medical knowledge base rather than recalled from memory alone.',
  },
  {
    term: 'GPS hospital location',
    detail:
      'The nearest hospitals and clinics to your current location, so you always know where to go.',
  },
];

export default function About() {
  return (
    <PageShell title="About Shifa">
      <PageHero
        eyebrow="About Shifa"
        title={
          <>
            Healthcare should speak
            <br />
            <em>your language.</em>
          </>
        }
        standfirst="In rural Pakistan, millions of people face a healthcare system that was never built for them. Distances are long, doctors are few, literacy is a barrier, and the language of medicine has always been someone else’s language — not Urdu, not the language of home."
      />

      {/* --- Mission ------------------------------------------------------ */}
      <section className="doc__section">
        <div className="doc__wrap">
          <div className="doc__cols">
            <div className="doc__colsAside">
              <SectionHeader index="01" eyebrow="Our mission" title="Shifa exists to change that." />
            </div>

            <Reveal>
              <p className="doc__p">
                Shifa is a voice-first AI healthcare assistant designed from the ground up for
                the people who need it most. No reading required. No typing required. No prior
                experience with technology required. Just speak — in natural, everyday Urdu —
                and Shifa listens.
              </p>

              <div style={{ marginTop: '2.5rem', maxWidth: '26rem' }}>
                <UrduAccent urdu="صحت سب کے لیے" gloss="Health for everyone" />
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* --- Who we built this for ---------------------------------------- */}
      <section className="doc__section doc__section--divide">
        <div className="doc__wrap">
          <SectionHeader
            index="02"
            eyebrow="Who we built this for"
            title="Shifa is for them."
            body="These are representative situations, not customer stories. Shifa is a project in development and has no users to quote."
          />

          <ol className="doc__statementList scenarios">
            {SCENARIOS.map((scenario, i) => (
              <Reveal as="li" key={scenario.place} delay={i * 90}>
                <span className="doc__eyebrow doc__eyebrow--plain scenarios__place">
                  {scenario.place}
                </span>
                <p className="doc__lead scenarios__line">{scenario.line}</p>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* --- The bridge --------------------------------------------------- */}
      <section className="doc__section doc__section--divide">
        <div className="doc__wrap">
          <SectionHeader
            index="03"
            eyebrow="The distance Shifa bridges"
            title={
              <>
                Shifa is not a replacement for doctors.
                <br />
                <em style={{ fontStyle: 'normal', color: 'rgba(0,0,0,0.42)' }}>It is a bridge</em> —
                to awareness, to guidance, to the nearest help available.
              </>
            }
          />

          <BridgePath />
        </div>
      </section>

      {/* --- What we believe ---------------------------------------------- */}
      <section className="doc__section doc__section--divide">
        <div className="doc__wrap">
          <SectionHeader index="04" eyebrow="What we believe" title="Three things, plainly." />

          <ol className="doc__statementList beliefs">
            {BELIEFS.map((belief, i) => (
              <Reveal as="li" key={belief.index} delay={i * 90}>
                <span className="doc__index">{belief.index}</span>
                <p className="doc__statement">{belief.statement}</p>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* --- Technology ---------------------------------------------------- */}
      <section className="doc__section doc__section--divide">
        <div className="doc__wrap">
          <div className="doc__cols">
            <div className="doc__colsAside">
              <SectionHeader
                index="05"
                eyebrow="Our technology"
                title="Infrastructure, in service of a conversation."
                body="Built by a team that understands both the technology and the people it serves."
              />
            </div>

            <Reveal>
              <dl className="techList">
                {TECHNOLOGY.map((item) => (
                  <div className="techList__row" key={item.term}>
                    <dt className="techList__term">{item.term}</dt>
                    <dd className="techList__detail">{item.detail}</dd>
                  </div>
                ))}
              </dl>
            </Reveal>
          </div>
        </div>
      </section>

      <ShifaCTA
        title="The simplest way to understand Shifa is to speak to it."
        body="Tell Shifa what happened in your own words. It listens, understands your situation, and helps you navigate the next step."
      />
    </PageShell>
  );
}

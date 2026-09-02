/**
 * Contact.
 *
 * Contact values need care. pages.md marks every address and social handle it
 * lists as *(placeholder)*, so none of them are rendered as working links —
 * presenting an unregistered address as live is a small lie that costs someone
 * a real message. They are shown as text, explicitly labelled "not yet active".
 *
 * The one genuine channel is hello@shifa.health, which already ships in the
 * landing page's menu drawer, so it is used here as the single live mailto and
 * the site stays consistent with itself.
 */

import { ConnectionMap } from '../components/informational/ConnectionMap';
import { PageHero } from '../components/informational/PageHero';
import { PageShell } from '../components/informational/PageShell';
import { Reveal } from '../components/informational/Reveal';
import { SectionHeader } from '../components/informational/SectionHeader';
import { UrduAccent } from '../components/informational/UrduAccent';
import { Mail } from '../components/informational/icons';

/** From pages.md. Every one is marked a placeholder there, so none are linked. */
const PLANNED_CHANNELS = [
  { label: 'Team', value: 'team@shifa.ai' },
  { label: 'General inquiries', value: 'hello@shifa.ai' },
  { label: 'Press & partnerships', value: 'press@shifa.ai' },
];

const PLANNED_SOCIAL = [
  { label: 'GitHub', value: 'github.com/team-shifa' },
  { label: 'LinkedIn', value: 'linkedin.com/company/shifa-ai' },
  { label: 'Twitter / X', value: '@ShifaAI_PK' },
];

export default function Contact() {
  return (
    <PageShell title="Contact">
      <PageHero
        eyebrow="Contact"
        title={
          <>
            Talk to the humans
            <br />
            <em>behind Shifa.</em>
          </>
        }
        standfirst="Shifa was built with care by a team of developers, designers, and healthcare advocates who believe technology should serve everyone — including those who have been left behind. We welcome your feedback, questions, partnership inquiries, and suggestions."
      />

      {/* --- Live channel --------------------------------------------------- */}
      <section className="doc__section">
        <div className="doc__wrap">
          <div className="doc__cols">
            <div className="doc__colsAside">
              <SectionHeader index="01" eyebrow="Get in touch" title="One inbox, read by the team." />
            </div>

            <Reveal>
              <a className="mailCard" href="mailto:hello@shifa.health">
                <span className="mailCard__icon" aria-hidden="true">
                  <Mail size={20} />
                </span>
                <span className="mailCard__text">
                  <span className="mailCard__label">Email Team Shifa</span>
                  <span className="mailCard__value">hello@shifa.health</span>
                </span>
              </a>

              <div className="planned">
                <p className="planned__intro">
                  These addresses and accounts are reserved for Shifa but are{' '}
                  <strong>not yet active</strong>. Until they are, everything reaches us at the
                  address above.
                </p>

                <dl className="planned__list">
                  {PLANNED_CHANNELS.map((channel) => (
                    <div className="planned__row" key={channel.value}>
                      <dt className="planned__label">{channel.label}</dt>
                      <dd className="planned__value">
                        {channel.value}
                        <span className="planned__tag">Not yet active</span>
                      </dd>
                    </div>
                  ))}
                  {PLANNED_SOCIAL.map((channel) => (
                    <div className="planned__row" key={channel.value}>
                      <dt className="planned__label">{channel.label}</dt>
                      <dd className="planned__value">
                        {channel.value}
                        <span className="planned__tag">Not yet active</span>
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* --- Who we want to hear from --------------------------------------- */}
      <section className="doc__section doc__section--divide">
        <div className="doc__wrap">
          <SectionHeader
            index="02"
            eyebrow="Who we want to hear from"
            title="We do not have all the answers yet."
            body="We are building, learning, and listening. Some voices help more than others right now."
          />

          <ConnectionMap />
        </div>
      </section>

      {/* --- Note from the team ---------------------------------------------- */}
      <section className="doc__section doc__section--divide">
        <div className="doc__wrap doc__wrap--narrow">
          <Reveal>
            <article className="doc__paper note">
              <span className="doc__eyebrow doc__eyebrow--plain note__eyebrow">
                A note from the team
              </span>

              <p className="note__opening">
                Shifa started as a hackathon idea born from a simple question:
              </p>

              <blockquote className="note__question">
                Why does good health guidance only exist in English, and only for people who can
                read it?
              </blockquote>

              <p className="note__body">
                We do not have all the answers yet. But we are building, learning, and listening.
                If you have lived experience of healthcare access challenges in rural Pakistan,
                or if you are a medical professional who wants to help us get the guidance right,
                we especially want to hear from you.
              </p>

              <p className="note__body">Thank you for believing in what we are building.</p>

              <p className="note__sign">— Team Shifa</p>
            </article>
          </Reveal>
        </div>
      </section>

      {/* --- Urdu endpoint ---------------------------------------------------- */}
      <section className="doc__section doc__section--divide endnote">
        <div className="doc__wrap">
          <Reveal>
            <div className="endnote__inner">
              <UrduAccent urdu="شفا — صحت سب کے لیے" gloss="Shifa — Health for Everyone" />
            </div>
          </Reveal>
        </div>
      </section>
    </PageShell>
  );
}

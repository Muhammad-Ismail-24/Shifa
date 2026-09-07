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
import { useState } from 'react';
import { Reveal } from '../components/informational/Reveal';
import { SectionHeader } from '../components/informational/SectionHeader';
import { UrduAccent } from '../components/informational/UrduAccent';

export default function Contact() {
  const [formData, setFormData] = useState({ name: '', email: '', message: '' });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setFormData({ name: '', email: '', message: '' });
  };

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
              {submitted ? (
                <div className="flex flex-col items-center justify-center p-8 text-center rounded-xl border border-white/20 bg-white/10 backdrop-blur-md">
                  <div className="w-12 h-12 rounded-full bg-green-500/20 text-green-700 flex items-center justify-center mb-4">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-black mb-2">Thank you!</h3>
                  <p className="text-sm text-black/70">Your message has been received. We'll get back to you soon.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <input
                      type="text"
                      placeholder="Name"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full rounded-xl border border-white/20 bg-white/10 backdrop-blur-md px-4 py-3 text-sm text-black placeholder:text-black/40 focus:outline-none focus:ring-1 focus:ring-black/20"
                    />
                  </div>
                  <div>
                    <input
                      type="email"
                      placeholder="Email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full rounded-xl border border-white/20 bg-white/10 backdrop-blur-md px-4 py-3 text-sm text-black placeholder:text-black/40 focus:outline-none focus:ring-1 focus:ring-black/20"
                    />
                  </div>
                  <div>
                    <textarea
                      placeholder="Message"
                      required
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                      className="w-full rounded-xl border border-white/20 bg-white/10 backdrop-blur-md px-4 py-3 text-sm text-black placeholder:text-black/40 focus:outline-none focus:ring-1 focus:ring-black/20 min-h-[120px] resize-none"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full rounded-xl bg-black text-white py-3 text-sm font-medium transition hover:bg-black/85 disabled:opacity-40"
                  >
                    Send message
                  </button>
                </form>
              )}
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

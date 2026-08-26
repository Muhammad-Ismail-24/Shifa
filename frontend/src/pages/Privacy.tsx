/**
 * Privacy — the transparency page.
 *
 * Every claim is a restatement of pages.md. Nothing is added about encryption,
 * transport security, retention windows, hosting or infrastructure, because
 * none of that is documented and an invented security guarantee is the single
 * most damaging thing this page could contain.
 */

import { LocationControl } from '../components/informational/LocationControl';
import { PageHero } from '../components/informational/PageHero';
import { PageShell } from '../components/informational/PageShell';
import { PrivacyFlow } from '../components/informational/PrivacyFlow';
import { Reveal } from '../components/informational/Reveal';
import { SectionHeader } from '../components/informational/SectionHeader';
import { ShifaCTA } from '../components/informational/ShifaCTA';
import { Slash } from '../components/informational/icons';

const PLEDGES = [
  'We do not sell your data. Ever. To anyone.',
  'We do not store your voice recordings.',
  'We do not share your location with third parties.',
  'We do not build personal health profiles linked to your identity.',
  'We do not require you to create an account or provide your name.',
];

export default function Privacy() {
  return (
    <PageShell title="Privacy">
      <PageHero
        eyebrow="Privacy"
        title={
          <>
            Your privacy is
            <br />
            <em>sacred to us.</em>
          </>
        }
        standfirst="Health information is among the most personal information a person can share. We take that trust seriously. This page explains clearly what we collect, what we do not collect, and how your information is handled."
      />

      {/* --- What happens to your data ------------------------------------ */}
      <section className="doc__section">
        <div className="doc__wrap">
          <SectionHeader
            index="01"
            eyebrow="What we collect"
            title="Follow the two things Shifa touches."
            body="Voice and location are the only sensitive inputs Shifa uses. Here is the whole path each one takes, end to end."
          />

          <PrivacyFlow />

          <Reveal>
            <p className="doc__p" style={{ marginTop: '3rem' }}>
              <strong>Session data.</strong> We may collect anonymous, non-identifiable usage
              data — such as which features were used and how long a session lasted — to
              improve the Shifa experience. This data cannot be traced back to any individual
              user.
            </p>
          </Reveal>
        </div>
      </section>

      {/* --- The pledge ---------------------------------------------------- */}
      <section className="doc__section doc__section--divide">
        <div className="doc__wrap">
          <SectionHeader index="02" eyebrow="What we do not do" title="Five things we will not do." />

          <ul className="pledge">
            {PLEDGES.map((pledge, i) => (
              <Reveal as="li" className="pledge__item" key={pledge} delay={i * 80}>
                <span className="pledge__mark" aria-hidden="true">
                  <Slash size={18} />
                </span>
                <p className="pledge__text">{pledge}</p>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      {/* --- Your control -------------------------------------------------- */}
      <section className="doc__section doc__section--divide">
        <div className="doc__wrap">
          <div className="doc__cols">
            <div className="doc__colsAside">
              <SectionHeader
                index="03"
                eyebrow="Your control"
                title="Location is your choice."
                body="You choose whether to grant location access. Shifa works without it — you simply will not receive the nearby hospital feature. All permissions can be revoked at any time through your device settings."
              />
            </div>

            <Reveal>
              <LocationControl />
            </Reveal>
          </div>
        </div>
      </section>

      {/* --- Questions ------------------------------------------------------ */}
      <section className="doc__section doc__section--divide">
        <div className="doc__wrap doc__wrap--narrow">
          <SectionHeader index="04" eyebrow="Questions" title="Ask us plainly." />
          <p className="doc__p">
            If you have any questions about how your data is handled, please reach out. We
            will respond promptly and plainly.
          </p>
          <p className="doc__p" style={{ marginTop: '1.5rem' }}>
            <a className="doc__link" href="mailto:hello@shifa.health">
              hello@shifa.health
            </a>
          </p>
        </div>
      </section>

      <ShifaCTA
        title="Nothing here asks you to trade privacy for help."
        body="No account. No name. No stored recording. Speak when you are ready."
      />
    </PageShell>
  );
}

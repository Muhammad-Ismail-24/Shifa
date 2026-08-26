/**
 * Terms of Service.
 *
 * The legally and medically significant wording from pages.md is reproduced
 * intact — this page is typeset, not rewritten. Structure, hierarchy and
 * anchor navigation are the design work; the sentences are not.
 *
 * The medical disclaimer is the first thing after the hero, is a labelled
 * landmark, and carries the heaviest treatment on the page.
 */

import { PageHero } from '../components/informational/PageHero';
import { PageShell } from '../components/informational/PageShell';
import { SafetyNotice } from '../components/informational/SafetyNotice';
import { ShifaCTA } from '../components/informational/ShifaCTA';
import { TermsContents, type TermsSection } from '../components/informational/TermsContents';

const SECTIONS: TermsSection[] = [
  { id: 'medical-disclaimer', label: 'Medical disclaimer' },
  { id: 'acceptable-use', label: 'Acceptable use' },
  { id: 'changes', label: 'Changes to these terms' },
  { id: 'governing', label: 'Governing terms' },
];

const DISCLAIMER_POINTS = [
  {
    title: 'Shifa does not diagnose.',
    body: 'The assessments provided by Shifa are preliminary, informational, and based on the symptoms you describe. They are not clinical diagnoses. They may be incomplete, imprecise, or inapplicable to your specific situation.',
  },
  {
    title: 'Always consult a real doctor.',
    body: 'Nothing Shifa tells you should be used to delay, replace, or override the advice of a licensed physician. If your symptoms are serious, persistent, or worsening, please seek in-person medical care.',
  },
  {
    title: 'Medicine suggestions are general only.',
    body: 'Any over-the-counter medicine suggestions provided by Shifa are general guidance for common conditions. They are not prescriptions. Always read medicine labels carefully, consult a pharmacist if unsure, and never give adult medicines to children without medical advice.',
  },
  {
    title: 'Shifa is not liable for health outcomes.',
    body: 'The creators of Shifa, Team Shifa, accept no liability for any health decisions made based on information provided through this application. You use Shifa at your own discretion and risk.',
  },
];

const EMERGENCY_SIGNS = [
  'Difficulty breathing',
  'Severe chest pain',
  'Loss of consciousness',
  'Heavy bleeding',
  'Stroke symptoms',
  'Any life-threatening condition',
];

export default function Terms() {
  return (
    <PageShell title="Terms of Use">
      <PageHero
        eyebrow="Terms of Service"
        title={
          <>
            Terms of use —
            <br />
            <em>please read carefully.</em>
          </>
        }
        standfirst="By using Shifa, you agree to the following terms. These terms exist to protect you and to ensure Shifa is used safely and appropriately."
      />

      <div className="doc__wrap">
        <div className="terms">
          <aside className="terms__aside">
            <TermsContents sections={SECTIONS} />
          </aside>

          <div className="terms__body">
            {/* --- Medical disclaimer ------------------------------------- */}
            <section className="terms__section" aria-labelledby="medical-disclaimer">
              <span className="doc__eyebrow doc__eyebrow--plain">
                <span className="doc__index">01</span>
                <span>Critical notice</span>
              </span>
              <h2 className="doc__h2 terms__heading" id="medical-disclaimer">
                Medical disclaimer
              </h2>

              <SafetyNotice label="Medical disclaimer — critical notice" critical>
                <p className="doc__p">
                  <strong>
                    Shifa is an AI-powered health information tool. It is not a licensed
                    medical professional, a certified diagnostic system, or a substitute for
                    qualified healthcare.
                  </strong>
                </p>
                <p className="doc__p" style={{ marginTop: '1rem' }}>
                  Please read the following carefully before using Shifa.
                </p>
              </SafetyNotice>

              {/* Emergencies get their own block: it is the one instruction on this
                  page that someone may need to act on within seconds. */}
              <div className="emergency">
                <h3 className="emergency__title">Shifa is not for emergencies.</h3>
                <p className="emergency__body">
                  If you or someone near you is experiencing a medical emergency — including
                  but not limited to the following — do not use Shifa. Call emergency services
                  or go to the nearest hospital immediately.
                </p>
                <ul className="emergency__list">
                  {EMERGENCY_SIGNS.map((sign) => (
                    <li className="emergency__item" key={sign}>
                      {sign}
                    </li>
                  ))}
                </ul>
                <p className="emergency__urdu doc__urdu" lang="ur" dir="rtl">
                  فوری طور پر ہسپتال جائیں
                </p>
                <p className="emergency__gloss">“Go to a hospital immediately.”</p>
              </div>

              <dl className="terms__points">
                {DISCLAIMER_POINTS.map((point) => (
                  <div className="terms__point" key={point.title}>
                    <dt className="doc__h3">{point.title}</dt>
                    <dd className="doc__p">{point.body}</dd>
                  </div>
                ))}
              </dl>
            </section>

            {/* --- Acceptable use ----------------------------------------- */}
            <section className="terms__section" aria-labelledby="acceptable-use">
              <span className="doc__eyebrow doc__eyebrow--plain">
                <span className="doc__index">02</span>
                <span>Your responsibilities</span>
              </span>
              <h2 className="doc__h2 terms__heading" id="acceptable-use">
                Acceptable use
              </h2>
              <p className="doc__p">
                You agree to use Shifa only for its intended purpose — personal health
                information and guidance. You agree not to misuse, reverse engineer, or attempt
                to manipulate Shifa’s AI systems. You agree not to use Shifa to seek guidance on
                behalf of others in emergency situations where immediate professional care is
                required.
              </p>
            </section>

            {/* --- Changes ------------------------------------------------- */}
            <section className="terms__section" aria-labelledby="changes">
              <span className="doc__eyebrow doc__eyebrow--plain">
                <span className="doc__index">03</span>
                <span>Updates</span>
              </span>
              <h2 className="doc__h2 terms__heading" id="changes">
                Changes to these terms
              </h2>
              <p className="doc__p">
                We may update these terms as Shifa evolves. Continued use of the application
                after changes are posted constitutes acceptance of the updated terms.
              </p>
            </section>

            {/* --- Governing ----------------------------------------------- */}
            <section className="terms__section" aria-labelledby="governing">
              <span className="doc__eyebrow doc__eyebrow--plain">
                <span className="doc__index">04</span>
                <span>Status</span>
              </span>
              <h2 className="doc__h2 terms__heading" id="governing">
                Governing terms
              </h2>
              <p className="doc__p">
                These terms are governed in good faith by the principles of responsible AI
                development and user safety. Shifa is a hackathon project currently in
                development and not yet a registered commercial product.
              </p>
            </section>
          </div>
        </div>
      </div>

      <ShifaCTA
        title="Questions about any of this?"
        body="If something here is unclear, ask us. We would rather explain it than have you guess."
        action={{ label: 'Contact the team', to: '/contact' }}
      />
    </PageShell>
  );
}

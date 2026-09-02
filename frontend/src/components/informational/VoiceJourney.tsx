/**
 * The How-it-works product demonstration.
 *
 * Three panels matching the three steps in pages.md. It demonstrates the shape
 * of the interaction — speak, understand, guidance — and deliberately stops
 * short of performing one:
 *
 *   - No diagnosis is shown. The guidance panel lists the CATEGORIES of output
 *     Shifa returns, not a condition, because inventing a plausible-looking
 *     diagnosis for a marketing page is exactly the failure mode a health
 *     product cannot afford.
 *   - The "understanding" panel shows product-level stages only. It is not a
 *     rendering of model reasoning and must never be dressed up as one.
 *
 * The panel is purely illustrative, so it is aria-hidden: every fact it depicts
 * is also written out in the step copy beside it.
 */

import { Check, Hospital, Mic, Sparkle } from './icons';

/** Bar heights for the idle waveform, in percent. Fixed, not random, so the
    figure is stable across renders and does not thrash the compositor. */
const BARS = [22, 46, 34, 68, 88, 62, 96, 54, 72, 38, 58, 30, 44, 24, 40];

const UNDERSTANDING_STAGES = [
  'Speech recognised',
  'Symptoms understood',
  'Knowledge base consulted',
  'Level of care determined',
];

const GUIDANCE_ROWS = [
  {
    icon: 'assessment' as const,
    label: 'Preliminary assessment',
    detail: 'What your symptoms may indicate, in plain, simple Urdu.',
  },
  {
    icon: 'medicine' as const,
    label: 'Over-the-counter guidance',
    detail: 'For common, non-emergency conditions, with dosage where appropriate.',
  },
  {
    icon: 'hospital' as const,
    label: 'Nearby hospitals and clinics',
    detail: 'Found from your GPS location, so you know where to go.',
  },
];

export function VoiceJourney({ step }: { step: number }) {
  return (
    <div className="journey" aria-hidden="true">
      <div className="journey__panel">
        <div className="journey__head">
          <span className="journey__title">Shifa</span>
          <span className="journey__state">
            {step === 0 ? '// LISTENING' : step === 1 ? '// UNDERSTANDING' : '// GUIDANCE'}
          </span>
        </div>

        <div className="journey__body">
          {/* --- 1. Listening --------------------------------------------- */}
          {step === 0 ? (
            <div className="journey__stage">
              <span className="journey__mic">
                <Mic size={18} />
              </span>

              <p className="journey__urdu doc__urdu" lang="ur" dir="rtl">
                مجھے کل سے بخار ہے اور سر میں درد ہو رہا ہے
              </p>
              <p className="journey__roman">
                “Mujhe kal se bukhaar hai aur sar mein dard ho raha hai.”
              </p>

              <div className="journey__wave">
                {BARS.map((height, i) => (
                  <span
                    className="journey__bar"
                    key={i}
                    style={{ height: `${height}%`, animationDelay: `${i * 70}ms` }}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {/* --- 2. Understanding ------------------------------------------ */}
          {step === 1 ? (
            <div className="journey__stage">
              <span className="journey__mic journey__mic--think">
                <Sparkle size={18} />
              </span>

              <ul className="journey__stages">
                {UNDERSTANDING_STAGES.map((stage, i) => (
                  <li
                    className="journey__stageRow"
                    key={stage}
                    style={{ animationDelay: `${i * 220}ms` }}
                  >
                    <span className="journey__tick">
                      <Check size={12} />
                    </span>
                    <span>{stage}</span>
                  </li>
                ))}
              </ul>

              <p className="journey__note">
                Seconds, not forms. The analysis happens in the background.
              </p>
            </div>
          ) : null}

          {/* --- 3. Guidance ------------------------------------------------ */}
          {step === 2 ? (
            <div className="journey__stage">
              <ul className="journey__guidance">
                {GUIDANCE_ROWS.map((row, i) => (
                  <li
                    className="journey__guidanceRow"
                    key={row.label}
                    style={{ animationDelay: `${i * 160}ms` }}
                  >
                    <span className="journey__guidanceIcon">
                      {row.icon === 'hospital' ? <Hospital size={15} /> : <Check size={14} />}
                    </span>
                    <span>
                      <span className="journey__guidanceLabel">{row.label}</span>
                      <span className="journey__guidanceDetail">{row.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>

              <p className="journey__reminder">
                At every step, Shifa reminds you that its guidance supports — but never
                replaces — a real doctor.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

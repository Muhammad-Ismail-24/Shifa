// Medicine list + disclaimer (always visible)

import { UrduText } from './UrduText';
import type { EnrichmentStatus, Medicine } from '../lib/types';

interface Props {
  medicines: Medicine[];
  /** Shown under the list. Non-negotiable: it renders even with zero medicines. */
  disclaimerUrdu: string;
  /**
   * Phase B state for the medicine lookup specifically.
   *
   * These four are genuinely different statements to make to someone who is
   * ill, and collapsing them is the most dangerous shortcut in this component:
   *
   *   loading — the lookup is still running
   *   ok      — it ran; an empty list means nothing is suggested for this
   *   failed  — it errored; we do not know what would have been suggested
   *   expired — the result is gone (TTL / restart); ask again to get it back
   *
   * Only `ok` may ever be phrased as "no medicine is suggested". `failed` and
   * `expired` must say we could not find out, because telling a patient there
   * is no treatment when a service timed out is a false medical statement.
   */
  status: EnrichmentStatus;
}

/**
 * The disclaimer is part of this component rather than something the page
 * remembers to add. Dosage advice and the reminder that it is not a doctor's
 * advice ship together or not at all.
 */
export default function MedicineCard({ medicines, disclaimerUrdu, status }: Props) {
  return (
    <section className="backdrop-blur-md bg-white/10 border border-white/20 rounded-2xl shadow-xl p-5">
      <h3 className="text-xs uppercase tracking-[0.14em] text-black/45">Suggested relief</h3>

      {medicines.length > 0 ? (
        <ul className="mt-4 space-y-4">
          {medicines.map((medicine, i) => (
            <li key={`${medicine.name}-${i}`} className="border-t border-black/10 pt-4 first:border-0 first:pt-0">
              <div className="flex items-center justify-between gap-3">
                <span className="text-base font-light text-black">{medicine.name}</span>
                {medicine.otc && (
                  <span className="shrink-0 rounded-full bg-black/10 px-2.5 py-1 text-[0.6875rem] tracking-wide text-black/70">
                    بغیر نسخہ
                  </span>
                )}
              </div>
              <UrduText className="mt-1 text-lg text-black/80">{medicine.name_urdu}</UrduText>
              <UrduText className="mt-1 text-base text-black/60">{medicine.dosage_urdu}</UrduText>
            </li>
          ))}
        </ul>
      ) : status === 'loading' ? (
        <div className="mt-4 space-y-3" role="status" aria-label="Looking up medicines">
          <div className="h-4 w-2/3 animate-pulse rounded-full bg-black/10" />
          <div className="h-4 w-1/2 animate-pulse rounded-full bg-black/10" />
        </div>
      ) : status === 'failed' ? (
        // "We could not check", never "there is nothing".
        <UrduText className="mt-4 text-base text-black/70">
          دواؤں کی فہرست ابھی حاصل نہیں ہو سکی۔ اس کا مطلب یہ نہیں کہ کوئی علاج موجود نہیں۔
          براہ کرم دوبارہ کوشش کریں یا ڈاکٹر سے رجوع کریں۔
        </UrduText>
      ) : status === 'expired' ? (
        <UrduText className="mt-4 text-base text-black/70">
          یہ نتائج محفوظ نہیں رہے۔ براہ کرم اپنی علامات دوبارہ بتائیں۔
        </UrduText>
      ) : (
        // status === 'ok' with an empty list: a real answer.
        <UrduText className="mt-4 text-base text-black/60">
          آپ کی حالت کے لیے کوئی عام دوا تجویز نہیں کی گئی۔ ڈاکٹر سے مشورہ کریں۔
        </UrduText>
      )}

      <UrduText className="mt-5 border-t border-black/10 pt-4 text-sm text-black/55">
        {disclaimerUrdu}
      </UrduText>
    </section>
  );
}

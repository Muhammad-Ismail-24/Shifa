// Disease name + confidence + Urdu explanation

import { UrduText } from './UrduText';
import type { Disease } from '../lib/types';

/**
 * Confidence is coloured by certainty, not by alarm: a high-confidence match is
 * the strongest signal on the card, so it carries the most weight. Deliberately
 * not red — this is a possibility list, not a diagnosis, and colouring it like
 * a warning would overstate what the model knows.
 */
const CONFIDENCE_STYLE: Record<string, string> = {
  high: 'bg-black/80 text-white',
  medium: 'bg-black/45 text-white',
  low: 'bg-black/20 text-black/70',
};

const CONFIDENCE_URDU: Record<string, string> = {
  high: 'زیادہ امکان',
  medium: 'درمیانہ امکان',
  low: 'کم امکان',
};

export default function DiseaseCard({ disease }: { disease: Disease }) {
  const key = disease.confidence?.toLowerCase() ?? 'low';
  const badge = CONFIDENCE_STYLE[key] ?? CONFIDENCE_STYLE.low;

  return (
    <article className="backdrop-blur-md bg-white/10 border border-white/20 rounded-2xl shadow-xl p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-light tracking-tight text-black">{disease.disease}</h3>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[0.6875rem] tracking-wide ${badge}`}>
          {CONFIDENCE_URDU[key] ?? disease.confidence}
        </span>
      </div>

      <UrduText className="mt-2 text-lg text-black/80">{disease.urdu}</UrduText>
    </article>
  );
}

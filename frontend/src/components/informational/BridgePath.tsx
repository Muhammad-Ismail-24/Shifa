/**
 * "The distance Shifa bridges" — the About page's central visual.
 *
 * Six stations from a person to professional care, joined by a line that draws
 * itself once the section enters the viewport. Built from a CSS scale transform
 * rather than an SVG path so it reflows between the vertical (mobile) and
 * horizontal (desktop) orientations without any viewBox or resize maths, and
 * so nothing can clip at narrow widths.
 *
 * The middle station is Shifa and is marked differently from the rest: the
 * whole point of the section is that Shifa is a span between two places, not a
 * destination.
 */

import { Mic, Pin, Sparkle } from './icons';
import { useInView } from './useInView';

interface Station {
  label: string;
  detail: string;
  icon?: 'mic' | 'shifa' | 'care';
}

const STATIONS: Station[] = [
  { label: 'A person', detail: 'Someone who is unwell, at home.' },
  { label: 'Speaks', detail: 'Naturally, in everyday Urdu.', icon: 'mic' },
  { label: 'Shifa', detail: 'Listens and understands.', icon: 'shifa' },
  { label: 'Guidance', detail: 'Plain Urdu, no medical jargon.' },
  { label: 'The nearest help', detail: 'Hospitals and clinics close by.', icon: 'care' },
  { label: 'A real doctor', detail: 'Where care actually happens.' },
];

function StationIcon({ icon }: { icon?: Station['icon'] }) {
  if (icon === 'mic') return <Mic size={15} />;
  if (icon === 'shifa') return <Sparkle size={15} />;
  if (icon === 'care') return <Pin size={15} />;
  return null;
}

export function BridgePath() {
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.2 });

  return (
    <div className={`bridge${inView ? ' is-in' : ''}`} ref={ref}>
      {/* The line is decoration; the ordered list below carries the meaning. */}
      <div className="bridge__track" aria-hidden="true">
        <span className="bridge__line" />
      </div>

      <ol className="bridge__stations">
        {STATIONS.map((station, i) => (
          <li
            className={`bridge__station${station.icon === 'shifa' ? ' bridge__station--shifa' : ''}`}
            key={station.label}
            style={{ transitionDelay: `${180 + i * 110}ms` }}
          >
            <span className="bridge__node" aria-hidden="true">
              <StationIcon icon={station.icon} />
            </span>
            <span className="bridge__label">{station.label}</span>
            <span className="bridge__detail">{station.detail}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

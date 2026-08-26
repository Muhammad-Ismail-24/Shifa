/**
 * What actually happens to the two sensitive things Shifa touches.
 *
 * Each track ends in a terminal stage — "discarded", "not retained" — because
 * that is the part people want to know and the part a paragraph buries. Every
 * stage is a restatement of pages.md; nothing about transport, encryption or
 * infrastructure is claimed, because none of that is documented.
 *
 * Rendered as two ordered lists so the sequence survives without CSS.
 */

import { Mic, Pin } from './icons';
import { useInView } from './useInView';

const TRACKS = [
  {
    kind: 'voice' as const,
    label: 'Voice input',
    stages: [
      { name: 'You speak', detail: 'In your own words, in Urdu.' },
      { name: 'Processed in real time', detail: 'To understand your symptoms.' },
      { name: 'Transcribed and analysed', detail: 'Turned into the words Shifa works from.' },
      { name: 'Recording discarded', detail: 'No audio files retained. No voice profiles built.' },
    ],
  },
  {
    kind: 'location' as const,
    label: 'Location data',
    stages: [
      { name: 'You grant permission', detail: 'Always your choice, never assumed.' },
      { name: 'Used to find nearby care', detail: 'Hospitals and clinics close to you.' },
      { name: 'Active session only', detail: 'Used for this purpose and no other.' },
      { name: 'Not retained afterwards', detail: 'Never stored on our servers after your session ends.' },
    ],
  },
];

export function PrivacyFlow() {
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.15 });

  return (
    <div className={`flow${inView ? ' is-in' : ''}`} ref={ref}>
      {TRACKS.map((track) => (
        <section className="flow__track" key={track.kind} aria-label={track.label}>
          <h3 className="flow__label">
            <span className="flow__labelIcon" aria-hidden="true">
              {track.kind === 'voice' ? <Mic size={16} /> : <Pin size={16} />}
            </span>
            {track.label}
          </h3>

          <ol className="flow__stages">
            {track.stages.map((stage, i) => (
              <li
                className={`flow__stage${i === track.stages.length - 1 ? ' flow__stage--terminal' : ''}`}
                key={stage.name}
                style={{ transitionDelay: `${140 + i * 130}ms` }}
              >
                <span className="flow__dot" aria-hidden="true" />
                <span className="flow__stageName">{stage.name}</span>
                <span className="flow__stageDetail">{stage.detail}</span>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

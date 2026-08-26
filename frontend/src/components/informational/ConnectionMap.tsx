/**
 * "Who we want to hear from" — the Contact page's centrepiece.
 *
 * Team Shifa at the centre, with the four kinds of people pages.md invites,
 * placed at deliberately uneven angles so it reads as a constellation rather
 * than an org chart. The connecting lines draw themselves when the section
 * enters view.
 *
 * Geometry notes: the SVG uses a 0-100 user space with preserveAspectRatio
 * "none" so the lines land on the same percentage coordinates as the
 * absolutely-positioned nodes at any aspect ratio, and vector-effect
 * non-scaling-stroke keeps the hairline a true hairline despite that stretch.
 *
 * Below 768px the constellation is replaced by a plain list — a spatial diagram
 * at 320px is worse than the sentence it encodes. The list is the accessible
 * representation in both cases; the diagram is aria-hidden.
 */

import { useInView } from './useInView';

interface Node {
  label: string;
  detail: string;
  /** Percentage coordinates within the diagram box. */
  x: number;
  y: number;
}

const CENTRE = { x: 50, y: 50 };

const NODES: Node[] = [
  { label: 'Feedback', detail: 'Tell us what did not work.', x: 50, y: 12 },
  { label: 'Healthcare professionals', detail: 'Help us get the guidance right.', x: 13, y: 62 },
  { label: 'Partnerships', detail: 'Press and collaboration.', x: 87, y: 38 },
  { label: 'Lived experience', detail: 'Healthcare access in rural Pakistan.', x: 62, y: 88 },
];

export function ConnectionMap() {
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.2 });

  return (
    <div className={`cmap${inView ? ' is-in' : ''}`} ref={ref}>
      <div className="cmap__diagram" aria-hidden="true">
        <svg className="cmap__lines" viewBox="0 0 100 100" preserveAspectRatio="none">
          {NODES.map((node, i) => (
            <line
              className="cmap__line"
              key={node.label}
              x1={CENTRE.x}
              y1={CENTRE.y}
              x2={node.x}
              y2={node.y}
              vectorEffect="non-scaling-stroke"
              pathLength={1}
              style={{ transitionDelay: `${200 + i * 130}ms` }}
            />
          ))}
        </svg>

        <span className="cmap__centre" style={{ left: `${CENTRE.x}%`, top: `${CENTRE.y}%` }}>
          Team Shifa
        </span>

        {NODES.map((node, i) => (
          <span
            className="cmap__node"
            key={node.label}
            style={{
              left: `${node.x}%`,
              top: `${node.y}%`,
              transitionDelay: `${300 + i * 130}ms`,
            }}
          >
            <span className="cmap__nodeLabel">{node.label}</span>
            <span className="cmap__nodeDetail">{node.detail}</span>
          </span>
        ))}
      </div>

      {/* The accessible and small-screen representation. */}
      <ul className="cmap__list">
        {NODES.map((node) => (
          <li className="cmap__listItem" key={node.label}>
            <span className="cmap__listLabel">{node.label}</span>
            <span className="cmap__listDetail">{node.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

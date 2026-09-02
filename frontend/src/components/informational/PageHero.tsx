/** Opening block for an informational page: eyebrow, display headline, standfirst. */

import type { ReactNode } from 'react';

interface Props {
  eyebrow: string;
  title: ReactNode;
  standfirst?: ReactNode;
  /** Optional composition slot to the right of the headline on wide screens. */
  aside?: ReactNode;
}

export function PageHero({ eyebrow, title, standfirst, aside }: Props) {
  return (
    <section className="doc__hero">
      <div className="doc__wrap">
        <div className={aside ? 'doc__heroGrid' : undefined}>
          <div>
            <span className="doc__eyebrow">{eyebrow}</span>
            <h1 className="doc__display">{title}</h1>
            {standfirst ? <p className="doc__standfirst">{standfirst}</p> : null}
          </div>
          {aside ? <div className="doc__heroAside">{aside}</div> : null}
        </div>
      </div>
    </section>
  );
}

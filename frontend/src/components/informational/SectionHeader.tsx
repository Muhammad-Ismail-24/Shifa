/** Numbered section heading. The numeral is decorative; the <h2> carries meaning. */

import type { ReactNode } from 'react';

interface Props {
  index?: string;
  eyebrow?: string;
  title: ReactNode;
  body?: ReactNode;
  id?: string;
}

export function SectionHeader({ index, eyebrow, title, body, id }: Props) {
  return (
    <div className="doc__sectionHead">
      {index || eyebrow ? (
        <span className="doc__eyebrow doc__eyebrow--plain">
          {index ? <span className="doc__index">{index}</span> : null}
          {eyebrow ? <span>{eyebrow}</span> : null}
        </span>
      ) : null}
      <h2 className="doc__h2" id={id}>
        {title}
      </h2>
      {body ? <p className="doc__p">{body}</p> : null}
    </div>
  );
}

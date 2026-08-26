/** Closing band returning the reader to the product. */

import { Link } from 'react-router-dom';

import { ArrowRight } from './icons';

interface Props {
  title: string;
  body: string;
  action?: { label: string; to: string };
}

export function ShifaCTA({ title, body, action }: Props) {
  const { label, to } = action ?? { label: 'Talk to Shifa', to: '/' };

  return (
    <section className="doc__closing">
      <div className="doc__wrap">
        <div className="doc__closingInner">
          <div>
            <h2 className="doc__h2">{title}</h2>
            <p className="doc__p" style={{ marginTop: '1rem', maxWidth: '44ch' }}>
              {body}
            </p>
          </div>
          <Link className="doc__cta" to={to}>
            <span>{label}</span>
            <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </section>
  );
}

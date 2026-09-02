/**
 * Medical / safety callout.
 *
 * Weight comes from the heavy left rule and the ink, never from alarm colour —
 * a health product should read as serious, not as an error state.
 */

import type { ReactNode } from 'react';

import { Alert } from './icons';

interface Props {
  label: string;
  children: ReactNode;
  critical?: boolean;
  id?: string;
}

export function SafetyNotice({ label, children, critical = false, id }: Props) {
  return (
    <aside
      className={`doc__notice${critical ? ' doc__notice--critical' : ''}`}
      id={id}
      /* Announced as a landmark so screen-reader users meet the disclaimer as a
         distinct region rather than as loose paragraphs. */
      aria-label={label}
    >
      <p className="doc__noticeLabel">
        <Alert size={15} />
        <span>{label}</span>
      </p>
      <div className="doc__noticeBody">{children}</div>
    </aside>
  );
}

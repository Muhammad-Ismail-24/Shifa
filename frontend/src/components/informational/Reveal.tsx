/** Wraps children in the shared fade-and-rise reveal. Purely presentational. */

import type { ElementType, ReactNode } from 'react';

import { useInView } from './useInView';

interface Props {
  children: ReactNode;
  as?: ElementType;
  className?: string;
  /** Stagger within a group, in ms. Kept small — this is entrance, not theatre. */
  delay?: number;
}

export function Reveal({ children, as: Tag = 'div', className = '', delay = 0 }: Props) {
  const { ref, inView } = useInView<HTMLDivElement>();

  return (
    <Tag
      ref={ref}
      className={`doc__reveal${inView ? ' is-in' : ''}${className ? ` ${className}` : ''}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}

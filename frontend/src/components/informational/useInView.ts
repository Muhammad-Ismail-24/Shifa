/**
 * Reveal-on-scroll primitive shared by every informational page.
 *
 * One IntersectionObserver per element, disconnected as soon as the element has
 * been seen — these are entrance animations, not scroll-linked effects, so
 * nothing stays subscribed after the reveal.
 *
 * Under prefers-reduced-motion the hook reports "in view" immediately and never
 * observes anything, so content is present from first paint.
 */

import { useEffect, useRef, useState } from 'react';

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function useInView<T extends HTMLElement>(
  options: { threshold?: number; once?: boolean } = {},
) {
  const { threshold = 0.25, once = true } = options;
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            window.clearTimeout(safety);
            setInView(true);
            if (once) observer.disconnect();
          } else if (!once) {
            setInView(false);
          }
        }
      },
      { threshold, rootMargin: '0px 0px -10% 0px' },
    );

    /**
     * Safety net. Content must never be permanently invisible because an
     * observer did not fire — this page set includes privacy and safety copy,
     * and a stuck animation hiding it is worse than no animation at all.
     */
    const safety = window.setTimeout(() => setInView(true), 3000);

    observer.observe(el);
    return () => {
      window.clearTimeout(safety);
      observer.disconnect();
    };
  }, [threshold, once]);

  return { ref, inView };
}

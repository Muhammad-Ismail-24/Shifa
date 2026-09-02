/**
 * Contents navigation for the Terms page.
 *
 * Desktop: a sticky sidebar. Mobile: the same list collapses into a compact
 * horizontally-scrolling chip bar pinned under the navbar — the sticky sidebar
 * pattern is not carried onto small screens, where it would eat the viewport.
 *
 * The active item is derived from scroll position. It is a real <nav> of real
 * anchors, so it works with JavaScript disabled and with the keyboard; the
 * highlight is an enhancement on top.
 */

import { useEffect, useState } from 'react';

export interface TermsSection {
  id: string;
  label: string;
}

export function TermsContents({ sections }: { sections: TermsSection[] }) {
  const [active, setActive] = useState(sections[0]?.id ?? '');

  useEffect(() => {
    const headings = sections
      .map((section) => document.getElementById(section.id))
      .filter((el): el is HTMLElement => el !== null);

    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Prefer the entry nearest the top of the reading band.
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-12% 0px -70% 0px', threshold: 0 },
    );

    for (const heading of headings) observer.observe(heading);
    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav className="toc" aria-label="Contents">
      <span className="toc__label">Contents</span>
      <ol className="toc__list">
        {sections.map((section, i) => (
          <li key={section.id}>
            <a
              className={`toc__link${active === section.id ? ' is-active' : ''}`}
              href={`#${section.id}`}
              aria-current={active === section.id ? 'true' : undefined}
            >
              <span className="toc__num">{String(i + 1).padStart(2, '0')}</span>
              <span className="toc__text">{section.label}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

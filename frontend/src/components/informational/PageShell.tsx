/**
 * Shared shell for the five informational pages.
 *
 * Reuses the landing's real navigation (ShifaNav + MenuDrawer) rather than
 * reimplementing a second header, so the menu, its routes and its focus
 * management behave identically everywhere.
 *
 * Two things it owns that the landing does not need:
 *
 *   Scroll release — landing.css locks html/body/#root to overflow:hidden for
 *   the fixed 100dvh hero. A document has to scroll, so .doc-scroll is added to
 *   <html> while a page is mounted and removed on unmount.
 *
 *   Route-change scroll reset — BrowserRouter does not reset scroll position,
 *   so navigating Privacy -> Terms would otherwise land mid-document.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { MenuDrawer } from '../landing/MenuDrawer';
import { ShifaNav } from '../landing/ShifaNav';
import { ArrowRight } from './icons';

const FOOTER_LINKS = [
  { label: 'About', to: '/about' },
  { label: 'How it works', to: '/how-it-works' },
  { label: 'Privacy', to: '/privacy' },
  { label: 'Terms', to: '/terms' },
  { label: 'Contact', to: '/contact' },
];

interface Props {
  children: ReactNode;
  /** Document title suffix, e.g. "About Shifa". */
  title: string;
}

export function PageShell({ children, title }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();

  // Release the landing's scroll lock for as long as a document is mounted.
  useEffect(() => {
    document.documentElement.classList.add('doc-scroll');
    return () => document.documentElement.classList.remove('doc-scroll');
  }, []);

  useEffect(() => {
    document.title = `${title} — Shifa`;
  }, [title]);

  // Fresh route, fresh scroll position — unless the URL carries an anchor,
  // which the Terms contents nav relies on.
  useEffect(() => {
    if (window.location.hash) return;
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <>
      <div className="doc__rules" aria-hidden="true">
        <span className="doc__rule doc__rule--left" />
        <span className="doc__rule doc__rule--right" />
      </div>

      <div className="doc">
        <a className="doc__skip" href="#doc-main">
          Skip to content
        </a>

        <header>
          <ShifaNav menuOpen={menuOpen} onOpenMenu={() => setMenuOpen(true)} />
        </header>

        <main className="doc__main" id="doc-main">
          {children}
        </main>

        <footer className="doc__footer">
          <div className="doc__wrap">
            <div className="doc__footerInner">
              <div>
                <Link className="doc__arrowLink" to="/">
                  <ArrowRight size={16} />
                  <span>Talk to Shifa</span>
                </Link>
                <p className="doc__footerNote" style={{ marginTop: '1rem' }}>
                  Shifa is a hackathon project currently in development and not yet a
                  registered commercial product. It offers preliminary health information
                  and never replaces care from a qualified doctor.
                </p>
              </div>

              <nav className="doc__footerNav" aria-label="Footer">
                {FOOTER_LINKS.map((link) => (
                  <Link
                    className="doc__footerLink"
                    key={link.to}
                    to={link.to}
                    aria-current={pathname === link.to ? 'page' : undefined}
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
            </div>
          </div>
        </footer>
      </div>

      <MenuDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}

/**
 * Slide-in menu. Structure and motion are the reference's; the destinations are
 * Shifa's. These are real in-app routes rather than href="#" placeholders — see
 * App.tsx, where each renders a small honest placeholder page.
 */

import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

// Home is first and always present: every other page in this drawer is a
// document, and a patient who wandered into one needs one obvious way back to
// the thing that answers questions.
const LINKS = [
  { label: 'Home', to: '/' },
  { label: 'Visual Pill Scanner', to: '/scanner', isProminent: true },
  { label: 'About Shifa', to: '/about' },
  { label: 'How it works', to: '/how-it-works' },
  { label: 'Privacy', to: '/privacy' },
  { label: 'Terms', to: '/terms' },
  { label: 'Contact', to: '/contact' },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function MenuDrawer({ open, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  /** Element that had focus before the drawer opened, to restore on close. */
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = menuRef.current;

    if (!open) {
      // Order matters. Move focus out FIRST, then mark the subtree inert:
      // marking a subtree that still holds focus is what makes Chrome log
      // "Blocked aria-hidden on an element because its descendant retained
      // focus" and leaves the focused control hidden from assistive tech.
      const target = returnFocusRef.current;
      returnFocusRef.current = null;
      target?.focus({ preventScroll: true });
      if (el) el.inert = true;
      return;
    }

    if (el) el.inert = false;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <div className={`menu${open ? ' is-open' : ''}`} id="menu" ref={menuRef}>
      <button className="menu__backdrop" id="menu-backdrop" type="button" tabIndex={-1} aria-label="Close menu" onClick={onClose} />

      <div className="menu__panel">
        <button className="menu__close" id="menu-close" type="button" ref={closeRef} onClick={onClose}>
          <svg
            className="icon"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
          <span>Close</span>
        </button>

        <nav className="menu__nav h-full overflow-y-auto flex flex-col">
          {LINKS.map((link) => (
            <Link
              className={`menu__link ${link.isProminent ? 'font-bold text-green-600 bg-green-50 border border-green-200 rounded-lg p-2 mb-2' : ''}`}
              key={link.to}
              to={link.to}
              onClick={onClose}
              tabIndex={open ? 0 : -1}
            >
              <span className="menu__linkText">{link.label}</span>
              <svg
                className="menu__arrow icon"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </Link>
          ))}
        </nav>

        <div className="mt-auto pt-6">
          <p className="text-xs text-black/40">© 2026 Shifa</p>
        </div>
      </div>
    </div>
  );
}

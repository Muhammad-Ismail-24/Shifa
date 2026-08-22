/**
 * Placeholder for the menu destinations.
 *
 * Deliberately says the page is not written yet rather than inventing About /
 * Privacy / Terms copy — for a health product, fabricated privacy or terms text
 * is worse than an obvious gap.
 */

import { Link } from 'react-router-dom';

export default function InfoPage({ title }: { title: string }) {
  return (
    <main
      className="hero"
      style={{ pointerEvents: 'auto', padding: '3rem', gap: '1rem', justifyContent: 'center' }}
    >
      <h1 className="lede__title">{title}</h1>
      <p className="lede__body">This page hasn’t been written yet.</p>
      <Link className="menu__mail" to="/">
        ← Back to Shifa
      </Link>
    </main>
  );
}

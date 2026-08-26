/**
 * 404. Uses the same document shell as the informational pages so a mistyped
 * URL still lands somewhere that looks like Shifa.
 *
 * This replaces the old InfoPage placeholder, which stood in for all five
 * informational routes and told the reader the page had not been written.
 */

import { Link } from 'react-router-dom';

import { PageShell } from '../components/informational/PageShell';
import { ArrowRight } from '../components/informational/icons';

const DESTINATIONS = [
  { label: 'About Shifa', to: '/about' },
  { label: 'How it works', to: '/how-it-works' },
  { label: 'Privacy', to: '/privacy' },
  { label: 'Terms', to: '/terms' },
  { label: 'Contact', to: '/contact' },
];

export default function NotFound() {
  return (
    <PageShell title="Page not found">
      <section className="doc__hero">
        <div className="doc__wrap">
          <span className="doc__eyebrow">Page not found</span>
          <h1 className="doc__display">
            That page
            <br />
            <em>isn’t here.</em>
          </h1>
          <p className="doc__standfirst">
            The link may be out of date, or the address may have a typo. Everything Shifa has
            is below.
          </p>
        </div>
      </section>

      <section className="doc__section">
        <div className="doc__wrap">
          <nav aria-label="All pages">
            <ul className="notfound__list">
              {DESTINATIONS.map((destination) => (
                <li className="notfound__item" key={destination.to}>
                  <Link className="doc__arrowLink" to={destination.to}>
                    <span>{destination.label}</span>
                    <ArrowRight size={16} />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </section>
    </PageShell>
  );
}

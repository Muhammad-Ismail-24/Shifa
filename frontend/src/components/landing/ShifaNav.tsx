import { Link } from 'react-router-dom';
import { ReactNode } from 'react';

interface Props {
  menuOpen: boolean;
  onOpenMenu: () => void;
  children?: ReactNode;
}

export function ShifaNav({ menuOpen, onOpenMenu, children }: Props) {
  return (
    <nav className="nav">
      <div className="flex items-center gap-6">
        <button
          className="nav__item"
          id="menu-open"
          type="button"
          aria-expanded={menuOpen}
          aria-controls="menu"
          onClick={onOpenMenu}
        >
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
            <line x1="4" x2="20" y1="6" y2="6" />
            <line x1="4" x2="20" y1="12" y2="12" />
            <line x1="4" x2="20" y1="18" y2="18" />
          </svg>
          <span className="nav__label nav__label--menu">Menu</span>
        </button>

        <Link className="nav__item" to="/how-it-works">
          <span className="nav__dot" aria-hidden="true" />
          <span className="nav__label">How it works</span>
        </Link>
      </div>
      
      {children && (
        <div className="flex items-center">
          {children}
        </div>
      )}
    </nav>
  );
}

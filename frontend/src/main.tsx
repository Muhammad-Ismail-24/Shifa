import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App';
// Tailwind first, then the landing stylesheet: the landing page is a faithful
// port of the reference CSS and must win over Tailwind's preflight reset.
import './index.css';
import './styles/landing.css';
// Informational pages. Loaded last so .doc-scroll can override the landing's
// overflow lock, and namespaced under .doc so nothing here reaches the landing.
import './styles/pages.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* Opt into the v7 behaviours now: it silences the upgrade warnings that
        would otherwise fill the console on every load, and keeps the eventual
        React Router 7 bump a no-op. */}
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);

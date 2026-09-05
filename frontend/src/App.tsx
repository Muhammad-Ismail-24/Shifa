// React Router — all route definitions.

import { useEffect, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';

import { supabase } from './lib/supabaseClient';

import About from './pages/About';
import Contact from './pages/Contact';
import HowItWorks from './pages/HowItWorks';
import Home from './pages/Home';
import NotFound from './pages/NotFound';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import PillScanner from './components/PillScanner';

export default function App() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    // Restore the session on mount so a refresh does not flash the sign-in
    // button while the cookie is still valid.
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    // Listen for sign-in, sign-out, and token-refresh events.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return (
    <Routes>
      {/* The whole application lives on "/": conversation and findings side by
          side. There is no separate results route — a spoken conversation must
          not be interrupted by a page change to read the answer. */}
      <Route path="/" element={<Home user={user} />} />
      <Route path="/scanner" element={<PillScanner />} />

      {/* The five informational pages. These are the destinations in the menu
          drawer and the document footer. */}
      <Route path="/about" element={<About />} />
      <Route path="/how-it-works" element={<HowItWorks />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/contact" element={<Contact />} />

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

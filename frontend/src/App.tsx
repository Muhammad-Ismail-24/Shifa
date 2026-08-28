// React Router — all route definitions.

import { Routes, Route } from 'react-router-dom';

import Landing from './pages/Landing';
import Results from './pages/Results';
import InfoPage from './pages/InfoPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/results" element={<Results />} />
      {/* Real routes rather than href="#" placeholders. Each renders an honest
          "not written yet" page instead of pretending to have content. */}
      <Route path="/about" element={<InfoPage title="About Shifa" />} />
      <Route path="/how-it-works" element={<InfoPage title="How it works" />} />
      <Route path="/privacy" element={<InfoPage title="Privacy" />} />
      <Route path="/terms" element={<InfoPage title="Terms" />} />
      <Route path="/contact" element={<InfoPage title="Contact" />} />

      <Route path="*" element={<InfoPage title="Page not found" />} />
    </Routes>
  );
}

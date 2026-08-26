/**
 * An illustration of what changes when location permission is off or on.
 *
 * IMPORTANT: this is a diagram, not a control. It deliberately does not call
 * the Geolocation API, does not read permission state, and cannot change any
 * device setting — a privacy page that silently triggered a permission prompt
 * would be doing the exact thing it is reassuring people about. The copy says
 * so plainly, and real permissions are managed in device settings.
 */

import { useState } from 'react';

import { Check, Pin, Slash } from './icons';

export function LocationControl() {
  const [on, setOn] = useState(false);

  return (
    <div className="locctl">
      <div className="locctl__head">
        <span className="doc__eyebrow doc__eyebrow--plain">
          <Pin size={14} />
          <span>Illustration</span>
        </span>
        <p className="locctl__caption">
          A diagram of how Shifa behaves — not a real setting. Nothing here changes your
          device permissions.
        </p>
      </div>

      <div className="locctl__switchRow">
        <span className={`locctl__state${on ? '' : ' is-current'}`}>Location off</span>

        <button
          className={`locctl__switch${on ? ' is-on' : ''}`}
          type="button"
          role="switch"
          aria-checked={on}
          onClick={() => setOn((v) => !v)}
        >
          <span className="sr-only">
            Show what Shifa does when location access is {on ? 'off' : 'on'}
          </span>
          <span className="locctl__knob" aria-hidden="true" />
        </button>

        <span className={`locctl__state${on ? ' is-current' : ''}`}>Location on</span>
      </div>

      {/* aria-live so keyboard and screen-reader users hear the outcome change. */}
      <ul className="locctl__outcomes" aria-live="polite">
        <li className="locctl__outcome">
          <span className="locctl__outcomeIcon" aria-hidden="true">
            <Check size={14} />
          </span>
          <span>Speak your symptoms and receive guidance in Urdu</span>
        </li>
        <li className={`locctl__outcome${on ? '' : ' is-off'}`}>
          <span className="locctl__outcomeIcon" aria-hidden="true">
            {on ? <Check size={14} /> : <Slash size={14} />}
          </span>
          <span>
            {on
              ? 'Nearby hospitals and clinics are shown'
              : 'Nearby hospitals are unavailable — everything else still works'}
          </span>
        </li>
      </ul>
    </div>
  );
}

// Full-screen red alert for emergencies

import { useEffect } from 'react';

import { UrduText } from './UrduText';
import { cancelSpeech, speakUrdu } from '../lib/speech';

interface Props {
  /** The Urdu instruction Shifa speaks and shows. */
  messageUrdu: string;
  onDismiss: () => void;
}

/**
 * Deliberately the only thing on screen. An emergency turn must not sit next to
 * a medicine list the patient might read first — the single instruction is to
 * get to a hospital, and Rescue 1122 is one tap away.
 *
 * Speaks on mount rather than relying on the caller: this overlay is the
 * emergency path's whole UI and the spoken line is the part that reaches a
 * patient who cannot read.
 */
export default function EmergencyAlert({ messageUrdu, onDismiss }: Props) {
  useEffect(() => {
    speakUrdu(messageUrdu);
    return () => cancelSpeech();
  }, [messageUrdu]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="Emergency"
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-8 bg-red-700 px-6 text-center text-white"
    >
      <svg
        width="72"
        height="72"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
      </svg>

      <UrduText className="max-w-xl text-3xl sm:text-4xl">{messageUrdu}</UrduText>

      <p className="max-w-md text-sm text-white/80">
        Go to the nearest hospital immediately. This is not a diagnosis — it is a warning.
      </p>

      <div className="flex flex-col items-center gap-3 sm:flex-row">
        <a
          href="tel:1122"
          className="rounded-full bg-white px-8 py-3 text-base font-medium text-red-700 transition hover:bg-white/90"
        >
          Call Rescue 1122
        </a>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-full border border-white/50 px-8 py-3 text-base text-white transition hover:bg-white/10"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

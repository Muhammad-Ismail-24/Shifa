/**
 * One requestAnimationFrame loop for the whole page.
 *
 * The reference already ran a permanent RAF for the glass-card sync; adding a
 * second for the waveform would double the scheduling overhead and let the two
 * drift out of phase. Subscribers share a single tick and the loop stops
 * entirely when the last one leaves.
 */

type Tick = (timeMs: number) => void;

const subscribers = new Set<Tick>();
let handle = 0;

function frame(time: number): void {
  for (const tick of subscribers) {
    try {
      tick(time);
    } catch {
      // A throwing subscriber must not kill the frame loop for everyone else.
    }
  }
  handle = requestAnimationFrame(frame);
}

export function subscribeFrame(tick: Tick): () => void {
  subscribers.add(tick);
  if (handle === 0) handle = requestAnimationFrame(frame);

  return () => {
    subscribers.delete(tick);
    if (subscribers.size === 0 && handle !== 0) {
      cancelAnimationFrame(handle);
      handle = 0;
    }
  };
}

/** Test-only escape hatch. */
export function _activeSubscriberCount(): number {
  return subscribers.size;
}

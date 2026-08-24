// GPS helper, distance formatter, small shared utilities.

export interface Coordinates {
  latitude: number;
  longitude: number;
}

/** Islamabad — used only when the patient declines or the browser has no GPS. */
export const FALLBACK_COORDINATES: Coordinates = {
  latitude: 33.6844,
  longitude: 73.0479,
};

export function getCurrentPosition(timeoutMs = 8000): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation unavailable'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 300000 },
    );
  });
}

/**
 * Location is a convenience for hospital search, never a blocker — a patient
 * who declines the prompt still gets triage and medicine guidance.
 */
export async function getPositionOrFallback(): Promise<Coordinates> {
  try {
    return await getCurrentPosition();
  } catch {
    return FALLBACK_COORDINATES;
  }
}

export function formatDistanceKm(km: number): string {
  if (!Number.isFinite(km)) return '';
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

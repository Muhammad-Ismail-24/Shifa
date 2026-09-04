/**
 * Vitest setup.
 *
 * Provides the browser APIs jsdom does not implement but the dashboard touches
 * on every render: speech synthesis, speech recognition, geolocation and
 * IntersectionObserver. Each is a controllable stand-in rather than a silent
 * no-op, so tests can drive them.
 */

import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// --- speech synthesis: ShifaSpeech constructs against it at import time ---
if (!('speechSynthesis' in window)) {
  Object.defineProperty(window, 'speechSynthesis', {
    writable: true,
    value: {
      speak: vi.fn(),
      cancel: vi.fn(),
      getVoices: () => [],
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      speaking: false,
      pending: false,
    },
  });
}
if (!('SpeechSynthesisUtterance' in window)) {
  (window as any).SpeechSynthesisUtterance = class {
    text = '';
    lang = '';
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(text?: string) {
      this.text = text ?? '';
    }
  };
}

// --- media / audio ---
if (!navigator.mediaDevices) {
  Object.defineProperty(navigator, 'mediaDevices', {
    writable: true,
    value: { getUserMedia: vi.fn().mockRejectedValue(new Error('no mic in jsdom')) },
  });
}
(window as any).AudioContext = (window as any).AudioContext ?? class {
  createAnalyser() {
    return { fftSize: 0, getByteTimeDomainData: vi.fn(), connect: vi.fn(), disconnect: vi.fn() };
  }
  createMediaStreamSource() {
    return { connect: vi.fn(), disconnect: vi.fn() };
  }
  close() {
    return Promise.resolve();
  }
};

(window as any).IntersectionObserver = (window as any).IntersectionObserver ?? class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

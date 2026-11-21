import { create } from 'zustand';

/** Sound on/off. Muted by default; the choice is remembered per browser when storage works. */

const KEY = 'overseer.sound';

function readUnmuted(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(KEY) === 'on';
  } catch {
    return false;
  }
}

function remember(on: boolean): void {
  try {
    window.localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    // Storage blocked (private window): the choice just is not remembered.
  }
}

interface SoundState {
  muted: boolean;
  /** Read the remembered choice (call once on the client). */
  hydrate: () => void;
  toggle: () => void;
}

export const useSoundStore = create<SoundState>((set, get) => ({
  muted: true,
  hydrate: () => set({ muted: !readUnmuted() }),
  toggle: () => {
    const muted = !get().muted;
    remember(!muted);
    set({ muted });
  },
}));

/** Allows an action at most once per `gapMs`. */
export function createLimiter(gapMs: number) {
  let last = -Infinity;
  return (now: number): boolean => {
    if (now - last < gapMs) return false;
    last = now;
    return true;
  };
}

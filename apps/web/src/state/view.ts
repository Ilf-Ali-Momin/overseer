import { create } from 'zustand';

/** 0 = low end (effects off), 1 = default, 2 = high (full effects). */
export type PerfLevel = 0 | 1 | 2;

interface ViewState {
  orbit: boolean;
  perfLevel: PerfLevel;
  toggleOrbit: () => void;
  setPerfLevel: (level: PerfLevel) => void;
}

export const useViewStore = create<ViewState>((set) => ({
  orbit: false,
  perfLevel: 2,
  toggleOrbit: () => set((s) => ({ orbit: !s.orbit })),
  setPerfLevel: (perfLevel) => set({ perfLevel }),
}));

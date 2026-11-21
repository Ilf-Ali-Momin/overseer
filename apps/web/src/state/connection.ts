import { create } from 'zustand';
import type { ConnectionStatus } from './eventSource';

/** Bridge connection status for the HUD. `off` means the page runs without the bridge (`?demo`). */
export type BridgeStatus = ConnectionStatus | 'off';

interface ConnectionState {
  status: BridgeStatus;
  setStatus: (status: BridgeStatus) => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  status: 'off',
  setStatus: (status) => set({ status }),
}));

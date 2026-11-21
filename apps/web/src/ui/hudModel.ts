import { resolveState } from '@overseer/shared';
import type { BridgeStatus } from '@/state/connection';
import type { Mode } from '@/state/mode';
import type { OfficeAgent } from '@/state/agents';

export interface StatusView {
  label: string;
  color: string;
  hint?: string;
}

export const STATUS_VIEW: Record<BridgeStatus, StatusView> = {
  open: { label: 'Live', color: '#4ade80' },
  connecting: { label: 'Connecting', color: '#fbbf24' },
  closed: { label: 'Bridge offline', color: '#f87171', hint: 'run pnpm dev:bridge' },
  off: { label: 'Demo', color: '#8b93a7' },
};

/** Agents still in the office and not on their way out at `now`. */
export function activeCount(agents: Readonly<Record<string, OfficeAgent>>, now: number): number {
  let n = 0;
  for (const a of Object.values(agents)) if (resolveState(a.machine, now) !== 'leaving') n++;
  return n;
}

/** What the HUD shows: in demo mode the recording, otherwise the bridge status. */
export function hudView(mode: Mode, status: BridgeStatus): StatusView {
  if (mode === 'demo') {
    return {
      label: 'Demo',
      color: '#8b93a7',
      hint: status === 'open' ? 'recording, bridge available' : 'recording, no bridge',
    };
  }
  // `off` = no bridge connection at all (fake agents page): show Demo, not Connecting.
  if (mode === 'waiting') return status === 'off' ? STATUS_VIEW.off : STATUS_VIEW.connecting;
  return STATUS_VIEW[status];
}

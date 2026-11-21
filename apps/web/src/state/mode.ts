import { create } from 'zustand';
import { useAgentsStore } from './agents';
import { type BridgeStatus, useConnectionStore } from './connection';
import { fetchDemo, startDemo, useDemoStore } from './demo';
import { connectBridge } from './liveBridge';

/**
 * Live or demo. In `auto` the app shows the live office when the bridge is reachable and falls back
 * to a recorded demo when it is not (e.g. when deployed), switching back as soon as the bridge opens.
 */

export type ModeChoice = 'auto' | 'live' | 'demo';
export type Mode = 'waiting' | 'live' | 'demo';

/** How long the bridge may be unreachable before auto mode falls back to the demo. */
export const GRACE_MS = 2500;
/** Recorded demos in `apps/web/public/demo/`, played in this order (auto mode cycles through them). */
export const DEMOS = ['team', 'risk', 'sample'] as const;
export const DEFAULT_DEMO = DEMOS[0];

/** The demo after `name` in DEMOS (wraps around; unknown names restart the list). */
export function nextDemo(name: string): string {
  const i = (DEMOS as readonly string[]).indexOf(name);
  return DEMOS[(i + 1) % DEMOS.length]!;
}

/** Pages served from this machine; anything else (e.g. a deployed demo) starts in demo mode. */
export function isLocalHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname.endsWith('.localhost')
  );
}

export interface ModeInput {
  choice: ModeChoice;
  status: BridgeStatus;
  current: Mode;
  /** ms since the bridge was last open (or since start). */
  notOpenFor: number;
}

export function decideMode({ choice, status, current, notOpenFor }: ModeInput): Mode {
  if (choice === 'live') return 'live';
  if (choice === 'demo') return 'demo';
  if (status === 'open') return 'live';
  if (notOpenFor < GRACE_MS) return current; // short drop or still connecting
  return 'demo';
}

interface ModeState {
  choice: ModeChoice;
  mode: Mode;
  demoName: string;
  setChoice: (choice: ModeChoice) => void;
  setDemo: (name: string) => void;
}

export const useModeStore = create<ModeState>((set) => ({
  choice: 'auto',
  mode: 'waiting',
  demoName: DEFAULT_DEMO,
  setChoice: (choice) => set({ choice }),
  setDemo: (demoName) => set({ demoName }),
}));

function clearOffice(): void {
  useAgentsStore.setState({ agents: {}, selectedId: null, hoveredId: null });
}

/** Run the live/demo switching. Returns a cleanup function. */
export function startModeController(
  opts: { choice?: ModeChoice; demoName?: string } = {},
): () => void {
  useModeStore.setState({
    choice: opts.choice ?? 'auto',
    mode: 'waiting',
    demoName: opts.demoName ?? DEFAULT_DEMO,
  });
  let liveOn = false;
  // The bridge connection opens only once live data may be wanted, so a page that starts in demo
  // mode (e.g. the deployed site) never probes 127.0.0.1 unless the viewer clicks "Go live".
  let stopLive: (() => void) | null = null;
  let stopDemo: (() => void) | null = null;
  let demoToken = 0;
  let notOpenSince = Date.now();

  const enter = (mode: Mode) => {
    const prev = useModeStore.getState().mode;
    if (mode === prev) return;
    useModeStore.setState({ mode });
    if (mode === 'live') {
      demoToken++;
      stopDemo?.();
      stopDemo = null;
      clearOffice();
      liveOn = true;
      // Reconnect so the bridge sends a fresh snapshot of the live office.
      stopLive?.();
      stopLive = connectBridge(undefined, undefined, () => liveOn);
    } else if (mode === 'demo') {
      liveOn = false;
      playDemo();
    }
  };

  /** (Re)start the selected demo; when it ends, move on to the next one. */
  const playDemo = () => {
    stopDemo?.();
    stopDemo = null;
    clearOffice();
    const token = ++demoToken;
    const name = useModeStore.getState().demoName;
    fetchDemo(name)
      .then((demo) => {
        if (token !== demoToken) return;
        stopDemo = startDemo(demo, Date.now, () => {
          if (token === demoToken) useModeStore.getState().setDemo(nextDemo(name));
        });
      })
      .catch((err: unknown) => useDemoStore.setState({ error: String(err) }));
  };

  const check = () => {
    const status = useConnectionStore.getState().status;
    const now = Date.now();
    if (status === 'open') notOpenSince = now;
    const { choice, mode } = useModeStore.getState();
    if (choice !== 'demo' && !stopLive) {
      stopLive = connectBridge(undefined, undefined, () => liveOn);
      notOpenSince = now;
    }
    enter(decideMode({ choice, status, current: mode, notOpenFor: now - notOpenSince }));
  };
  const timer = setInterval(check, 250);
  const unsub = useModeStore.subscribe((s, prev) => {
    if (s.choice !== prev.choice) check();
    if (s.demoName !== prev.demoName && s.mode === 'demo') playDemo();
  });
  check();

  return () => {
    clearInterval(timer);
    unsub();
    demoToken++;
    stopDemo?.();
    stopLive?.();
  };
}

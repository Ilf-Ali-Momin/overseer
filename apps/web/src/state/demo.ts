import { type DemoFile, DemoFileSchema } from '@overseer/shared';
import { create } from 'zustand';
import { useAgentsStore } from './agents';
import { type Replay, type ReplaySpeed, createReplay } from './replay';

/** Demo mode: one loaded recording played through the replay engine into the agents store. */

interface DemoState {
  replay: Replay | null;
  name: string | null;
  title: string | null;
  playing: boolean;
  speed: ReplaySpeed;
  /** Demo ms, refreshed ~10 times per second for the UI. */
  position: number;
  duration: number;
  error: string | null;
}

export const useDemoStore = create<DemoState>(() => ({
  replay: null,
  name: null,
  title: null,
  playing: false,
  speed: 1,
  position: 0,
  duration: 0,
  error: null,
}));

/** Only plain names: they become a URL path under /demo/. */
export const DEMO_NAME = /^[A-Za-z0-9_-]{1,64}$/;

function clearOffice(): void {
  useAgentsStore.setState({ agents: {}, selectedId: null, hoveredId: null });
}

function syncUi(): void {
  const r = useDemoStore.getState().replay;
  if (!r) return;
  useDemoStore.setState({ playing: r.playing(), speed: r.speed(), position: r.position() });
}

/** Load a demo and start playing it. Returns a stop function. */
export function startDemo(
  demo: DemoFile,
  now: () => number = Date.now,
  onEnd?: () => void,
): () => void {
  clearOffice();
  const replay = createReplay(
    demo,
    {
      now,
      apply: (evs) => useAgentsStore.getState().applyMany(evs),
      reset: clearOffice,
    },
    onEnd ? { onEnd } : {},
  );
  useDemoStore.setState({
    replay,
    name: demo.name,
    title: demo.title ?? null,
    duration: replay.duration,
    error: null,
  });
  replay.play();
  replay.tick();
  syncUi();

  let raf = 0;
  let lastUi = 0;
  const loop = () => {
    replay.tick();
    const t = now();
    if (t - lastUi > 100) {
      lastUi = t;
      syncUi();
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return () => {
    cancelAnimationFrame(raf);
    useDemoStore.setState({ replay: null, name: null, title: null, playing: false, position: 0 });
    clearOffice();
  };
}

/** Fetch `/demo/<name>.json` and validate it. */
export async function fetchDemo(name: string): Promise<DemoFile> {
  if (!DEMO_NAME.test(name)) throw new Error(`bad demo name: ${name}`);
  const res = await fetch(`/demo/${name}.json`);
  if (!res.ok) throw new Error(`demo ${name} not found (${res.status})`);
  const parsed = DemoFileSchema.safeParse(await res.json());
  if (!parsed.success) throw new Error(`demo ${name} is not a valid demo file`);
  return parsed.data;
}

/** Controls for the Timeline UI. */
export const demoControls = {
  toggle(): void {
    const r = useDemoStore.getState().replay;
    if (!r) return;
    if (r.playing()) r.pause();
    else r.play();
    syncUi();
  },
  setSpeed(s: ReplaySpeed): void {
    useDemoStore.getState().replay?.setSpeed(s);
    syncUi();
  },
  seek(ms: number): void {
    useDemoStore.getState().replay?.seek(ms);
    syncUi();
  },
};

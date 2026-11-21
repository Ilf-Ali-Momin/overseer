'use client';

import { VISUAL_STATES, type VisualState } from '@overseer/shared';
import { Leva, button, useControls } from 'leva';
import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAgentsStore } from '@/state/agents';
import {
  dismissFakes,
  fakeIds,
  finishSubagent,
  forceState,
  randomizeFakes,
  spawnFakes,
  spawnSubagent,
} from '@/state/fakeAgents';

declare global {
  interface Window {
    /** Dev hook for scripted checks (scripts/shot.mjs): drive fake agents from the console. */
    __overseerFake?: {
      spawn: typeof spawnFakes;
      force: typeof forceState;
      spawnSub: typeof spawnSubagent;
      finishSub: typeof finishSubagent;
      ids: typeof fakeIds;
      randomize: typeof randomizeFakes;
      dismiss: typeof dismissFakes;
    };
  }
}

const IS_DEV = process.env.NODE_ENV !== 'production';
const SPAWN_GAP_MS = 1200;
const RANDOMIZE_EVERY_MS = 3500;
const ALL = 'all fake agents';

/** Spawn agents one by one so they do not walk in as a single blob. */
function spawnStaggered(n: number): () => void {
  const timers = Array.from({ length: n }, (_, i) =>
    setTimeout(() => spawnFakes(1), i * SPAWN_GAP_MS),
  );
  return () => timers.forEach(clearTimeout);
}

/** Dev helper: `?agents=N` spawns N fake agents on load. */
function useUrlSpawn() {
  useEffect(() => {
    const n = Number(new URLSearchParams(window.location.search).get('agents') ?? 0);
    if (!Number.isFinite(n) || n <= 0) return;
    return spawnStaggered(Math.min(12, n));
  }, []);
}

function Controls() {
  const ids = useAgentsStore(
    useShallow((s) =>
      Object.values(s.agents)
        .filter((a) => a.fake)
        .map((a) => a.id),
    ),
  );

  useControls('Spawn', {
    'Spawn 1': button(() => spawnFakes(1)),
    'Spawn 12': button(() => spawnStaggered(12)),
    'Everyone leaves': button(() => dismissFakes()),
    // Subagents: a random top-level fake agent delegates; finishing sends every subagent home.
    'Spawn subagent': button(() => {
      const parents = fakeIds().filter((id) => !id.includes(':'));
      const parent = parents[Math.floor(Math.random() * parents.length)];
      if (parent) spawnSubagent(parent);
    }),
    'Finish subagents': button(() => {
      for (const id of fakeIds()) if (id.includes(':')) finishSubagent(id);
    }),
  });

  const [{ agent, state }, set] = useControls(
    'Force state',
    () => ({
      agent: { options: [ALL, ...ids], value: ALL },
      state: { options: [...VISUAL_STATES], value: 'typing' as VisualState },
    }),
    [ids.join(',')],
  );

  useControls(
    'Force state',
    {
      Apply: button(() => {
        const targets = agent === ALL ? ids : [agent];
        for (const id of targets) forceState(id, state);
      }),
    },
    [agent, state, ids.join(',')],
  );

  const { randomize } = useControls('Randomize', { randomize: false });
  useEffect(() => {
    if (!randomize) return;
    const t = setInterval(() => randomizeFakes(0.5), RANDOMIZE_EVERY_MS);
    return () => clearInterval(t);
  }, [randomize]);

  // Keep the agent select valid when the selected agent leaves.
  useEffect(() => {
    if (agent !== ALL && !ids.includes(agent)) set({ agent: ALL });
  }, [agent, ids, set]);

  return null;
}

/** leva panel to spawn fake agents and force states. Dev builds, or any build with `?debug`. */
export function DebugPanel() {
  useUrlSpawn();
  const [show, setShow] = useState(false);
  useEffect(() => {
    const on = IS_DEV || new URLSearchParams(window.location.search).has('debug');
    setShow(on);
    if (!on) return;
    window.__overseerFake = {
      spawn: spawnFakes,
      force: forceState,
      spawnSub: spawnSubagent,
      finishSub: finishSubagent,
      ids: fakeIds,
      randomize: randomizeFakes,
      dismiss: dismissFakes,
    };
    return () => {
      delete window.__overseerFake;
    };
  }, []);
  if (!show) return null;
  return (
    <>
      <Leva collapsed titleBar={{ title: 'Debug' }} />
      <Controls />
    </>
  );
}

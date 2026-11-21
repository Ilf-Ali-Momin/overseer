'use client';

import { resolveState } from '@overseer/shared';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { audioReady, doorWhoosh, keyClick, riskAlert, successBlip } from '@/audio/synth';
import { useAgentsStore } from '@/state/agents';
import { createLimiter, useSoundStore } from '@/state/sound';
import { actorPositions } from './actorPositions';
import { doorTarget } from './doorSwing';
import { isSuccessEvent, newestSince } from './reactions';

const SCAN_HZ = 12;

/** Plays sound effects for what happens in the office (only when unmuted). */
export function SoundFx() {
  const last = useRef(0);
  const doorOpen = useRef(false);
  const seen = useRef(new Map<string, { risk: number; ok: number }>());
  const limits = useRef({
    click: createLimiter(70),
    door: createLimiter(1500),
    alert: createLimiter(1200),
    ok: createLimiter(400),
  });

  useFrame(({ clock }) => {
    if (clock.elapsedTime - last.current < 1 / SCAN_HZ) return;
    last.current = clock.elapsedTime;
    const now = Date.now();
    const agents = Object.values(useAgentsStore.getState().agents);
    const on = !useSoundStore.getState().muted && audioReady();
    const l = limits.current;

    // Track new events even while muted, so unmuting does not replay old ones.
    let typists = 0;
    let alert = false;
    let ok = false;
    for (const a of agents) {
      const s = seen.current.get(a.id) ?? { risk: now - 2000, ok: now - 2000 };
      seen.current.set(a.id, s);
      const high = newestSince(a.events, s.risk, (e) => e.risk?.level === 'high');
      if (high) {
        s.risk = high.ts;
        alert = true;
      }
      const win = newestSince(a.events, s.ok, isSuccessEvent);
      if (win) {
        s.ok = win.ts;
        ok = true;
      }
      const st = resolveState(a.machine, now);
      if (st === 'typing' || st === 'terminal') typists++;
    }
    const open = doorTarget(actorPositions.values()) !== 0;
    const opened = open && !doorOpen.current;
    doorOpen.current = open;
    if (!on) return;

    if (alert && l.alert(now)) riskAlert();
    if (ok && l.ok(now)) successBlip();
    if (opened && l.door(now)) doorWhoosh();
    // More typists, more clicks; random so it sounds like real typing.
    if (typists > 0 && Math.random() < Math.min(0.8, 0.25 * typists) && l.click(now)) keyClick();
  });

  return null;
}

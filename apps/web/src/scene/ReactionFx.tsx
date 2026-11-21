'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  Color,
  DoubleSide,
  type InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
} from 'three';
import { useAgentsStore } from '@/state/agents';
import { useViewStore } from '@/state/view';
import { actorPositions } from './actorPositions';
import {
  type Particle,
  isErrorEvent,
  isSuccessEvent,
  newestSince,
  shake,
  spawnConfetti,
  stepConfetti,
} from './reactions';

const MAX_PARTICLES = 240;
const PER_BURST = 60;
const SCAN_HZ = 10;

/** Watches agents for errors (camera shake) and successes (confetti above the agent). */
export function ReactionFx() {
  const mesh = useRef<InstancedMesh>(null);
  const particles = useRef<Particle[]>([]);
  /** Latest event ts already reacted to, per agent and kind. */
  const seen = useRef(new Map<string, { err: number; ok: number }>());
  const lastScan = useRef(0);
  const dummy = useMemo(() => new Object3D(), []);
  const color = useMemo(() => new Color(), []);
  const geometry = useMemo(() => new PlaneGeometry(0.05, 0.08), []);
  const material = useMemo(
    () => new MeshBasicMaterial({ side: DoubleSide, toneMapped: false }),
    [],
  );

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useFrame(({ clock }, delta) => {
    // Scan for new reactions a few times per second.
    if (clock.elapsedTime - lastScan.current >= 1 / SCAN_HZ) {
      lastScan.current = clock.elapsedTime;
      const now = Date.now();
      const confettiOn = useViewStore.getState().perfLevel > 0;
      for (const agent of Object.values(useAgentsStore.getState().agents)) {
        // New agents start from "now - 2 s" so a replayed history does not fire old reactions.
        const s = seen.current.get(agent.id) ?? { err: now - 2000, ok: now - 2000 };
        seen.current.set(agent.id, s);
        const err = newestSince(agent.events, s.err, isErrorEvent);
        if (err) {
          s.err = err.ts;
          shake.start = performance.now();
        }
        const ok = newestSince(agent.events, s.ok, isSuccessEvent);
        if (ok) {
          s.ok = ok.ts;
          const pos = actorPositions.get(agent.id);
          if (pos && confettiOn && particles.current.length + PER_BURST <= MAX_PARTICLES) {
            particles.current.push(...spawnConfetti(pos.x, pos.z, PER_BURST, Math.random));
          }
        }
      }
    }

    const m = mesh.current;
    if (!m) return;
    if (particles.current.length === 0) {
      m.visible = false;
      return;
    }
    particles.current = stepConfetti(particles.current, Math.min(delta, 0.05));
    m.visible = true;
    particles.current.forEach((p, i) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(p.rot, p.rot * 0.7, 0);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      m.setColorAt(i, color.setHex(p.color));
    });
    m.count = particles.current.length;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, MAX_PARTICLES]}
      frustumCulled={false}
      visible={false}
    />
  );
}

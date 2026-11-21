'use client';

import { OrbitControls, OrthographicCamera } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useLayoutEffect, useRef } from 'react';
import type { OrthographicCamera as OrthoCam } from 'three';
import { useAgentsStore } from '@/state/agents';
import { useViewStore } from '@/state/view';
import { actorPositions } from './actorPositions';
import { type CameraView, FOLLOW_ZOOM, dampView } from './cameraFollow';
import { NUDGE_AMOUNT, cameraNudge } from './cameraNudge';
import { shake, shakeOffset } from './reactions';
import { ROOM_CENTER, ROOM_D, ROOM_W } from './layout';

/** Distance of the camera from the room center along the iso diagonal. */
const DIST = 20;

/** Zoom so the whole room fits the viewport with a margin. */
export function fitZoom(width: number, height: number): number {
  // Projected room footprint for a 45 degree iso view (approximate).
  const diag = (ROOM_W + ROOM_D) * Math.SQRT1_2;
  const depth = diag * 0.62 + 2;
  return Math.max(10, Math.min(width / (diag + 1.5), height / depth));
}

/**
 * Orthographic camera. Default: fixed isometric view of the whole room. With an agent selected the
 * iso view follows it smoothly and zooms in; deselecting glides back to the overview.
 * Orbit mode: free rotate / pan / zoom with OrbitControls. Leaving orbit mode snaps back.
 */
export function CameraRig() {
  const ref = useRef<OrthoCam>(null);
  const { width, height } = useThree((s) => s.size);
  const orbit = useViewStore((s) => s.orbit);
  const [cx, , cz] = ROOM_CENTER;
  const view = useRef<CameraView | null>(null);

  // Leaving orbit mode snaps straight back to the iso pose instead of gliding from the orbit view.
  useLayoutEffect(() => {
    if (!orbit) view.current = null;
  }, [orbit]);

  useFrame((_, delta) => {
    const cam = ref.current;
    if (!cam || orbit) return;
    // Debug: `?zoom=3&focus=x,z` magnifies around a floor point.
    const params = new URLSearchParams(window.location.search);
    const mult = Number(params.get('zoom') ?? '1') || 1;
    const focus = params.get('focus')?.split(',').map(Number);
    const goal: CameraView = { x: cx, z: cz, zoom: mult };
    if (focus?.length === 2 && focus.every(Number.isFinite)) {
      goal.x = focus[0] ?? cx;
      goal.z = focus[1] ?? cz;
    }
    const selected = useAgentsStore.getState().selectedId;
    const pos = selected ? actorPositions.get(selected) : undefined;
    if (pos) {
      goal.x = pos.x;
      goal.z = pos.z;
      goal.zoom = FOLLOW_ZOOM;
    } else if (performance.now() < cameraNudge.until) {
      // A subagent just spawned: drift the overview a little toward it.
      goal.x += (cameraNudge.x - goal.x) * NUDGE_AMOUNT;
      goal.z += (cameraNudge.z - goal.z) * NUDGE_AMOUNT;
    }
    const v = view.current ? dampView(view.current, goal, Math.min(delta, 0.1)) : { ...goal };
    view.current = v;
    // Small decaying shake after an error; not part of the damped view so it never drifts.
    const sh = shakeOffset(performance.now() - shake.start);
    const x = v.x + sh.x;
    const z = v.z + sh.z;
    cam.up.set(0, 1, 0);
    cam.position.set(x + DIST, DIST * 0.95, z + DIST);
    cam.lookAt(x, 0, z);
    cam.zoom = fitZoom(width, height) * v.zoom;
    cam.updateProjectionMatrix();
  });
  return (
    <>
      <OrthographicCamera ref={ref} makeDefault near={0.1} far={200} />
      {orbit && (
        <OrbitControls
          makeDefault
          target={[cx, 0, cz]}
          enableDamping
          maxPolarAngle={Math.PI / 2.15}
          minZoom={15}
          maxZoom={400}
        />
      )}
    </>
  );
}

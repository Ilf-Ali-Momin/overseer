'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { CanvasTexture, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from 'three';
import { type OfficeAgent, useAgentsStore } from '@/state/agents';
import { agentColor } from './agentColor';
import { deskSlots } from './layout';
import {
  MONITOR_H,
  MONITOR_HZ,
  MONITOR_W,
  drawMonitor,
  monitorContent,
  monitorKey,
} from './monitorDraw';

/** Screen panel of the Kenney computerScreen, relative to the model origin. */
const SCREEN_W = 0.379;
const SCREEN_H = 0.233;
const SCREEN_CENTER: [number, number, number] = [0.196, 0.171, -0.049];
/** The panel leans back ~8 degrees. */
const SCREEN_TILT = -Math.atan2(0.0325, 0.2314);
/** Screen model offset from the desk origin (keep in sync with DESK_ITEMS.screen in Desks.tsx). */
const SCREEN_OFFSET: [number, number, number] = [0.16, 0.384, -0.24];

interface Screen {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: CanvasTexture;
  material: MeshBasicMaterial;
  key: string;
}

/** One live CanvasTexture per desk monitor, redrawn at most MONITOR_HZ times per second. */
export function Monitors() {
  const slots = useMemo(() => deskSlots(), []);
  const geometry = useMemo(() => new PlaneGeometry(SCREEN_W, SCREEN_H), []);
  const screens = useMemo<Screen[]>(
    () =>
      slots.map(() => {
        const canvas = document.createElement('canvas');
        canvas.width = MONITOR_W;
        canvas.height = MONITOR_H;
        const ctx = canvas.getContext('2d')!;
        const texture = new CanvasTexture(canvas);
        texture.colorSpace = SRGBColorSpace;
        texture.anisotropy = 4;
        const material = new MeshBasicMaterial({ map: texture, toneMapped: false });
        return { canvas, ctx, texture, material, key: '' };
      }),
    [slots],
  );

  useEffect(
    () => () => {
      geometry.dispose();
      for (const s of screens) {
        s.texture.dispose();
        s.material.dispose();
      }
    },
    [geometry, screens],
  );

  const last = useRef(-Infinity);
  const tick = useRef(0);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (t - last.current < 1 / MONITOR_HZ) return;
    last.current = t;
    tick.current++;
    const byDesk = new Map<number, OfficeAgent>();
    for (const a of Object.values(useAgentsStore.getState().agents)) byDesk.set(a.deskIndex, a);
    const now = Date.now();
    screens.forEach((s, i) => {
      const agent = byDesk.get(i);
      const content = monitorContent(agent, agent ? agentColor(agent.id) : '#5b6375', now);
      const key = monitorKey(content, tick.current);
      if (key === s.key) return;
      s.key = key;
      drawMonitor(s.ctx, content, tick.current);
      s.texture.needsUpdate = true;
    });
  });

  return (
    <group>
      {slots.map((slot, i) => (
        <group
          key={slot.index}
          position={[
            slot.position[0] + SCREEN_OFFSET[0],
            SCREEN_OFFSET[1],
            slot.position[2] + SCREEN_OFFSET[2],
          ]}
        >
          <mesh
            geometry={geometry}
            material={screens[i]!.material}
            position={SCREEN_CENTER}
            rotation={[SCREEN_TILT, 0, 0]}
          />
        </group>
      ))}
    </group>
  );
}

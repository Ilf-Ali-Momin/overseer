'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  Color,
  type Group,
  MeshBasicMaterial,
  PlaneGeometry,
} from 'three';
import { type OfficeAgent, useAgentsStore } from '@/state/agents';
import { deskSlots } from './layout';
import { GLOW_COLOR, deskGlow, newestHigh } from './riskGlow';
import { riskPulse } from './riskPulse';

/** Lamp shade, relative to the desk origin (lamp at [0.58, 0.384, -0.22], shade on top). */
const SHADE: [number, number, number] = [0.64, 0.384 + 0.225, -0.28];
/** Glow disc on the floor, centered under the desk. */
const DISC: [number, number, number] = [0.5, 0.012, -0.15];
/** Colors above 1 are picked up by the bloom pass (threshold 1). */
const HDR = 2;
const UPDATE_HZ = 10;

function radialTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new CanvasTexture(c);
}

interface Lamp {
  shade: MeshBasicMaterial;
  disc: MeshBasicMaterial;
}

/** Desk lamps glow amber (medium) or red (high) after risky tool calls; high also pulses the room. */
export function RiskLamps() {
  const slots = useMemo(() => deskSlots(), []);
  const shapes = useMemo(
    () => ({
      shade: new BoxGeometry(0.13, 0.135, 0.13),
      disc: new PlaneGeometry(1.8, 1.8),
      texture: radialTexture(),
    }),
    [],
  );
  const lamps = useMemo<Lamp[]>(
    () =>
      slots.map(() => ({
        shade: new MeshBasicMaterial({ toneMapped: false, transparent: true }),
        disc: new MeshBasicMaterial({
          map: shapes.texture,
          toneMapped: false,
          transparent: true,
          depthWrite: false,
          blending: AdditiveBlending,
        }),
      })),
    [slots, shapes],
  );
  const groups = useRef<(Group | null)[]>([]);
  const last = useRef(-Infinity);
  /** Latest high event timestamp already pulsed, per agent. */
  const pulsed = useRef(new Map<string, number>());
  const color = useMemo(() => new Color(), []);

  useEffect(
    () => () => {
      shapes.shade.dispose();
      shapes.disc.dispose();
      shapes.texture.dispose();
      for (const l of lamps) {
        l.shade.dispose();
        l.disc.dispose();
      }
    },
    [shapes, lamps],
  );

  useFrame(({ clock }) => {
    if (clock.elapsedTime - last.current < 1 / UPDATE_HZ) return;
    last.current = clock.elapsedTime;
    const now = Date.now();
    const byDesk = new Map<number, OfficeAgent>();
    for (const a of Object.values(useAgentsStore.getState().agents)) {
      byDesk.set(a.deskIndex, a);
      const seen = pulsed.current.get(a.id) ?? now - 2000;
      const high = newestHigh(a.events, seen);
      if (high) {
        pulsed.current.set(a.id, high.ts);
        riskPulse.start = performance.now();
      } else if (!pulsed.current.has(a.id)) {
        pulsed.current.set(a.id, seen);
      }
    }
    lamps.forEach((lamp, i) => {
      const g = groups.current[i];
      const agent = byDesk.get(i);
      const glow = agent ? deskGlow(agent.events, now) : { level: 'none' as const, strength: 0 };
      if (!g) return;
      if (glow.level === 'none' || glow.strength <= 0) {
        g.visible = false;
        return;
      }
      g.visible = true;
      // Gentle flicker for high risk.
      const flicker = glow.level === 'high' ? 0.85 + 0.15 * Math.sin(clock.elapsedTime * 9) : 1;
      color.set(GLOW_COLOR[glow.level]);
      lamp.shade.color.copy(color).multiplyScalar(HDR * flicker);
      lamp.shade.opacity = 0.35 + 0.6 * glow.strength;
      lamp.disc.color.copy(color);
      lamp.disc.opacity = 0.55 * glow.strength * flicker;
    });
  });

  return (
    <group>
      {slots.map((slot, i) => (
        <group
          key={slot.index}
          ref={(g) => {
            groups.current[i] = g;
          }}
          position={[slot.position[0], 0, slot.position[2]]}
          visible={false}
        >
          <mesh geometry={shapes.shade} material={lamps[i]!.shade} position={SHADE} />
          <mesh
            geometry={shapes.disc}
            material={lamps[i]!.disc}
            position={DISC}
            rotation={[-Math.PI / 2, 0, 0]}
            renderOrder={1}
          />
        </group>
      ))}
    </group>
  );
}

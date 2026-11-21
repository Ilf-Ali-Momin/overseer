'use client';

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { type AmbientLight, Color, type DirectionalLight, type HemisphereLight } from 'three';
import { useAgentsStore } from '@/state/agents';
import { dayPhase, lightingFor, sessionStart } from './dayCycle';
import { ROOM_CENTER, ROOM_D, ROOM_W } from './layout';
import { pulseAmount } from './riskGlow';
import { riskPulse } from './riskPulse';

const AMBIENT = '#c9d4ff';
const SKY = '#fff1dd';
const PULSE = '#ff2a2a';

/** Debug: `?time=0..1` pins the day phase (0 morning, 0.5 evening, 1 night). */
function timeOverride(): number | null {
  const v = new URLSearchParams(window.location.search).get('time');
  const n = v === null ? NaN : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Key light with soft shadows, fill and ambient; shifts from morning to night over a session. */
export function Lighting() {
  const [cx, , cz] = ROOM_CENTER;
  const half = Math.max(ROOM_W, ROOM_D) * 0.75;
  const ambient = useRef<AmbientLight>(null);
  const hemi = useRef<HemisphereLight>(null);
  const keyLight = useRef<DirectionalLight>(null);
  const loadedAt = useRef(Date.now());
  const day = useRef({ next: 0, light: lightingFor(0) });
  const colors = useMemo(() => ({ pulse: new Color(PULSE) }), []);

  // Red pulse across the room after a high risk event (color changes do not recompile shaders).
  useFrame(() => {
    // Day/night from the longest session's length, recomputed once a second.
    const now = Date.now();
    if (now >= day.current.next) {
      day.current.next = now + 1000;
      const agents = Object.values(useAgentsStore.getState().agents);
      const start = sessionStart(
        agents.map((a) => a.events[0]?.ts),
        loadedAt.current,
      );
      day.current.light = lightingFor(timeOverride() ?? dayPhase(now - start));
    }
    const light = day.current.light;
    if (keyLight.current) {
      keyLight.current.color.copy(light.key);
      keyLight.current.intensity = light.keyIntensity;
    }
    const k = pulseAmount(performance.now() - riskPulse.start);
    if (ambient.current) {
      ambient.current.color.copy(light.ambient).lerp(colors.pulse, k * 0.85);
      ambient.current.intensity = light.ambientIntensity + k * 0.5;
    }
    if (hemi.current) {
      hemi.current.color.copy(light.sky).lerp(colors.pulse, k * 0.7);
      hemi.current.intensity = light.skyIntensity;
    }
  });

  return (
    <>
      <ambientLight ref={ambient} intensity={0.55} color={AMBIENT} />
      <hemisphereLight ref={hemi} args={[SKY, '#3a3f55', 0.5]} />
      <directionalLight
        ref={keyLight}
        castShadow
        color="#ffe2b8"
        intensity={2.2}
        position={[cx + 8, 14, cz + 6]}
        target-position={[cx, 0, cz]}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-left={-half}
        shadow-camera-right={half}
        shadow-camera-top={half}
        shadow-camera-bottom={-half}
        shadow-camera-near={1}
        shadow-camera-far={40}
      />
    </>
  );
}

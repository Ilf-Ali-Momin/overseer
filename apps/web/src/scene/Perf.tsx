'use client';

import { PerformanceMonitor, Stats } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { useViewStore, type PerfLevel } from '@/state/view';

const IS_DEV = process.env.NODE_ENV !== 'production';

/** Live render numbers, readable from the console as `window.__overseer`. */
export interface RenderInfo {
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  fps: number;
}

declare global {
  interface Window {
    __overseer?: RenderInfo;
  }
}

function RenderInfoProbe() {
  const gl = useThree((s) => s.gl);
  const acc = useRef({ frames: 0, t: 0, calls: 0, triangles: 0 });
  useEffect(() => {
    // Post effects render several passes per frame; count them all and reset once per frame.
    gl.info.autoReset = false;
    return () => {
      gl.info.autoReset = true;
    };
  }, [gl]);
  useFrame((_, delta) => {
    const a = acc.current;
    // Totals of the previous frame (all passes), then start counting the next one.
    a.calls = gl.info.render.calls;
    a.triangles = gl.info.render.triangles;
    gl.info.reset();
    a.frames++;
    a.t += delta;
    if (a.t < 1) return;
    const { calls, triangles } = a;
    const { geometries, textures } = gl.info.memory;
    window.__overseer = { calls, triangles, geometries, textures, fps: Math.round(a.frames / a.t) };
    a.frames = 0;
    a.t = 0;
  });
  return null;
}

/**
 * Adapts quality to the device. Drops `perfLevel` (and the pixel ratio) when fps stays low,
 * raises it again when there is headroom. Dev builds show an fps panel.
 */
export function Perf() {
  const setPerfLevel = useViewStore((s) => s.setPerfLevel);
  const setDpr = useThree((s) => s.setDpr);
  const level = useRef<PerfLevel>(2);

  const change = (next: PerfLevel) => {
    if (next === level.current) return;
    level.current = next;
    setPerfLevel(next);
    setDpr(next === 0 ? 1 : next === 1 ? 1.5 : Math.min(2, window.devicePixelRatio));
  };

  return (
    <>
      <PerformanceMonitor
        onDecline={() => change(Math.max(0, level.current - 1) as PerfLevel)}
        onIncline={() => change(Math.min(2, level.current + 1) as PerfLevel)}
        flipflops={3}
        onFallback={() => change(0)}
      />
      <RenderInfoProbe />
      {IS_DEV && <Stats className="overseer-stats" />}
    </>
  );
}

'use client';

import { Bloom, EffectComposer, SMAA, Vignette } from '@react-three/postprocessing';
import type { JSX } from 'react';
import { type PerfLevel, useViewStore } from '@/state/view';
import { effectsFor } from './effectsConfig';

/** Debug: `?fx=0|1|2` forces an effects level (for performance comparisons). */
function fxOverride(): PerfLevel | null {
  if (typeof window === 'undefined') return null;
  const v = new URLSearchParams(window.location.search).get('fx');
  return v === '0' || v === '1' || v === '2' ? (Number(v) as PerfLevel) : null;
}

/**
 * Post effects: Bloom for HDR emissive colors only (risk lamps, threshold 1), SMAA and a subtle
 * Vignette at full quality. `Perf` lowers `perfLevel` on weak devices: 1 = bloom only, 0 = none.
 */
export function Effects() {
  const perfLevel = useViewStore((s) => s.perfLevel);
  const fx = effectsFor(fxOverride() ?? perfLevel);
  if (!fx.enabled) return null;
  const passes: JSX.Element[] = [];
  if (fx.bloom) {
    passes.push(
      <Bloom
        key="bloom"
        mipmapBlur
        luminanceThreshold={1}
        luminanceSmoothing={0.2}
        intensity={1.1}
      />,
    );
  }
  if (fx.vignette) passes.push(<Vignette key="vignette" offset={0.3} darkness={0.45} />);
  if (fx.smaa) passes.push(<SMAA key="smaa" />);
  return <EffectComposer multisampling={fx.multisampling}>{passes}</EffectComposer>;
}

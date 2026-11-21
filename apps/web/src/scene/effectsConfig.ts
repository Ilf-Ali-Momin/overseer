import type { PerfLevel } from '@/state/view';

/** Which post effects run at each performance level. Pure so it can be tested. */
export interface EffectsConfig {
  enabled: boolean;
  bloom: boolean;
  smaa: boolean;
  vignette: boolean;
  /** MSAA samples for the composer; 0 when SMAA does the anti-aliasing. */
  multisampling: number;
}

export function effectsFor(level: PerfLevel): EffectsConfig {
  if (level === 0) {
    return { enabled: false, bloom: false, smaa: false, vignette: false, multisampling: 0 };
  }
  if (level === 1) {
    return { enabled: true, bloom: true, smaa: false, vignette: false, multisampling: 2 };
  }
  return { enabled: true, bloom: true, smaa: true, vignette: true, multisampling: 0 };
}

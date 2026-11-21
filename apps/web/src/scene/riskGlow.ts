import type { AgentEvent } from '@overseer/shared';

/** Desk lamp glow from recent risky events. Pure so it can be tested. */

/** How long a lamp stays lit after a risky event. */
export const GLOW_MS = 20_000;
/** The last part of GLOW_MS fades out. */
const FADE_MS = 6_000;
/** Length of the red pulse across the room after a new high risk event. */
export const PULSE_MS = 900;

export type GlowLevel = 'none' | 'medium' | 'high';

export interface Glow {
  level: GlowLevel;
  /** 0..1, fades out at the end of the window. */
  strength: number;
}

export const GLOW_COLOR: Record<Exclude<GlowLevel, 'none'>, string> = {
  medium: '#ff9010',
  high: '#ff3030',
};

export function deskGlow(events: readonly AgentEvent[], now: number, windowMs = GLOW_MS): Glow {
  let best: Glow = { level: 'none', strength: 0 };
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i]!;
    const age = now - ev.ts;
    if (age > windowMs) break;
    const lvl = ev.risk?.level;
    if (lvl !== 'medium' && lvl !== 'high') continue;
    const strength = Math.max(0, Math.min(1, (windowMs - age) / FADE_MS));
    const better =
      (lvl === 'high' && best.level !== 'high') ||
      (lvl === best.level && strength > best.strength) ||
      best.level === 'none';
    if (better) best = { level: lvl, strength };
  }
  return best;
}

/** High risk events newer than `since` (epoch ms), for the room pulse. */
export function newestHigh(events: readonly AgentEvent[], since: number): AgentEvent | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i]!;
    if (ev.ts <= since) return undefined;
    if (ev.risk?.level === 'high') return ev;
  }
  return undefined;
}

/** Pulse amount 0..1 at `t` ms after it started: quick rise, ease out. */
export function pulseAmount(elapsedMs: number): number {
  if (elapsedMs < 0 || elapsedMs >= PULSE_MS) return 0;
  const k = elapsedMs / PULSE_MS;
  return k < 0.15 ? k / 0.15 : (1 - (k - 0.15) / 0.85) ** 2;
}

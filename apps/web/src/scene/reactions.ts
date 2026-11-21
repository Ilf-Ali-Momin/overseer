import type { AgentEvent } from '@overseer/shared';

/** Screen shake on errors and confetti on success. Pure logic so it can be tested. */

export const SHAKE_MS = 350;
const SHAKE_AMP = 0.09;
export const CONFETTI_LIFE = 1.6;
const GRAVITY = -5.5;

/** Start time (performance.now ms) of the latest shake; read by CameraRig. */
export const shake = { start: -Infinity };

export function isErrorEvent(ev: AgentEvent): boolean {
  return (
    ev.kind === 'error' ||
    (ev.kind === 'tool_end' && (ev.tool?.isError === true || ev.text === 'tests failed'))
  );
}

export function isSuccessEvent(ev: AgentEvent): boolean {
  return (ev.kind === 'tool_end' && ev.text === 'tests passed') || ev.kind === 'subagent_end';
}

/** Newest event newer than `since` that matches, scanning from the end. */
export function newestSince(
  events: readonly AgentEvent[],
  since: number,
  match: (ev: AgentEvent) => boolean,
): AgentEvent | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i]!;
    if (ev.ts <= since) return undefined;
    if (match(ev)) return ev;
  }
  return undefined;
}

/** Camera offset (world units) `elapsedMs` after a shake started; zero outside the shake. */
export function shakeOffset(elapsedMs: number): { x: number; z: number } {
  if (elapsedMs < 0 || elapsedMs >= SHAKE_MS) return { x: 0, z: 0 };
  const t = elapsedMs / SHAKE_MS;
  const a = SHAKE_AMP * (1 - t) * (1 - t);
  return { x: a * Math.sin(t * 55), z: a * Math.cos(t * 43) };
}

export interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  spin: number;
  rot: number;
  color: number;
  age: number;
}

export const CONFETTI_COLORS = [0xff5d73, 0xffc145, 0x5bd1d7, 0x8f7bff, 0x7ee081];

export function spawnConfetti(x: number, z: number, n: number, rng: () => number): Particle[] {
  return Array.from({ length: n }, () => {
    const a = rng() * Math.PI * 2;
    const s = 0.4 + rng() * 0.9;
    return {
      x,
      y: 1.0,
      z,
      vx: Math.cos(a) * s,
      vy: 1.6 + rng() * 1.6,
      vz: Math.sin(a) * s,
      spin: (rng() - 0.5) * 14,
      rot: rng() * Math.PI,
      color: CONFETTI_COLORS[Math.floor(rng() * CONFETTI_COLORS.length)]!,
      age: 0,
    };
  });
}

/** Advance particles; returns the ones still alive (above the floor and younger than the life). */
export function stepConfetti(ps: Particle[], dt: number): Particle[] {
  const out: Particle[] = [];
  for (const p of ps) {
    p.age += dt;
    p.vy += GRAVITY * dt;
    // Air drag keeps it floaty.
    p.vx *= 1 - 1.5 * dt;
    p.vz *= 1 - 1.5 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    p.rot += p.spin * dt;
    if (p.age < CONFETTI_LIFE && p.y > 0.01) out.push(p);
  }
  return out;
}

import { type ClipName, type PoseName, STATE_ANIMATION, type VisualState } from '@overseer/shared';
import type { NavGrid, Pt } from './nav';
import {
  DOOR_INSIDE,
  DOOR_OUTSIDE,
  SEAT_YAW,
  WANDER_SPOTS,
  type WanderSpot,
  yawFor,
} from './layout';

/**
 * Per-agent movement: walk paths, sit down, stand up, leave. Pure logic on plain numbers so it can
 * be unit tested and stepped from useFrame without React renders.
 */

/** Walk speed in world units per second, matched to the Walk clip stride at scale 0.18. */
export const WALK_SPEED = 0.75;
/** Start slowing down this far from the end of a path. */
const SLOW_RADIUS = 0.5;
const ACCEL = 6;
const TURN = 9;
/** Time to slide in or out of the chair, in seconds. */
export const SIT_TIME = 0.5;

export type Want =
  | { kind: 'seat' }
  /** Stand behind the chair facing the desk. */
  | { kind: 'stand' }
  | { kind: 'spot'; key: string; point: Pt; yaw: number }
  | { kind: 'exit' };

export type Phase = 'walk' | 'sitDown' | 'seated' | 'standUp' | 'stand' | 'gone';

export interface DeskPoints {
  seat: Pt;
  /** Where walks to and from the desk end (behind the chair). */
  approach: Pt;
}

export interface Motion {
  x: number;
  z: number;
  yaw: number;
  phase: Phase;
  path: Pt[];
  /** Index of the next waypoint in `path`. */
  idx: number;
  speed: number;
  /** Progress of sitDown / standUp, 0..1. */
  t: number;
  /** Key of the place the agent is at or walking to. */
  target: string;
  /** Yaw to face once standing at the target. */
  targetYaw: number;
}

export function createMotion(start: Pt = DOOR_OUTSIDE): Motion {
  return {
    x: start[0],
    z: start[1],
    yaw: Math.PI / 2,
    phase: 'stand',
    path: [],
    idx: 0,
    speed: 0,
    t: 0,
    target: 'outside',
    targetYaw: Math.PI / 2,
  };
}

function wantKey(want: Want): string {
  switch (want.kind) {
    case 'seat':
    case 'stand':
      return 'desk';
    case 'spot':
      return `spot:${want.key}`;
    case 'exit':
      return 'exit';
  }
}

function destination(want: Want, desk: DeskPoints): Pt {
  switch (want.kind) {
    case 'seat':
    case 'stand':
      return desk.approach;
    case 'spot':
      return want.point;
    case 'exit':
      return DOOR_OUTSIDE;
  }
}

function destinationYaw(want: Want): number {
  return want.kind === 'spot' ? want.yaw : want.kind === 'exit' ? -Math.PI / 2 : SEAT_YAW;
}

/** Path from a point to a destination, routing through the door when either end is outside. */
export function planPath(nav: NavGrid, from: Pt, to: Pt): Pt[] {
  const outside = (p: Pt) => p[0] < 0.2;
  const route = (a: Pt, b: Pt): Pt[] => {
    const p = nav.findPath(a, b);
    return p.length > 0 ? p : [a, b];
  };
  if (outside(from) && outside(to)) return [from, to];
  if (outside(from)) return [from, ...route(DOOR_INSIDE, to)];
  if (outside(to)) return [...route(from, DOOR_INSIDE), to];
  return route(from, to);
}

const ease = (t: number) => t * t * (3 - 2 * t);

function dampAngle(from: number, to: number, rate: number, dt: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return from + d * (1 - Math.exp(-rate * dt));
}

function remaining(m: Motion): number {
  let len = 0;
  let px = m.x;
  let pz = m.z;
  for (let i = m.idx; i < m.path.length; i++) {
    const p = m.path[i]!;
    len += Math.hypot(p[0] - px, p[1] - pz);
    px = p[0];
    pz = p[1];
  }
  return len;
}

function walk(m: Motion, dt: number): boolean {
  const left = remaining(m);
  const desired = WALK_SPEED * Math.min(1, Math.max(0.3, left / SLOW_RADIUS));
  m.speed += (desired - m.speed) * (1 - Math.exp(-ACCEL * dt));
  let move = m.speed * dt;
  while (move > 0 && m.idx < m.path.length) {
    const p = m.path[m.idx]!;
    const dx = p[0] - m.x;
    const dz = p[1] - m.z;
    const d = Math.hypot(dx, dz);
    if (d > 1e-4) m.yaw = dampAngle(m.yaw, yawFor(dx, dz), TURN, dt);
    if (move >= d) {
      m.x = p[0];
      m.z = p[1];
      m.idx++;
      move -= d;
    } else {
      m.x += (dx / d) * move;
      m.z += (dz / d) * move;
      move = 0;
    }
  }
  return m.idx >= m.path.length;
}

/** Advance one agent's motion by `dt` seconds toward what it wants. Mutates `m`. */
export function stepMotion(
  m: Motion,
  want: Want,
  desk: DeskPoints,
  nav: NavGrid,
  dt: number,
): void {
  if (m.phase === 'gone') return;

  if (m.phase === 'seated') {
    if (want.kind === 'seat') {
      m.yaw = dampAngle(m.yaw, SEAT_YAW, TURN, dt);
      return;
    }
    m.phase = 'standUp';
    m.t = 0;
  }

  if (m.phase === 'sitDown' && want.kind !== 'seat') {
    // Changed its mind halfway: stand back up from where it is.
    m.phase = 'standUp';
    m.t = 1 - m.t;
  }

  if (m.phase === 'sitDown' || m.phase === 'standUp') {
    m.t = Math.min(1, m.t + dt / SIT_TIME);
    const k = ease(m.phase === 'sitDown' ? m.t : 1 - m.t);
    m.x = desk.approach[0] + (desk.seat[0] - desk.approach[0]) * k;
    m.z = desk.approach[1] + (desk.seat[1] - desk.approach[1]) * k;
    m.yaw = dampAngle(m.yaw, SEAT_YAW, TURN, dt);
    if (m.t >= 1) {
      m.phase = m.phase === 'sitDown' ? 'seated' : 'stand';
      m.target = 'desk';
      m.t = 0;
    }
    return;
  }

  const key = wantKey(want);
  if (m.target !== key) {
    m.path = planPath(nav, [m.x, m.z], destination(want, desk));
    m.idx = 1;
    m.target = key;
    m.targetYaw = destinationYaw(want);
    m.phase = 'walk';
  }

  if (m.phase === 'walk') {
    if (walk(m, dt)) {
      m.speed = 0;
      m.phase = want.kind === 'exit' ? 'gone' : 'stand';
    }
    return;
  }

  // Standing at the target.
  if (key === 'desk' && want.kind === 'seat') {
    m.phase = 'sitDown';
    m.t = 0;
    return;
  }
  m.yaw = dampAngle(m.yaw, m.targetYaw, TURN, dt);
}

/** What the agent wants given its visual state. */
export function wantFor(state: VisualState): Want {
  if (state === 'leaving') return { kind: 'exit' };
  return STATE_ANIMATION[state].seated ? { kind: 'seat' } : { kind: 'stand' };
}

export interface AnimationChoice {
  clip: ClipName;
  speed: number;
  pose: PoseName;
}

/** Clip and pose for the current motion phase and visual state. */
export function animationFor(m: Motion, state: VisualState): AnimationChoice {
  const anim = STATE_ANIMATION[state];
  switch (m.phase) {
    case 'walk':
      return { clip: 'Walk', speed: Math.max(0.4, m.speed / WALK_SPEED), pose: 'none' };
    case 'sitDown':
    case 'seated':
      return anim.seated
        ? { clip: anim.clip, speed: anim.speed, pose: anim.pose }
        : { clip: 'Idle', speed: 1, pose: 'sitRead' };
    case 'standUp':
    case 'gone':
      return { clip: 'Idle', speed: 1, pose: 'none' };
    case 'stand':
      return anim.seated || state === 'leaving'
        ? { clip: 'Idle', speed: 1, pose: 'none' }
        : { clip: anim.clip, speed: anim.speed, pose: anim.pose };
  }
}

/** Idle wandering: which spot the agent is heading to and how long it lingers there. */
export interface WanderPlan {
  /** Spot key, `'desk'` for a pause back at the desk, or null before the first pick. */
  spot: string | null;
  /** Clock time (seconds) when lingering ends; null until the agent arrives. */
  until: number | null;
  /** Spots visited since the last desk pause. */
  visits: number;
}

export const LINGER_MIN = 6;
export const LINGER_MAX = 12;

export function createWander(): WanderPlan {
  return { spot: null, until: null, visits: 0 };
}

function pickSpot(
  spots: readonly WanderSpot[],
  taken: ReadonlySet<string>,
  avoid: string | null,
  rng: () => number,
): WanderSpot {
  const free = spots.filter((s) => !taken.has(s.name) && s.name !== avoid);
  const pool = free.length > 0 ? free : spots.filter((s) => s.name !== avoid);
  return pool[Math.floor(rng() * pool.length) % pool.length]!;
}

/**
 * What an idle agent wants: walk to a wander spot, linger, then another spot or a pause at the
 * desk. Mutates `plan`. `taken` holds spot keys other agents are using.
 */
export function idleWant(
  plan: WanderPlan,
  m: Motion,
  now: number,
  rng: () => number,
  taken: ReadonlySet<string> = new Set(),
  spots: readonly WanderSpot[] = WANDER_SPOTS,
): Want {
  const linger = () => now + LINGER_MIN + rng() * (LINGER_MAX - LINGER_MIN);
  const goSpot = (avoid: string | null) => {
    plan.spot = pickSpot(spots, taken, avoid, rng).name;
    plan.until = null;
  };

  if (plan.spot === null) goSpot(null);

  const arrived =
    m.phase === 'stand' && m.target === (plan.spot === 'desk' ? 'desk' : `spot:${plan.spot}`);
  if (arrived) {
    plan.until ??= linger();
    if (now >= plan.until) {
      if (plan.spot === 'desk') {
        plan.visits = 0;
        goSpot(null);
      } else {
        plan.visits++;
        if (plan.visits >= 2 || rng() < 0.4) {
          plan.spot = 'desk';
          plan.until = null;
        } else {
          goSpot(plan.spot);
        }
      }
    }
  }

  if (plan.spot === 'desk') return { kind: 'stand' };
  const spot = spots.find((s) => s.name === plan.spot) ?? spots[0]!;
  return { kind: 'spot', key: spot.name, point: spot.point, yaw: spot.yaw };
}

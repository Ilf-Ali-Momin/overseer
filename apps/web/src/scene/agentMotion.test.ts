import { describe, expect, it } from 'vitest';
import {
  LINGER_MAX,
  LINGER_MIN,
  createWander,
  idleWant,
  type Motion,
  type Want,
  animationFor,
  createMotion,
  planPath,
  stepMotion,
  wantFor,
} from './agentMotion';
import {
  DOOR_INSIDE,
  DOOR_OUTSIDE,
  SEAT_YAW,
  deskApproach,
  deskSlots,
  WANDER_SPOTS,
} from './layout';
import type { Pt } from './nav';
import { officeNav } from './officeNav';

const nav = officeNav();
const DT = 1 / 60;

function deskPoints(i: number) {
  const s = deskSlots()[i]!;
  return { seat: [s.seat[0], s.seat[2]] as Pt, approach: deskApproach(s) };
}

/** Step until `done` or the time limit; returns seconds taken (Infinity on timeout). */
function runUntil(
  m: Motion,
  want: Want,
  i: number,
  done: (m: Motion) => boolean,
  limit = 60,
): number {
  const desk = deskPoints(i);
  for (let t = 0; t < limit; t += DT) {
    stepMotion(m, want, desk, nav, DT);
    // Inside the room the agent never walks through blocked cells, except in and next to its chair.
    const nearSeat = Math.hypot(m.x - desk.seat[0], m.z - desk.seat[1]) < 0.4;
    if (m.phase === 'walk' && m.x > 0.3 && !nearSeat) expect(nav.isFree(m.x, m.z)).toBe(true);
    if (done(m)) return t;
  }
  return Infinity;
}

describe('agent motion', () => {
  it.each(deskSlots().map((s) => s.index))('walks from the door to desk %i and sits', (i) => {
    const m = createMotion();
    const t = runUntil(m, { kind: 'seat' }, i, (x) => x.phase === 'seated');
    expect(t).toBeLessThan(40);
    const { seat } = deskPoints(i);
    expect(m.x).toBeCloseTo(seat[0], 3);
    expect(m.z).toBeCloseTo(seat[1], 3);
    expect(Math.cos(m.yaw - SEAT_YAW)).toBeGreaterThan(0.99);
  });

  it('stands up and walks out of the door', () => {
    const m = createMotion();
    runUntil(m, { kind: 'seat' }, 5, (x) => x.phase === 'seated');
    const t = runUntil(m, { kind: 'exit' }, 5, (x) => x.phase === 'gone');
    expect(t).toBeLessThan(40);
    expect(m.x).toBeCloseTo(DOOR_OUTSIDE[0], 3);
  });

  it('stands behind the chair facing the desk for standing states', () => {
    const m = createMotion();
    runUntil(m, { kind: 'stand' }, 0, (x) => x.phase === 'stand' && x.target === 'desk');
    runUntil(m, { kind: 'stand' }, 0, () => false, 1);
    const { approach } = deskPoints(0);
    expect(m.x).toBeCloseTo(approach[0], 3);
    expect(Math.cos(m.yaw - SEAT_YAW)).toBeGreaterThan(0.99);
  });

  it('a change of mind while sitting down reverses smoothly', () => {
    const m = createMotion();
    runUntil(m, { kind: 'seat' }, 0, (x) => x.phase === 'sitDown' && x.t > 0.6);
    stepMotion(m, { kind: 'stand' }, deskPoints(0), nav, DT);
    expect(m.phase).toBe('standUp');
    expect(m.t).toBeLessThan(0.45);
  });

  it('eases speed: slow at the start, full speed mid path, slow at the end', () => {
    const m = createMotion();
    const speeds: number[] = [];
    const desk = deskPoints(11);
    for (let t = 0; t < 40 && m.phase !== 'sitDown'; t += DT) {
      stepMotion(m, { kind: 'seat' }, desk, nav, DT);
      if (m.phase === 'walk') speeds.push(m.speed);
    }
    expect(speeds[0]!).toBeLessThan(0.2);
    expect(Math.max(...speeds)).toBeGreaterThan(0.7);
    expect(speeds.at(-1)!).toBeLessThan(0.35);
  });

  it('routes through the door when starting outside', () => {
    const path = planPath(nav, DOOR_OUTSIDE, deskApproach(deskSlots()[0]!));
    expect(path[0]).toEqual(DOOR_OUTSIDE);
    expect(path[1]).toEqual(DOOR_INSIDE);
  });
});

describe('wantFor / animationFor', () => {
  it('maps visual states to what the agent wants', () => {
    expect(wantFor('typing')).toEqual({ kind: 'seat' });
    expect(wantFor('celebrating')).toEqual({ kind: 'stand' });
    expect(wantFor('leaving')).toEqual({ kind: 'exit' });
  });

  it('walks while walking, uses the state pose while seated', () => {
    const m = createMotion();
    m.phase = 'walk';
    m.speed = 0.75;
    expect(animationFor(m, 'typing')).toEqual({ clip: 'Walk', speed: 1, pose: 'none' });
    m.phase = 'seated';
    expect(animationFor(m, 'typing').pose).toBe('sitType');
    expect(animationFor(m, 'waiting').pose).toBe('sitRaiseHand');
    m.phase = 'stand';
    expect(animationFor(m, 'celebrating')).toMatchObject({ clip: 'Jump', pose: 'cheer' });
    expect(animationFor(m, 'typing').pose).toBe('none');
  });
});

describe('idle wandering', () => {
  /** Deterministic rng (LCG). */
  const seeded = (seed: number) => () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  it('walks to a spot, lingers, moves on, and returns to the seat when busy again', () => {
    const rng = seeded(42);
    const m = createMotion();
    const desk = deskPoints(3);
    runUntil(m, { kind: 'seat' }, 3, (x) => x.phase === 'seated');

    const plan = createWander();
    const visited: string[] = [];
    let arrivedAt = -1;
    let leftAt = -1;
    let clock = 0;
    for (; clock < 200; clock += DT) {
      const want = idleWant(plan, m, clock, rng);
      stepMotion(m, want, desk, nav, DT);
      if (m.phase === 'stand' && m.target.startsWith('spot:') && visited.at(-1) !== m.target) {
        visited.push(m.target);
        if (arrivedAt < 0) arrivedAt = clock;
      }
      if (arrivedAt >= 0 && leftAt < 0 && m.phase === 'walk') leftAt = clock;
      if (visited.length >= 2 || plan.spot === 'desk') break;
    }
    expect(visited.length).toBeGreaterThanOrEqual(1);
    const linger = leftAt - arrivedAt;
    expect(linger).toBeGreaterThanOrEqual(LINGER_MIN - DT);
    expect(linger).toBeLessThanOrEqual(LINGER_MAX + 0.5);

    // Busy again: back to the chair.
    const t = runUntil(m, { kind: 'seat' }, 3, (x) => x.phase === 'seated');
    expect(t).toBeLessThan(40);
  });

  it('faces the spot yaw while lingering', () => {
    const rng = seeded(7);
    const m = createMotion([5, 4]);
    m.target = 'here';
    const plan = createWander();
    for (let clock = 0; clock < 40; clock += DT) {
      stepMotion(m, idleWant(plan, m, clock, rng), deskPoints(0), nav, DT);
      if (m.phase === 'stand' && plan.until !== null && clock > plan.until - 1) break;
    }
    const spot = WANDER_SPOTS.find((s) => s.name === plan.spot)!;
    expect(Math.hypot(m.x - spot.point[0], m.z - spot.point[1])).toBeLessThan(1e-3);
    expect(Math.cos(m.yaw - spot.yaw)).toBeGreaterThan(0.99);
  });

  it('avoids spots other agents have taken', () => {
    const rng = seeded(1);
    const taken = new Set(WANDER_SPOTS.slice(1).map((s) => s.name));
    const plan = createWander();
    const want = idleWant(plan, createMotion([5, 4]), 0, rng, taken);
    expect(want).toMatchObject({ kind: 'spot', key: WANDER_SPOTS[0]!.name });
  });

  it('goes back to stand at the desk after two visits, then wanders again', () => {
    const plan = { spot: 'coffee', until: 0, visits: 1 };
    const m = createMotion(WANDER_SPOTS[0]!.point);
    m.target = 'spot:coffee';
    expect(idleWant(plan, m, 1, () => 0.9)).toEqual({ kind: 'stand' });
    m.target = 'desk';
    expect(idleWant(plan, m, 2, () => 0.9)).toEqual({ kind: 'stand' });
    expect(idleWant(plan, m, 2 + LINGER_MAX, () => 0.9).kind).toBe('spot');
  });
});

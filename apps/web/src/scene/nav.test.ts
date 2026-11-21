import { describe, expect, it } from 'vitest';
import { NavGrid, pathLength, type Pt } from './nav';
import {
  DOOR_INSIDE,
  ROOM_D,
  ROOM_W,
  WANDER_SPOTS,
  deskApproach,
  deskSlots,
  obstacles,
} from './layout';
import { NAV_CELL, NAV_RADIUS, officeNav } from './officeNav';

function walkable(grid: NavGrid, path: readonly Pt[]): boolean {
  for (let i = 1; i < path.length; i++) if (!grid.lineOfSight(path[i - 1]!, path[i]!)) return false;
  return true;
}

describe('NavGrid', () => {
  const wall = { minX: 2, minZ: 0, maxX: 2.5, maxZ: 3.2 };
  const grid = new NavGrid(5, 4, 0.25, [wall], 0.1);

  it('returns a straight line when nothing is in the way', () => {
    expect(grid.findPath([0.5, 3.6], [4.5, 3.6])).toEqual([
      [0.5, 3.6],
      [4.5, 3.6],
    ]);
  });

  it('goes around an obstacle and every segment stays walkable', () => {
    const path = grid.findPath([0.5, 0.5], [4.5, 0.5]);
    expect(path.length).toBeGreaterThan(2);
    expect(path[0]).toEqual([0.5, 0.5]);
    expect(path.at(-1)).toEqual([4.5, 0.5]);
    expect(walkable(grid, path)).toBe(true);
    // Has to pass above the wall end at z = 3.2 (+ radius).
    expect(Math.max(...path.map((p) => p[1]))).toBeGreaterThan(3.2);
    expect(pathLength(path)).toBeLessThan(10);
  });

  it('snaps a blocked goal to the nearest free cell', () => {
    const path = grid.findPath([0.5, 0.5], [2.25, 1]);
    const end = path.at(-1)!;
    expect(grid.isFree(end[0], end[1])).toBe(true);
    expect(Math.hypot(end[0] - 2.25, end[1] - 1)).toBeLessThan(0.6);
  });

  it('returns [] when the goal is unreachable', () => {
    const closed = new NavGrid(5, 4, 0.25, [{ minX: 2, minZ: 0, maxX: 2.5, maxZ: 4 }], 0.1);
    expect(closed.findPath([0.5, 0.5], [4.5, 0.5])).toEqual([]);
  });

  it('blocks a margin of `radius` along the walls', () => {
    const g = new NavGrid(5, 4, 0.25, [], 0.2);
    expect(g.isFree(0.05, 2)).toBe(false);
    expect(g.isFree(0.3, 2)).toBe(true);
    expect(g.isFree(4.9, 2)).toBe(false);
    expect(g.isFree(-1, 2)).toBe(false);
  });
});

describe('office navigation', () => {
  const nav = officeNav();

  it('uses the office size and settings', () => {
    expect(nav.width).toBe(ROOM_W);
    expect(nav.depth).toBe(ROOM_D);
    expect(nav.cell).toBe(NAV_CELL);
    expect(nav.radius).toBe(NAV_RADIUS);
    expect(obstacles().length).toBeGreaterThan(12);
  });

  it('the door, every desk approach and every wander spot are on free floor', () => {
    expect(nav.isFree(...DOOR_INSIDE)).toBe(true);
    for (const s of deskSlots()) expect(nav.isFree(...deskApproach(s))).toBe(true);
    for (const w of WANDER_SPOTS) expect(nav.isFree(...w.point), w.name).toBe(true);
  });

  it('every desk is reachable from the door with a walkable path', () => {
    for (const s of deskSlots()) {
      const goal = deskApproach(s);
      const path = nav.findPath(DOOR_INSIDE, goal);
      expect(path.length).toBeGreaterThanOrEqual(2);
      expect(path.at(-1)).toEqual(goal);
      expect(walkable(nav, path)).toBe(true);
    }
  });

  it('every wander spot is reachable from every desk', () => {
    for (const s of deskSlots()) {
      for (const w of WANDER_SPOTS) {
        const path = nav.findPath(deskApproach(s), w.point);
        expect(path.at(-1), `${s.index} -> ${w.name}`).toEqual(w.point);
      }
    }
  });
});

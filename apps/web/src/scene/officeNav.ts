import { NavGrid } from './nav';
import { ROOM_D, ROOM_W, obstacles } from './layout';

export const NAV_CELL = 0.25;
export const NAV_RADIUS = 0.15;

let cached: NavGrid | null = null;

/** The office walk grid, built once. */
export function officeNav(): NavGrid {
  cached ??= new NavGrid(ROOM_W, ROOM_D, NAV_CELL, obstacles(), NAV_RADIUS);
  return cached;
}

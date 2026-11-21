import type { FloorPoint } from './layout';

/** Door swing logic. Pure so it can be tested. */

/** Doorway center on the floor (the gap in the x = 0 wall). */
export const DOOR_CENTER: FloorPoint = [0, 8.5];
/** Agents closer than this to the doorway open the door. */
export const DOOR_SENSE = 1.3;
/** Open angle (radians); negative swings the leaf into the room. */
export const DOOR_OPEN = -1.35;
/** Damping rate (1/s). */
export const DOOR_RATE = 7;

/** Target door angle given agent floor positions. */
export function doorTarget(positions: Iterable<{ x: number; z: number }>): number {
  for (const p of positions) {
    if (Math.hypot(p.x - DOOR_CENTER[0], p.z - DOOR_CENTER[1]) < DOOR_SENSE) return DOOR_OPEN;
  }
  return 0;
}

export function dampDoor(angle: number, target: number, dt: number): number {
  return angle + (target - angle) * (1 - Math.exp(-DOOR_RATE * dt));
}

/** Camera follow math: damped move of the iso target and zoom. Pure so it can be tested. */

export interface CameraView {
  x: number;
  z: number;
  zoom: number;
}

/** Zoom multiplier while following an agent. */
export const FOLLOW_ZOOM = 2.4;
/** Damping rate (1/s): ~95% of the way in 0.75 s. */
export const FOLLOW_RATE = 4;

/** Move `cur` toward `goal` by frame-rate independent damping. Mutates and returns `cur`. */
export function dampView(
  cur: CameraView,
  goal: CameraView,
  dt: number,
  rate = FOLLOW_RATE,
): CameraView {
  const k = 1 - Math.exp(-rate * dt);
  cur.x += (goal.x - cur.x) * k;
  cur.z += (goal.z - cur.z) * k;
  cur.zoom += (goal.zoom - cur.zoom) * k;
  return cur;
}

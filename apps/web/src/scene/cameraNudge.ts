/** Brief camera nudge toward a newly spawned subagent (overview only). Read by CameraRig. */
export const cameraNudge = { x: 0, z: 0, until: -Infinity };

/** How long a nudge lasts and how far toward the target the overview moves. */
export const NUDGE_MS = 3500;
export const NUDGE_AMOUNT = 0.25;

export function nudgeCamera(x: number, z: number, now = performance.now()): void {
  cameraNudge.x = x;
  cameraNudge.z = z;
  cameraNudge.until = now + NUDGE_MS;
}

import { Vector3 } from 'three';

/** Live world position of every agent, written by AgentActor each frame (read by the camera). */
export const actorPositions = new Map<string, Vector3>();

export function setActorPosition(id: string, x: number, z: number): void {
  const v = actorPositions.get(id);
  if (v) v.set(x, 0, z);
  else actorPositions.set(id, new Vector3(x, 0, z));
}

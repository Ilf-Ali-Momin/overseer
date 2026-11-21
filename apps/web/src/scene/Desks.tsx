'use client';

import { useMemo } from 'react';
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { deskSlots, type DeskSlot } from './layout';
import { InstancedModel } from './InstancedModel';

const DESK_TOP = 0.384;

function placement(x: number, y: number, z: number, rotY = 0): Matrix4 {
  return new Matrix4().compose(
    new Vector3(x, y, z),
    new Quaternion().setFromEuler(new Euler(0, rotY, 0)),
    new Vector3(1, 1, 1),
  );
}

/** Offsets of each desk item relative to the desk origin (front-left corner, desk extends to -Z). */
export const DESK_ITEMS = {
  desk: (s: DeskSlot) => placement(s.position[0], 0, s.position[2]),
  chair: (s: DeskSlot) => placement(s.position[0] + 0.53, 0, s.position[2] + 0.12, Math.PI),
  screen: (s: DeskSlot) => placement(s.position[0] + 0.16, DESK_TOP, s.position[2] - 0.24),
  keyboard: (s: DeskSlot) => placement(s.position[0] + 0.22, DESK_TOP, s.position[2] - 0.03),
  lamp: (s: DeskSlot) => placement(s.position[0] + 0.58, DESK_TOP, s.position[2] - 0.22),
};

/** The 12 workstations, drawn with instancing. */
export function Desks() {
  const slots = useMemo(() => deskSlots(), []);
  const m = useMemo(
    () => ({
      desk: slots.map(DESK_ITEMS.desk),
      chair: slots.map(DESK_ITEMS.chair),
      screen: slots.map(DESK_ITEMS.screen),
      keyboard: slots.map(DESK_ITEMS.keyboard),
      lamp: slots.map(DESK_ITEMS.lamp),
    }),
    [slots],
  );
  return (
    <group>
      <InstancedModel name="desk" matrices={m.desk} />
      <InstancedModel name="chairDesk" matrices={m.chair} />
      <InstancedModel name="computerScreen" matrices={m.screen} />
      <InstancedModel name="computerKeyboard" matrices={m.keyboard} />
      <InstancedModel name="lampSquareTable" matrices={m.lamp} />
    </group>
  );
}

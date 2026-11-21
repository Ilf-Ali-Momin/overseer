'use client';

import { useMemo } from 'react';
import { BoxGeometry, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Door } from './Door';
import { DOOR_TILE_Z, ROOM_D, ROOM_W, WALL_H } from './layout';
import { MergedFurniture, type Placement } from './MergedFurniture';

const WALL_COLOR = '#d9d2c5';
const FLOOR_COLOR = '#a58a6d';
const WALL_T = 0.06;

/** Tiles on the back wall (z = 0) that get a window instead of plain wall. */
const BACK_WINDOWS = new Set([3, 4, 9, 10]);
/** Tiles on the left wall (x = 0) that get a window. */
const LEFT_WINDOWS = new Set([3, 4]);

const HALF_PI = Math.PI / 2;

function Floor() {
  return (
    <mesh rotation-x={-HALF_PI} position={[ROOM_W / 2, 0, ROOM_D / 2]} receiveShadow>
      <planeGeometry args={[ROOM_W, ROOM_D]} />
      <meshStandardMaterial color={FLOOR_COLOR} roughness={0.9} />
    </mesh>
  );
}

/** Solid wall runs between special tiles, as boxes merged into one mesh. */
function wallBoxes(axis: 'x' | 'z', length: number, gaps: Set<number>): BufferGeometry[] {
  const out: BufferGeometry[] = [];
  let runStart = 0;
  for (let i = 0; i <= length; i++) {
    if (i < length && !gaps.has(i)) continue;
    const len = i - runStart;
    if (len > 0) {
      const mid = runStart + len / 2;
      const box =
        axis === 'x'
          ? new BoxGeometry(len, WALL_H, WALL_T).translate(mid, WALL_H / 2, -WALL_T / 2)
          : new BoxGeometry(WALL_T, WALL_H, len).translate(-WALL_T / 2, WALL_H / 2, mid);
      out.push(box);
    }
    runStart = i + 1;
  }
  return out;
}

function Walls() {
  const geometry = useMemo(() => {
    const leftGaps = new Set([...LEFT_WINDOWS, DOOR_TILE_Z]);
    const boxes = [...wallBoxes('x', ROOM_W, BACK_WINDOWS), ...wallBoxes('z', ROOM_D, leftGaps)];
    const merged = mergeGeometries(boxes, false);
    boxes.forEach((b) => b.dispose());
    return merged;
  }, []);
  if (!geometry) return null;
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color={WALL_COLOR} roughness={0.95} />
    </mesh>
  );
}

function Whiteboard() {
  // Mounted on the back wall, built from primitives (the kit has no whiteboard).
  return (
    <group position={[6.6, 0.42, 0.03]}>
      <mesh castShadow>
        <boxGeometry args={[1.6, 0.72, 0.03]} />
        <meshStandardMaterial color="#8c9099" />
      </mesh>
      <mesh position={[0, 0, 0.018]}>
        <planeGeometry args={[1.52, 0.64]} />
        <meshStandardMaterial color="#f4f6f8" roughness={0.4} />
      </mesh>
    </group>
  );
}

/** Everything static that comes from the Kenney kit. Merged into a few meshes. */
const PLACEMENTS: Placement[] = [
  // Window and doorway tiles in the walls.
  ...[...BACK_WINDOWS].map((i): Placement => ({ name: 'wallWindow', position: [i, 0, 0] })),
  ...[...LEFT_WINDOWS].map((i): Placement => ({
    name: 'wallWindow',
    position: [0, 0, i + 1],
    rotationY: HALF_PI,
  })),
  { name: 'wallDoorway', position: [0, 0, DOOR_TILE_Z + 1], rotationY: HALF_PI },
  // Coffee corner, back-right.
  { name: 'kitchenBar', position: [11.2, 0, 0.25] },
  { name: 'kitchenBar', position: [11.63, 0, 0.25] },
  { name: 'kitchenFridgeSmall', position: [12.1, 0, 0.3] },
  { name: 'kitchenCoffeeMachine', position: [11.3, 0.42, 0.23] },
  { name: 'kitchenMicrowave', position: [11.65, 0.42, 0.25] },
  { name: 'trashcan', position: [13.2, 0, 0.35] },
  // Lounge, front-right (away from the door path).
  { name: 'rugRectangle', position: [11.2, 0.002, 9.7], castShadow: false },
  { name: 'loungeSofa', position: [12.5, 0, 9.55], rotationY: Math.PI },
  { name: 'tableCoffee', position: [11.6, 0, 8.75] },
  { name: 'loungeChair', position: [13.4, 0, 8.3], rotationY: -HALF_PI },
  // Decor.
  { name: 'bookcaseOpen', position: [0.3, 0, 1.6], rotationY: HALF_PI },
  { name: 'bookcaseOpen', position: [0.3, 0, 2.0], rotationY: HALF_PI },
  { name: 'books', position: [0.08, 0.45, 1.75], rotationY: HALF_PI },
  { name: 'pottedPlant', position: [0.35, 0, 0.35] },
  { name: 'pottedPlant', position: [0.35, 0, 9.6] },
  { name: 'pottedPlant', position: [5.2, 0, 0.35] },
  { name: 'pottedPlant', position: [8.8, 0, 0.35] },
  { name: 'coatRackStanding', position: [0.35, 0, 7.4] },
  { name: 'speaker', position: [13.6, 0, 3.0], rotationY: -HALF_PI },
];

export function Room() {
  return (
    <group>
      <Floor />
      <Walls />
      <MergedFurniture placements={PLACEMENTS} />
      {/* The door is separate so its leaf can swing open when agents walk through. */}
      <Door />
      <Whiteboard />
    </group>
  );
}

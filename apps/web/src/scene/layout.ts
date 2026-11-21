/**
 * Office layout in world units. Kenney furniture uses 1 unit = 1 floor tile; model origins sit at
 * a corner and extend toward -Z, so helpers below return the corner position for a tile.
 * The room spans x in [0, ROOM_W] and z in [0, ROOM_D]; y is up.
 */
export const ROOM_W = 14;
export const ROOM_D = 10;
export const WALL_H = 1.29;
export const ROOM_CENTER: [number, number, number] = [ROOM_W / 2, 0, ROOM_D / 2];

export const DESK_COLS = 4;
export const DESK_ROWS = 3;
export const DESK_COUNT = DESK_COLS * DESK_ROWS;

export interface DeskSlot {
  index: number;
  /** Desk front-left corner on the floor (Kenney desk origin). */
  position: [number, number, number];
  /** Where the agent sits (chair center). */
  seat: [number, number, number];
}

const DESK_ORIGIN_X = 2.4;
const DESK_ORIGIN_Z = 2.6;
const DESK_STEP_X = 2.6;
const DESK_STEP_Z = 2.4;

export function deskSlots(): DeskSlot[] {
  const slots: DeskSlot[] = [];
  for (let row = 0; row < DESK_ROWS; row++) {
    for (let col = 0; col < DESK_COLS; col++) {
      const x = DESK_ORIGIN_X + col * DESK_STEP_X;
      const z = DESK_ORIGIN_Z + row * DESK_STEP_Z;
      slots.push({
        index: slots.length,
        position: [x, 0, z],
        seat: [x + 0.36, 0, z + 0.28],
      });
    }
  }
  return slots;
}

/**
 * Walls are only built on the two far sides (z = 0 and x = 0), so the isometric camera at
 * +X/+Y/+Z sees into the room. The door is in the x = 0 wall.
 */
export const DOOR_TILE_Z = 8;
export const DOOR_POSITION: [number, number, number] = [0.5, 0, DOOR_TILE_Z + 0.5];

/** Points on the floor plane as [x, z]. */
export type FloorPoint = readonly [number, number];

/** Agents appear outside the door and walk in through it. */
export const DOOR_OUTSIDE: FloorPoint = [-0.7, DOOR_TILE_Z + 0.5];
export const DOOR_INSIDE: FloorPoint = [0.7, DOOR_TILE_Z + 0.5];

/** Desk chairs face -Z (toward the back wall); yaw 0 faces +Z. */
export const SEAT_YAW = Math.PI;
/** Distance behind the seat where the walk ends before sliding into the chair. */
const APPROACH_BACK = 0.32;

export function deskApproach(slot: DeskSlot): FloorPoint {
  return [slot.seat[0], slot.seat[2] + APPROACH_BACK];
}

/** Yaw that faces along a floor direction (yaw 0 faces +Z). */
export function yawFor(dx: number, dz: number): number {
  return Math.atan2(dx, dz);
}

interface Box {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

const box = (minX: number, minZ: number, maxX: number, maxZ: number): Box => ({
  minX,
  minZ,
  maxX,
  maxZ,
});
/** Square footprint around a Kenney prop origin (props extend toward +X and -Z from the origin). */
const prop = (x: number, z: number, size = 0.4): Box => box(x - 0.05, z - size, x + size, z + 0.05);

/**
 * Floor footprints that agents walk around. Desks block their own footprint only; chairs are not
 * blocked because agents slide into them at the end of the walk.
 */
export function obstacles(): Box[] {
  const desks = deskSlots().map((s) =>
    box(s.position[0] - 0.02, s.position[2] - 0.4, s.position[0] + 0.74, s.position[2] + 0.02),
  );
  return [
    ...desks,
    box(11.05, 0, 12.75, 0.75), // kitchen bar, fridge, coffee machine
    box(12.95, 0, 13.5, 0.55), // trash can
    box(11.2, 7.95, ROOM_W, ROOM_D), // lounge sofa, table and chair
    box(0, 1.0, 0.6, 2.2), // bookcases
    prop(0.35, 0.35),
    prop(0.35, 9.6),
    prop(5.2, 0.35),
    prop(8.8, 0.35),
    box(0.1, 7.0, 0.6, 7.5), // coat rack
    box(13.25, 2.55, ROOM_W, 3.2), // speaker
  ];
}

/** Places an idle agent wanders to, with the yaw to face when it arrives. */
export interface WanderSpot {
  name: string;
  point: FloorPoint;
  yaw: number;
}

export const WANDER_SPOTS: readonly WanderSpot[] = [
  { name: 'coffee', point: [11.55, 1.15], yaw: Math.PI },
  { name: 'fridge', point: [12.35, 1.15], yaw: Math.PI },
  { name: 'back window left', point: [3.5, 0.75], yaw: Math.PI },
  { name: 'back window right', point: [10.0, 0.75], yaw: Math.PI },
  { name: 'whiteboard', point: [7.4, 0.85], yaw: Math.PI },
  { name: 'plant', point: [5.4, 1.05], yaw: Math.PI },
  { name: 'left window', point: [0.75, 4.5], yaw: -Math.PI / 2 },
  { name: 'bookcase', point: [1.05, 1.6], yaw: -Math.PI / 2 },
  { name: 'lounge', point: [10.7, 8.7], yaw: Math.PI / 2 },
];

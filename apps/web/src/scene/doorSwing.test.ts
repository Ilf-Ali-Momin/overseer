import { describe, expect, it } from 'vitest';
import { DOOR_OPEN, dampDoor, doorTarget } from './doorSwing';

describe('door', () => {
  it('opens when an agent is near the doorway, closes otherwise', () => {
    expect(doorTarget([{ x: -0.7, z: 8.5 }])).toBe(DOOR_OPEN);
    expect(doorTarget([{ x: 0.7, z: 8.6 }])).toBe(DOOR_OPEN);
    expect(doorTarget([{ x: 4, z: 4 }])).toBe(0);
    expect(doorTarget([])).toBe(0);
  });

  it('swings smoothly toward the target', () => {
    let a = 0;
    for (let i = 0; i < 30; i++) a = dampDoor(a, DOOR_OPEN, 1 / 60);
    expect(a).toBeLessThan(0);
    expect(a).toBeGreaterThan(DOOR_OPEN);
    for (let i = 0; i < 300; i++) a = dampDoor(a, DOOR_OPEN, 1 / 60);
    expect(a).toBeCloseTo(DOOR_OPEN, 3);
  });
});

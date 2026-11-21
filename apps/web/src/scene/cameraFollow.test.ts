import { describe, expect, it } from 'vitest';
import { dampView } from './cameraFollow';

describe('dampView', () => {
  it('converges smoothly and independent of frame rate', () => {
    const goal = { x: 10, z: -4, zoom: 2 };
    const a = { x: 0, z: 0, zoom: 1 };
    const b = { x: 0, z: 0, zoom: 1 };
    for (let i = 0; i < 60; i++) dampView(a, goal, 1 / 60);
    for (let i = 0; i < 30; i++) dampView(b, goal, 1 / 30);
    expect(a.x).toBeCloseTo(b.x, 6);
    expect(a.x).toBeGreaterThan(9.5);
    expect(a.x).toBeLessThan(10);
    expect(a.zoom).toBeGreaterThan(1.9);
  });
});

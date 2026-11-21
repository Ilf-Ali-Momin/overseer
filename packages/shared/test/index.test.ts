import { describe, expect, it } from 'vitest';
import { OVERSEER_WS_PORT } from '../src/index';

describe('shared', () => {
  it('exposes the bridge WebSocket port', () => {
    expect(OVERSEER_WS_PORT).toBe(4317);
  });
});

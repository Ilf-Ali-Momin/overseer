import { describe, expect, it } from 'vitest';
import { clock } from '@/ui/Timeline';
import { DEMO_NAME, fetchDemo } from './demo';

describe('demo helpers', () => {
  it('accepts only plain demo names', () => {
    expect(DEMO_NAME.test('sample')).toBe(true);
    expect(DEMO_NAME.test('demo-1_a')).toBe(true);
    expect(DEMO_NAME.test('../secret')).toBe(false);
    expect(DEMO_NAME.test('a/b')).toBe(false);
  });

  it('rejects bad names before fetching', async () => {
    await expect(fetchDemo('../x')).rejects.toThrow(/bad demo name/);
  });

  it('formats timeline clock', () => {
    expect([0, 5_400, 65_000].map(clock)).toEqual(['0:00', '0:05', '1:05']);
  });
});

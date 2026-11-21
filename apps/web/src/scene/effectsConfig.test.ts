import { describe, expect, it } from 'vitest';
import { effectsFor } from './effectsConfig';

describe('effectsFor', () => {
  it('turns effects off on weak devices and on in full quality', () => {
    expect(effectsFor(0).enabled).toBe(false);
    expect(effectsFor(1)).toMatchObject({ bloom: true, smaa: false, vignette: false });
    expect(effectsFor(2)).toMatchObject({
      bloom: true,
      smaa: true,
      vignette: true,
      multisampling: 0,
    });
  });
});

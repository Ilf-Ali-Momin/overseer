import { describe, expect, it } from 'vitest';
import { DEFAULT_DEMO, DEMOS, GRACE_MS, decideMode, isLocalHost, nextDemo } from './mode';

describe('decideMode', () => {
  const base = {
    choice: 'auto' as const,
    status: 'connecting' as const,
    current: 'waiting' as const,
    notOpenFor: 0,
  };

  it('auto: live when the bridge is open', () => {
    expect(decideMode({ ...base, status: 'open' })).toBe('live');
  });

  it('auto: waits during the grace period, then falls back to the demo', () => {
    expect(decideMode({ ...base, notOpenFor: GRACE_MS - 1 })).toBe('waiting');
    expect(decideMode({ ...base, status: 'closed', notOpenFor: GRACE_MS })).toBe('demo');
  });

  it('auto: a short drop keeps the live office', () => {
    expect(decideMode({ ...base, status: 'closed', current: 'live', notOpenFor: 500 })).toBe(
      'live',
    );
  });

  it('auto: goes live again when the bridge opens during a demo', () => {
    expect(decideMode({ ...base, status: 'open', current: 'demo' })).toBe('live');
  });

  it('manual choice wins', () => {
    expect(decideMode({ ...base, choice: 'demo', status: 'open' })).toBe('demo');
    expect(decideMode({ ...base, choice: 'live', status: 'closed', notOpenFor: 99_999 })).toBe(
      'live',
    );
  });
});

describe('demo list', () => {
  it('starts with the team demo and cycles', () => {
    expect(DEFAULT_DEMO).toBe('team');
    expect(nextDemo('team')).toBe('risk');
    expect(nextDemo(DEMOS[DEMOS.length - 1]!)).toBe('team');
    expect(nextDemo('unknown')).toBe('team');
  });
});

describe('isLocalHost', () => {
  it('treats this machine as local and anything else as deployed', () => {
    for (const h of ['localhost', '127.0.0.1', '[::1]', 'app.localhost'])
      expect(isLocalHost(h)).toBe(true);
    for (const h of ['overseer.vercel.app', 'example.com', '192.168.1.5'])
      expect(isLocalHost(h)).toBe(false);
  });
});

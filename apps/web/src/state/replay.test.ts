import type { AgentEvent, DemoFile } from '@overseer/shared';
import { describe, expect, it } from 'vitest';
import { compressGaps, createReplay } from './replay';

const ev = (
  id: string,
  ts: number,
  agentId = 'a',
  kind: AgentEvent['kind'] = 'thinking',
): AgentEvent => ({
  id,
  ts,
  sessionId: 'demo-session',
  agentId,
  project: 'demo-app',
  kind,
});

const demo = (events: AgentEvent[]): DemoFile => ({
  version: 1,
  name: 'test',
  durationMs: events.at(-1)?.ts ?? 0,
  events,
});

function setup(events: AgentEvent[], opts = {}) {
  let clock = 1_000_000;
  const applied: AgentEvent[] = [];
  let resets = 0;
  const r = createReplay(
    demo(events),
    {
      now: () => clock,
      apply: (evs) => applied.push(...evs),
      reset: () => {
        resets++;
        applied.length = 0;
      },
    },
    opts,
  );
  const advance = (ms: number) => {
    clock += ms;
    r.tick();
  };
  return { r, applied, advance, resets: () => resets, clock: () => clock };
}

const EVENTS = [ev('1', 0), ev('2', 1000), ev('3', 2000), ev('4', 4000)];

describe('compressGaps', () => {
  it('shortens long gaps only', () => {
    expect(
      compressGaps([ev('1', 0), ev('2', 1000), ev('3', 61_000)], 8000).map((e) => e.ts),
    ).toEqual([0, 1000, 9000]);
  });
});

describe('replay', () => {
  it('applies events in order at real speed, dated to the wall clock', () => {
    const { r, applied, advance, clock } = setup(EVENTS);
    expect(r.duration).toBe(4000);
    r.play();
    advance(0);
    expect(applied.map((e) => e.id)).toEqual(['1']);
    advance(1500);
    expect(applied.map((e) => e.id)).toEqual(['1', '2']);
    // Event 2 happened 500 ms ago on the wall clock.
    expect(applied[1]!.ts).toBe(clock() - 500);
  });

  it('plays faster at 4x and stops while paused', () => {
    const { r, applied, advance } = setup(EVENTS);
    r.setSpeed(4);
    r.play();
    advance(600); // 2400 demo ms
    expect(applied.map((e) => e.id)).toEqual(['1', '2', '3']);
    r.pause();
    advance(10_000);
    expect(applied).toHaveLength(3);
    expect(r.position()).toBe(2400);
    r.play();
    advance(400); // +1600 -> 4000
    expect(applied).toHaveLength(4);
  });

  it('seek rebuilds the office from the events up to the target', () => {
    const { r, applied, resets } = setup(
      [
        ...EVENTS,
        ev('5', 1500, 'sub', 'subagent_spawn'),
        ev('6', 1800, 'sub', 'subagent_end'),
      ].sort((a, b) => a.ts - b.ts),
    );
    r.seek(2500);
    expect(resets()).toBe(1);
    // The subagent that already ended is skipped.
    expect(applied.map((e) => e.id)).toEqual(['1', '2', '3']);
    expect(r.position()).toBe(2500);
  });

  it('loops after a pause at the end', () => {
    const { r, applied, advance, resets } = setup(EVENTS, { loopPause: 1000 });
    r.play();
    advance(4000);
    expect(applied).toHaveLength(4);
    advance(500);
    expect(resets()).toBe(0);
    advance(600);
    expect(resets()).toBe(1);
    expect(r.position()).toBe(0);
    advance(0);
    expect(applied.map((e) => e.id)).toEqual(['1']);
  });

  it('stops at the end without looping when loopPause is null', () => {
    const { r, advance } = setup(EVENTS, { loopPause: null });
    r.play();
    advance(5000);
    expect(r.playing()).toBe(false);
    expect(r.position()).toBe(4000);
  });

  it('calls onEnd instead of looping when given', () => {
    let ended = 0;
    const { r, advance, resets } = setup(EVENTS, { loopPause: 1000, onEnd: () => ended++ });
    r.play();
    advance(4000);
    advance(1100);
    expect(ended).toBe(1);
    expect(resets()).toBe(0);
    expect(r.playing()).toBe(false);
    advance(5000);
    expect(ended).toBe(1);
  });
});

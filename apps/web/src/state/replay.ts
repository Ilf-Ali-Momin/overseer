import type { AgentEvent, DemoFile } from '@overseer/shared';

/**
 * Replay engine for a recorded demo. Framework free and clock driven: call `tick()` regularly
 * (e.g. every animation frame); it applies every event whose demo time has passed. Event `ts` is
 * rewritten to the wall-clock moment the event "happened", so the store's timers (idle, reactions)
 * behave as they would live.
 */

export type ReplaySpeed = 1 | 2 | 4;
export const SPEEDS: readonly ReplaySpeed[] = [1, 2, 4];

export interface ReplayDeps {
  now: () => number;
  apply: (events: AgentEvent[]) => void;
  /** Clear the office (before a seek or a loop). */
  reset: () => void;
}

export interface ReplayOptions {
  /** Idle gaps longer than this (demo ms) are shortened to it. */
  maxGap?: number;
  /** Wall ms to wait at the end before looping; null to stop at the end. */
  loopPause?: number | null;
  /** Called instead of looping, after `loopPause` (e.g. to play the next demo). */
  onEnd?: () => void;
}

export interface Replay {
  readonly duration: number;
  readonly name: string;
  play: () => void;
  pause: () => void;
  playing: () => boolean;
  speed: () => ReplaySpeed;
  setSpeed: (s: ReplaySpeed) => void;
  /** Jump to a demo time (ms): the office is rebuilt from the events up to it. */
  seek: (ms: number) => void;
  /** Current demo time (ms). */
  position: () => number;
  tick: () => void;
}

const END_KINDS = new Set(['session_end', 'subagent_end']);

/** Events with long idle gaps shortened; `ts` becomes compressed demo time. */
export function compressGaps(events: readonly AgentEvent[], maxGap: number): AgentEvent[] {
  let shift = 0;
  return events.map((ev, i) => {
    if (i > 0) {
      const gap = ev.ts - events[i - 1]!.ts;
      if (gap > maxGap) shift += gap - maxGap;
    }
    return { ...ev, ts: ev.ts - shift };
  });
}

export function createReplay(demo: DemoFile, deps: ReplayDeps, opts: ReplayOptions = {}): Replay {
  const events = compressGaps(
    [...demo.events].sort((a, b) => a.ts - b.ts),
    opts.maxGap ?? 8000,
  );
  const duration = events.at(-1)?.ts ?? 0;
  const loopPause = opts.loopPause === undefined ? 3000 : opts.loopPause;

  let speed: ReplaySpeed = 1;
  let playing = false;
  /** Demo time at `wallAnchor`. */
  let posAnchor = 0;
  let wallAnchor = deps.now();
  /** Index of the next event to apply. */
  let next = 0;
  /** Wall time the end was reached (for looping). */
  let endedAt: number | null = null;

  const position = (): number => {
    if (!playing) return posAnchor;
    return Math.min(duration, posAnchor + (deps.now() - wallAnchor) * speed);
  };

  const anchor = () => {
    posAnchor = position();
    wallAnchor = deps.now();
  };

  /** Copy of an event dated to when it would have happened on the wall clock. */
  const dated = (ev: AgentEvent, pos: number, now: number): AgentEvent => ({
    ...ev,
    ts: now - (pos - ev.ts) / speed,
  });

  const seek = (ms: number) => {
    const target = Math.max(0, Math.min(duration, ms));
    deps.reset();
    const now = deps.now();
    let i = 0;
    while (i < events.length && events[i]!.ts <= target) i++;
    // Agents that already finished before the target would only walk in to walk out: skip them.
    const ended = new Set(
      events
        .slice(0, i)
        .filter((e) => END_KINDS.has(e.kind))
        .map((e) => e.agentId),
    );
    const past = events.slice(0, i).filter((e) => !ended.has(e.agentId));
    if (past.length) deps.apply(past.map((e) => dated(e, target, now)));
    next = i;
    posAnchor = target;
    wallAnchor = now;
    endedAt = null;
  };

  const tick = () => {
    if (!playing) return;
    const now = deps.now();
    const pos = position();
    const due: AgentEvent[] = [];
    while (next < events.length && events[next]!.ts <= pos) {
      due.push(dated(events[next]!, pos, now));
      next++;
    }
    if (due.length) deps.apply(due);
    if (pos >= duration && next >= events.length) {
      if (loopPause === null) {
        anchor();
        playing = false;
        return;
      }
      endedAt ??= now;
      if (now - endedAt >= loopPause) {
        if (opts.onEnd) {
          playing = false;
          opts.onEnd();
        } else {
          seek(0);
        }
      }
    }
  };

  return {
    duration,
    name: demo.name,
    play: () => {
      if (playing) return;
      if (position() >= duration && next >= events.length) seek(0);
      wallAnchor = deps.now();
      playing = true;
    },
    pause: () => {
      if (!playing) return;
      anchor();
      playing = false;
    },
    playing: () => playing,
    speed: () => speed,
    setSpeed: (s) => {
      anchor();
      speed = s;
    },
    seek,
    position,
    tick,
  };
}

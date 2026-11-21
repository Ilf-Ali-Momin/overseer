import type { AgentEvent } from './events';

/**
 * Visual state machine (docs/ARCHITECTURE.md section 3). Pure: events and the clock in, a visual
 * state out. Movement (walking to a desk, wandering) is handled by the scene, not here.
 */
export const VISUAL_STATES = [
  'reading',
  'typing',
  'terminal',
  'browsing',
  'delegating',
  'thinking',
  'waiting',
  'frustrated',
  'celebrating',
  'idle',
  'leaving',
] as const;
export type VisualState = (typeof VISUAL_STATES)[number];

/** No events for this long: the agent stands up and wanders. */
export const IDLE_AFTER_MS = 45_000;
/** No events for this long: the agent leaves (same as the bridge's session sweep). */
export const LEAVE_AFTER_MS = 10 * 60_000;
/** Frustrated and celebrating are short reactions; after this the agent goes back to its base state. */
export const REACTION_MS = 4_000;

/** Tool name -> visual state. Unknown tools map to `typing`. Extend here. */
export const TOOL_STATE: Readonly<Record<string, VisualState>> = {
  Read: 'reading',
  Grep: 'reading',
  Glob: 'reading',
  LS: 'reading',
  Edit: 'typing',
  Write: 'typing',
  MultiEdit: 'typing',
  NotebookEdit: 'typing',
  Bash: 'terminal',
  WebFetch: 'browsing',
  WebSearch: 'browsing',
  Task: 'delegating',
  Agent: 'delegating',
  AskUserQuestion: 'waiting',
};

export function toolState(toolName: string): VisualState {
  return Object.hasOwn(TOOL_STATE, toolName) ? TOOL_STATE[toolName]! : 'typing';
}

const REACTIONS: ReadonlySet<VisualState> = new Set(['frustrated', 'celebrating']);

export interface VisualMachine {
  /** State set by the latest event. */
  state: VisualState;
  /** State to return to when a reaction (frustrated / celebrating) ends. */
  base: VisualState;
  /** When `state` was entered (epoch ms). */
  since: number;
  /** Timestamp of the latest event (epoch ms). */
  lastEventTs: number;
}

export function initialMachine(ts: number): VisualMachine {
  return { state: 'thinking', base: 'thinking', since: ts, lastEventTs: ts };
}

function enter(
  m: VisualMachine,
  state: VisualState,
  ts: number,
  base?: VisualState,
): VisualMachine {
  const nextBase = base ?? (REACTIONS.has(state) ? m.base : state);
  const since = state === m.state ? m.since : ts;
  return { state, base: nextBase, since, lastEventTs: ts };
}

/** Apply one event. `leaving` is final. */
export function reduceEvent(m: VisualMachine, ev: AgentEvent): VisualMachine {
  if (m.state === 'leaving' || m.base === 'leaving') {
    return m.state === 'leaving' ? m : { ...m, lastEventTs: ev.ts };
  }
  const ts = ev.ts;
  switch (ev.kind) {
    case 'session_start':
    case 'subagent_spawn':
    case 'thinking':
    case 'message':
      return enter(m, 'thinking', ts);
    case 'tool_start':
      return enter(m, ev.tool ? toolState(ev.tool.name) : 'typing', ts);
    case 'tool_end':
      if (ev.tool?.isError || ev.text === 'tests failed') return enter(m, 'frustrated', ts);
      if (ev.text === 'tests passed') return enter(m, 'celebrating', ts);
      // A subagent's result is back: stop pointing and sit back down to read it.
      if (ev.tool && (ev.tool.name === 'Agent' || ev.tool.name === 'Task')) {
        return enter(m, 'thinking', ts);
      }
      // A finished tool keeps the pose until the next event; only the clock moves.
      return { ...m, lastEventTs: ts };
    case 'waiting_for_user':
      return enter(m, 'waiting', ts);
    case 'error':
      return enter(m, 'frustrated', ts);
    case 'subagent_end':
      return enter(m, 'celebrating', ts, 'leaving');
    case 'session_end':
      return enter(m, 'leaving', ts);
    default:
      return m;
  }
}

/** The state to show at `now`, applying reaction timeouts, idle and leaving timers. */
export function resolveState(m: VisualMachine, now: number): VisualState {
  if (m.state === 'leaving') return 'leaving';
  const quiet = now - m.lastEventTs;
  if (quiet >= LEAVE_AFTER_MS) return 'leaving';
  let state: VisualState = m.state;
  if (REACTIONS.has(state) && now - m.since >= REACTION_MS) state = m.base;
  if (state === 'leaving') return 'leaving';
  // Waiting keeps its raised hand until the user answers; everything else wanders off.
  if (state !== 'waiting' && quiet >= IDLE_AFTER_MS) return 'idle';
  return state;
}

/** Clips shipped with the Quaternius "Animated Human" model. */
export type ClipName = 'Idle' | 'Walk' | 'Run' | 'Working' | 'Jump' | 'Punch' | 'Death';

/** Procedural bone poses layered on top of the clip (the model has no sit / think / wave clips). */
export type PoseName =
  | 'none'
  | 'sitRead'
  | 'sitType'
  | 'sitLeanBack'
  | 'sitChin'
  | 'sitRaiseHand'
  | 'sitSlump'
  /** Brief reaction when a subagent's result comes back. */
  | 'sitReceive'
  | 'point'
  | 'cheer';

export interface StateAnimation {
  clip: ClipName;
  /** Character sits in its desk chair. */
  seated: boolean;
  pose: PoseName;
  /** Clip playback speed. */
  speed: number;
}

export const STATE_ANIMATION: Readonly<Record<VisualState, StateAnimation>> = {
  reading: { clip: 'Idle', seated: true, pose: 'sitRead', speed: 1 },
  typing: { clip: 'Idle', seated: true, pose: 'sitType', speed: 1.6 },
  terminal: { clip: 'Idle', seated: true, pose: 'sitType', speed: 1 },
  browsing: { clip: 'Idle', seated: true, pose: 'sitLeanBack', speed: 1 },
  delegating: { clip: 'Idle', seated: false, pose: 'point', speed: 1 },
  thinking: { clip: 'Idle', seated: true, pose: 'sitChin', speed: 0.8 },
  waiting: { clip: 'Idle', seated: true, pose: 'sitRaiseHand', speed: 1 },
  frustrated: { clip: 'Idle', seated: true, pose: 'sitSlump', speed: 0.6 },
  celebrating: { clip: 'Jump', seated: false, pose: 'cheer', speed: 1 },
  idle: { clip: 'Idle', seated: false, pose: 'none', speed: 1 },
  leaving: { clip: 'Walk', seated: false, pose: 'none', speed: 1 },
};

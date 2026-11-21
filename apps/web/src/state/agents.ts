import { create } from 'zustand';
import {
  type AgentEvent,
  type AgentSnapshot,
  LEAVE_AFTER_MS,
  type VisualMachine,
  initialMachine,
  reduceEvent,
} from '@overseer/shared';
import { DESK_COUNT, DOOR_INSIDE, deskSlots } from '@/scene/layout';

/** Events kept per agent for the inspector (same cap as the bridge). */
export const MAX_AGENT_EVENTS = 200;

/** One agent in the office: which desk it owns, its visual state machine and recent events. */
export interface OfficeAgent {
  id: string;
  project: string;
  parentAgentId?: string;
  /** For subagents: the parent's Agent tool_use id (its tool_end means the result is back). */
  spawnUseId?: string;
  title?: string;
  deskIndex: number;
  machine: VisualMachine;
  /** Latest events, oldest first, at most MAX_AGENT_EVENTS. Mutated in place. */
  events: AgentEvent[];
  /** Fake agents come from the debug panel, not the bridge. */
  fake: boolean;
}

interface AgentsState {
  agents: Record<string, OfficeAgent>;
  selectedId: string | null;
  /** Agent under the pointer. */
  hoveredId: string | null;
  /** Bumped once per applied batch so UI that shows events can subscribe to one number. */
  eventCount: number;
  /** Add an agent at the nearest free desk. Returns false when the office is full. */
  add: (id: string, project: string, ts: number, fake?: boolean, parentAgentId?: string) => boolean;
  /** Feed one event to its agent's state machine (adds the agent if needed). */
  apply: (ev: AgentEvent) => void;
  /** Feed a batch of events (one store notification for the whole batch). */
  applyMany: (evs: readonly AgentEvent[]) => void;
  /** Load the bridge snapshot sent on (re)connect. */
  loadSnapshot: (agents: readonly AgentSnapshot[], now?: number) => void;
  /** Remove an agent (after it walked out of the door). */
  remove: (id: string) => void;
  select: (id: string | null) => void;
  hover: (id: string | null) => void;
}

/** Desk indices sorted by walking distance from the door, nearest first. */
const DESK_ORDER: readonly number[] = deskSlots()
  .map((s) => ({
    i: s.index,
    d: Math.hypot(s.seat[0] - DOOR_INSIDE[0], s.seat[2] - DOOR_INSIDE[1]),
  }))
  .sort((a, b) => a.d - b.d)
  .map((s) => s.i);

const SLOTS = deskSlots();

export function pickDesk(taken: ReadonlySet<number>): number | null {
  for (const i of DESK_ORDER) if (!taken.has(i)) return i;
  return null;
}

/** Free desk closest to desk `near` (a subagent sits next to its parent). */
export function pickDeskNear(taken: ReadonlySet<number>, near: number): number | null {
  const at = SLOTS[near]?.seat;
  if (!at) return pickDesk(taken);
  let best: number | null = null;
  let bestD = Infinity;
  for (const s of SLOTS) {
    if (taken.has(s.index)) continue;
    const d = Math.hypot(s.seat[0] - at[0], s.seat[2] - at[2]);
    if (d < bestD) {
      bestD = d;
      best = s.index;
    }
  }
  return best;
}

/** Live subagents of an agent. */
export function childrenOf(
  agents: Readonly<Record<string, OfficeAgent>>,
  parentId: string,
): OfficeAgent[] {
  return Object.values(agents).filter((a) => a.parentAgentId === parentId);
}

const isEnd = (ev: AgentEvent) => ev.kind === 'session_end' || ev.kind === 'subagent_end';

/** Feed one event; returns true when it was new. Mutates the agent in place. */
function feed(agent: OfficeAgent, ev: AgentEvent): boolean {
  if (agent.events.some((e) => e.id === ev.id)) return false;
  agent.events.push(ev);
  if (agent.events.length > MAX_AGENT_EVENTS) {
    agent.events.splice(0, agent.events.length - MAX_AGENT_EVENTS);
  }
  if (ev.parentAgentId) agent.parentAgentId = ev.parentAgentId;
  if (ev.kind === 'subagent_spawn' && ev.tool) agent.spawnUseId = ev.tool.useId;
  // Mutate in place: actors read machines every frame via getState(), and only the id list
  // drives React renders, so a new agents object per event would re-render for nothing.
  agent.machine = reduceEvent(agent.machine, ev);
  return true;
}

export const useAgentsStore = create<AgentsState>((set, get) => {
  /** Agent for an event, adding it when needed. Null when it should not (or cannot) enter. */
  const agentFor = (ev: AgentEvent): OfficeAgent | null => {
    const existing = get().agents[ev.agentId];
    if (existing) return existing;
    // An agent that already ended would only walk in to walk straight out.
    if (isEnd(ev)) return null;
    if (!get().add(ev.agentId, ev.project, ev.ts, false, ev.parentAgentId)) return null;
    return get().agents[ev.agentId]!;
  };

  const applyAll = (evs: readonly AgentEvent[]): boolean => {
    let changed = false;
    for (const ev of evs) {
      const agent = agentFor(ev);
      if (agent && feed(agent, ev)) changed = true;
    }
    return changed;
  };

  return {
    agents: {},
    selectedId: null,
    hoveredId: null,
    eventCount: 0,
    add: (id, project, ts, fake = false, parentAgentId) => {
      const { agents } = get();
      if (agents[id]) return true;
      if (Object.keys(agents).length >= DESK_COUNT) return false;
      const taken = new Set(Object.values(agents).map((a) => a.deskIndex));
      const parent = parentAgentId ? agents[parentAgentId] : undefined;
      const deskIndex = parent ? pickDeskNear(taken, parent.deskIndex) : pickDesk(taken);
      if (deskIndex === null) return false;
      const agent: OfficeAgent = {
        id,
        project,
        deskIndex,
        machine: initialMachine(ts),
        events: [],
        fake,
      };
      if (parentAgentId) agent.parentAgentId = parentAgentId;
      set({ agents: { ...agents, [id]: agent } });
      return true;
    },
    apply: (ev) => {
      if (applyAll([ev])) set({ eventCount: get().eventCount + 1 });
    },
    applyMany: (evs) => {
      if (applyAll(evs)) set({ eventCount: get().eventCount + 1 });
    },
    loadSnapshot: (snaps, now = Date.now()) => {
      const live = new Set<string>();
      const fresh: AgentEvent[] = [];
      for (const snap of snaps) {
        const last = snap.events.at(-1);
        if (!last) continue;
        live.add(snap.agentId);
        const known = get().agents[snap.agentId];
        // Skip sessions that ended or went quiet long ago, unless already in the office.
        if (!known && (isEnd(last) || now - last.ts >= LEAVE_AFTER_MS)) continue;
        fresh.push(...snap.events);
      }
      // Live agents the bridge no longer knows about walk out.
      for (const agent of Object.values(get().agents)) {
        if (agent.fake || live.has(agent.id)) continue;
        fresh.push({
          id: `${agent.id}:gone:${now}`,
          ts: now,
          sessionId: agent.id.split(':')[0]!,
          agentId: agent.id,
          project: agent.project,
          kind: agent.parentAgentId ? 'subagent_end' : 'session_end',
          text: 'gone from bridge',
        });
      }
      const changed = applyAll(fresh);
      for (const snap of snaps) {
        const agent = get().agents[snap.agentId];
        if (agent && snap.title) agent.title = snap.title;
      }
      if (changed) set({ eventCount: get().eventCount + 1 });
    },
    remove: (id) => {
      const { [id]: _gone, ...rest } = get().agents;
      set({
        agents: rest,
        ...(get().selectedId === id ? { selectedId: null } : {}),
        ...(get().hoveredId === id ? { hoveredId: null } : {}),
      });
    },
    select: (id) => set({ selectedId: id }),
    hover: (id) => set({ hoveredId: id }),
  };
});

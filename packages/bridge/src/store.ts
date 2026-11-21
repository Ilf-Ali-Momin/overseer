import { EventEmitter } from 'node:events';
import type { AgentEvent, AgentSnapshot } from '@overseer/shared';

export const MAX_EVENTS_PER_AGENT = 200;
export const END_AFTER_MS = 10 * 60 * 1000;

export interface AgentRecord {
  agentId: string;
  sessionId: string;
  parentAgentId?: string;
  project: string;
  title?: string;
  events: AgentEvent[];
  /** Wall clock time (ms) of the last event received. Drives inactivity. */
  lastSeen: number;
}

export interface StoreOptions {
  maxEvents?: number;
  endAfterMs?: number;
  now?: () => number;
}

export interface AgentMeta {
  title?: string | undefined;
}

export interface StoreEvents {
  event: [event: AgentEvent];
}

/**
 * Keeps the active agents and their recent events. Inactivity is measured on wall clock receipt
 * time (not transcript timestamps), so sessions loaded at startup get a full grace period.
 */
export class SessionStore extends EventEmitter<StoreEvents> {
  private readonly agents = new Map<string, AgentRecord>();
  private readonly maxEvents: number;
  private readonly endAfterMs: number;
  private readonly now: () => number;
  private endCounter = 0;

  constructor(opts: StoreOptions = {}) {
    super();
    this.maxEvents = opts.maxEvents ?? MAX_EVENTS_PER_AGENT;
    this.endAfterMs = opts.endAfterMs ?? END_AFTER_MS;
    this.now = opts.now ?? Date.now;
  }

  add(events: AgentEvent[], meta: AgentMeta = {}): void {
    for (const ev of events) {
      let rec = this.agents.get(ev.agentId);
      if (!rec) {
        rec = {
          agentId: ev.agentId,
          sessionId: ev.sessionId,
          project: ev.project,
          events: [],
          lastSeen: this.now(),
        };
        if (ev.parentAgentId) rec.parentAgentId = ev.parentAgentId;
        this.agents.set(ev.agentId, rec);
      }
      if (meta.title) rec.title = meta.title;
      rec.project = ev.project;
      rec.lastSeen = this.now();
      rec.events.push(ev);
      if (rec.events.length > this.maxEvents)
        rec.events.splice(0, rec.events.length - this.maxEvents);
      this.emit('event', ev);
      if (ev.kind === 'subagent_end' || ev.kind === 'session_end') this.agents.delete(ev.agentId);
    }
  }

  get(agentId: string): AgentRecord | undefined {
    return this.agents.get(agentId);
  }

  get size(): number {
    return this.agents.size;
  }

  snapshot(): AgentSnapshot[] {
    return [...this.agents.values()].map((r) => {
      const snap: AgentSnapshot = {
        agentId: r.agentId,
        sessionId: r.sessionId,
        project: r.project,
        events: [...r.events],
      };
      if (r.parentAgentId) snap.parentAgentId = r.parentAgentId;
      if (r.title) snap.title = r.title;
      return snap;
    });
  }

  /** Emit `session_end` (or `subagent_end`) for agents idle longer than the limit. */
  sweep(): AgentEvent[] {
    const now = this.now();
    const ended: AgentEvent[] = [];
    for (const rec of [...this.agents.values()]) {
      if (now - rec.lastSeen < this.endAfterMs) continue;
      const ev: AgentEvent = {
        id: `${rec.agentId}:end:${++this.endCounter}`,
        ts: now,
        sessionId: rec.sessionId,
        agentId: rec.agentId,
        project: rec.project,
        kind: rec.parentAgentId ? 'subagent_end' : 'session_end',
        text: 'inactive',
      };
      if (rec.parentAgentId) ev.parentAgentId = rec.parentAgentId;
      ended.push(ev);
    }
    if (ended.length) this.add(ended);
    return ended;
  }
}

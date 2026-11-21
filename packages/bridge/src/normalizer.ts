import { basename } from 'node:path';
import { truncate, type AgentEvent, type Usage } from '@overseer/shared';
import type { ContentBlock, RawLine } from './parser';
import { redact } from './risk/redact';
import { assessRisk } from './risk/rules';
import { detectTestOutcome, summarizeTool } from './summary';

/** Tools that mean "the agent is blocked on the human". */
const WAITING_TOOLS = new Set(['AskUserQuestion']);

export interface NormalizerOptions {
  sessionId: string;
  /** Transcript agentId for subagent files; undefined for the main session file. */
  subagentId?: string;
  /** Fallback project name when lines carry no cwd. */
  project?: string;
  /** From the subagent's `.meta.json`: the parent's Agent tool_use id and task description. */
  spawn?: SubagentSpawn;
}

export interface SubagentSpawn {
  toolUseId: string;
  description?: string;
  agentType?: string;
}

/** Parse a subagent `.meta.json`; null when missing fields or invalid. Never throws. */
export function parseSubagentMeta(text: string): SubagentSpawn | null {
  try {
    const raw: unknown = JSON.parse(text);
    if (!raw || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    if (typeof o.toolUseId !== 'string' || !o.toolUseId) return null;
    const spawn: SubagentSpawn = { toolUseId: o.toolUseId };
    if (typeof o.description === 'string') spawn.description = o.description;
    if (typeof o.agentType === 'string') spawn.agentType = o.agentType;
    return spawn;
  } catch {
    return null;
  }
}

/** Wire agent id: main agent = sessionId, subagent = `<sessionId>:<agentId>`. */
export function agentIdFor(sessionId: string, subagentId?: string): string {
  return subagentId ? `${sessionId}:${subagentId}` : sessionId;
}

function resultText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((b) =>
        b && typeof b === 'object' && 'text' in b && typeof b.text === 'string' ? b.text : '',
      )
      .join('\n');
  }
  return '';
}

/**
 * Turns the raw lines of ONE transcript file into AgentEvents. Stateful: it remembers tool names
 * by tool_use id (for tool_end), counts usage once per API message id, and emits session_start
 * (or subagent_spawn) on the first meaningful line.
 */
export class SessionNormalizer {
  readonly sessionId: string;
  readonly agentId: string;
  readonly parentAgentId: string | undefined;
  project: string;
  title: string | undefined;
  cwd: string | undefined;

  private readonly spawn: SubagentSpawn | undefined;
  private started = false;
  private lastTs = 0;
  private readonly tools = new Map<string, { name: string; summary: string }>();
  private readonly seenMessages = new Set<string>();

  constructor(opts: NormalizerOptions) {
    this.sessionId = opts.sessionId;
    this.agentId = agentIdFor(opts.sessionId, opts.subagentId);
    this.parentAgentId = opts.subagentId ? opts.sessionId : undefined;
    this.project = opts.project ?? 'unknown';
    this.spawn = opts.spawn;
  }

  get isSubagent(): boolean {
    return this.parentAgentId !== undefined;
  }

  push(line: RawLine): AgentEvent[] {
    if (line.type === 'custom-title' && line.customTitle) {
      this.title = truncate(line.customTitle, 80);
      return [];
    }
    if (line.type !== 'user' && line.type !== 'assistant' && line.type !== 'system') return [];
    if (!line.uuid) return [];

    if (line.cwd) {
      this.cwd = line.cwd;
      this.project = basename(line.cwd) || this.project;
    }
    const ts = this.timestamp(line.timestamp);
    const out: AgentEvent[] = [];
    const make = (
      suffix: string,
      kind: AgentEvent['kind'],
      extra: Partial<AgentEvent> = {},
    ): AgentEvent => {
      const ev: AgentEvent = {
        id: suffix ? `${line.uuid}:${suffix}` : (line.uuid as string),
        ts,
        sessionId: this.sessionId,
        agentId: this.agentId,
        project: this.project,
        kind,
        ...extra,
      };
      if (this.parentAgentId) ev.parentAgentId = this.parentAgentId;
      return ev;
    };

    if (!this.started && (line.type === 'user' || line.type === 'assistant')) {
      this.started = true;
      if (this.isSubagent && this.spawn) {
        // Link to the parent's Agent tool call: its tool_end is the "result received" moment.
        const summary = truncate(
          redact(this.spawn.description ?? this.spawn.agentType ?? 'subagent'),
        );
        out.push(
          make('start', 'subagent_spawn', {
            text: summary,
            tool: { name: 'Agent', useId: this.spawn.toolUseId, summary },
          }),
        );
      } else {
        out.push(make('start', this.isSubagent ? 'subagent_spawn' : 'session_start'));
      }
    }

    if (line.type === 'system') {
      if (line.subtype === 'api_error') out.push(make('', 'error', { text: 'API error' }));
      return out;
    }

    const content = line.message?.content;
    if (line.type === 'user') {
      if (!Array.isArray(content)) return out;
      for (const [i, block] of content.entries()) {
        if (block.type === 'tool_result') out.push(this.toolEnd(block, make, i));
      }
      return out;
    }

    // assistant: one block per line in practice, but handle several.
    const usage = this.usageOnce(line);
    const blocks: ContentBlock[] = Array.isArray(content) ? content : [];
    for (const [i, block] of blocks.entries()) {
      const suffix = blocks.length > 1 ? String(i) : '';
      let ev: AgentEvent | undefined;
      if (block.type === 'thinking') {
        ev = make(
          suffix,
          'thinking',
          block.thinking ? { text: truncate(redact(block.thinking)) } : {},
        );
      } else if (block.type === 'text') {
        const text = truncate(redact(block.text ?? ''));
        ev = line.isApiErrorMessage
          ? make(suffix, 'error', { text: text || 'API error' })
          : make(suffix, 'message', text ? { text } : {});
      } else if (block.type === 'tool_use' && block.id && block.name) {
        // Redact before anything leaves the bridge: commands can carry keys and tokens.
        const summary = truncate(redact(summarizeTool(block.name, block.input, this.cwd)));
        this.tools.set(block.id, { name: block.name, summary });
        ev = make(suffix, 'tool_start', { tool: { name: block.name, useId: block.id, summary } });
        const risk = assessRisk(block.name, block.input, this.cwd);
        if (risk.level !== 'none') ev.risk = risk;
        if (WAITING_TOOLS.has(block.name)) {
          out.push(ev);
          ev = make(`${suffix}wait`, 'waiting_for_user', { text: summary });
        }
      }
      if (ev) out.push(ev);
    }
    if (usage) {
      const first = out.find((e) => e.kind !== 'session_start' && e.kind !== 'subagent_spawn');
      if (first) first.usage = usage;
    }
    if (line.message?.stop_reason === 'end_turn') {
      out.push(make('end', this.isSubagent ? 'subagent_end' : 'waiting_for_user'));
    }
    return out;
  }

  private toolEnd(
    block: ContentBlock,
    make: (suffix: string, kind: AgentEvent['kind'], extra?: Partial<AgentEvent>) => AgentEvent,
    index: number,
  ): AgentEvent {
    const useId = block.tool_use_id ?? 'unknown';
    const known = this.tools.get(useId);
    this.tools.delete(useId);
    const name = known?.name ?? 'unknown';
    const isError = block.is_error === true;
    const ev = make(index > 0 ? `r${index}` : '', 'tool_end', {
      tool: { name, useId, summary: known?.summary ?? name, ...(isError ? { isError } : {}) },
    });
    if (name === 'Bash') {
      const outcome = detectTestOutcome(resultText(block.content));
      if (outcome) ev.text = outcome;
    }
    return ev;
  }

  private usageOnce(line: RawLine): Usage | undefined {
    const msg = line.message;
    if (!msg?.usage) return undefined;
    const key = msg.id ?? line.uuid ?? '';
    if (this.seenMessages.has(key)) return undefined;
    this.seenMessages.add(key);
    const u = msg.usage;
    const input =
      (u.input_tokens ?? 0) +
      (u.cache_creation_input_tokens ?? 0) +
      (u.cache_read_input_tokens ?? 0);
    const usage: Usage = { inputTokens: input, outputTokens: u.output_tokens ?? 0 };
    if (u.cache_read_input_tokens) usage.cacheReadTokens = u.cache_read_input_tokens;
    if (u.cache_creation_input_tokens) usage.cacheWriteTokens = u.cache_creation_input_tokens;
    if (msg.model) usage.model = msg.model.slice(0, 64);
    return usage;
  }

  private timestamp(iso: string | undefined): number {
    const parsed = iso ? Date.parse(iso) : NaN;
    if (!Number.isNaN(parsed)) this.lastTs = parsed;
    return this.lastTs;
  }
}

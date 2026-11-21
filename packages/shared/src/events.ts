import { z } from 'zod';

/** Max length of any human readable summary sent over the wire. */
export const SUMMARY_MAX = 140;

export const AgentEventKindSchema = z.enum([
  'session_start',
  'session_end',
  'thinking',
  'message',
  'tool_start',
  'tool_end',
  'subagent_spawn',
  'subagent_end',
  'waiting_for_user',
  'error',
]);
export type AgentEventKind = z.infer<typeof AgentEventKindSchema>;

export const RiskLevelSchema = z.enum(['none', 'low', 'medium', 'high']);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const RiskAssessmentSchema = z.object({
  level: RiskLevelSchema,
  reasons: z.array(z.string()),
  verdict: z.string().optional(),
});
export type RiskAssessment = z.infer<typeof RiskAssessmentSchema>;

export const ToolInfoSchema = z.object({
  name: z.string(),
  useId: z.string(),
  summary: z.string().max(SUMMARY_MAX),
  isError: z.boolean().optional(),
});
export type ToolInfo = z.infer<typeof ToolInfoSchema>;

export const UsageSchema = z.object({
  /** All input tokens, including the cached ones below. */
  inputTokens: z.number().nonnegative().optional(),
  outputTokens: z.number().nonnegative().optional(),
  /** Part of inputTokens read from the prompt cache (billed at ~0.1x). */
  cacheReadTokens: z.number().nonnegative().optional(),
  /** Part of inputTokens written to the prompt cache (billed at ~1.25x). */
  cacheWriteTokens: z.number().nonnegative().optional(),
  /** Model id from the transcript, e.g. `claude-opus-5-5`. */
  model: z.string().max(64).optional(),
});
export type Usage = z.infer<typeof UsageSchema>;

export const AgentEventSchema = z.object({
  /** Stable id, derived from the transcript line uuid. */
  id: z.string().min(1),
  /** Epoch ms. */
  ts: z.number(),
  sessionId: z.string().min(1),
  /** sessionId for the main agent, `<sessionId>:<agentId>` for subagents. */
  agentId: z.string().min(1),
  parentAgentId: z.string().optional(),
  /** Readable project name (basename of the session cwd). */
  project: z.string(),
  kind: AgentEventKindSchema,
  tool: ToolInfoSchema.optional(),
  /** Short summary, never full content. */
  text: z.string().max(SUMMARY_MAX).optional(),
  risk: RiskAssessmentSchema.optional(),
  usage: UsageSchema.optional(),
});
export type AgentEvent = z.infer<typeof AgentEventSchema>;

/** Snapshot of one agent sent to a client on connect. */
export const AgentSnapshotSchema = z.object({
  agentId: z.string(),
  sessionId: z.string(),
  parentAgentId: z.string().optional(),
  project: z.string(),
  title: z.string().optional(),
  events: z.array(AgentEventSchema),
});
export type AgentSnapshot = z.infer<typeof AgentSnapshotSchema>;

export const ServerMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('snapshot'),
    payload: z.object({ agents: z.array(AgentSnapshotSchema) }),
  }),
  z.object({ type: z.literal('event'), payload: AgentEventSchema }),
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;

/** Cut a string to `max` chars on one line, adding an ellipsis when cut. */
export function truncate(input: string, max = SUMMARY_MAX): string {
  const oneLine = input.replace(/\s+/g, ' ').trim();
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max - 1)}…`;
}

/** Parse an untrusted WS message. Returns null when invalid instead of throwing. */
export function parseServerMessage(raw: unknown): ServerMessage | null {
  const result = ServerMessageSchema.safeParse(raw);
  return result.success ? result.data : null;
}

/** A recorded, redacted session for demo mode (`apps/web/public/demo/<name>.json`). */
export const DemoFileSchema = z.object({
  version: z.literal(1),
  name: z.string(),
  title: z.string().optional(),
  /** Time from the first to the last event, in ms. */
  durationMs: z.number().nonnegative(),
  /** Events with `ts` relative to the start (first event at 0), sorted by `ts`. */
  events: z.array(AgentEventSchema),
});
export type DemoFile = z.infer<typeof DemoFileSchema>;

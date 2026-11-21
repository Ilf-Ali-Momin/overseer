import { z } from 'zod';

/**
 * Parser for Claude Code transcript lines (see docs/ARCHITECTURE.md section 1).
 * Only the fields Overseer needs are typed; everything else passes through untouched.
 * A line that is not JSON, or not an object with a string `type`, returns null. Never throws.
 */

const ContentBlockSchema = z.looseObject({
  type: z.string(),
  // text
  text: z.string().optional(),
  // thinking
  thinking: z.string().optional(),
  // tool_use
  id: z.string().optional(),
  name: z.string().optional(),
  input: z.unknown().optional(),
  // tool_result
  tool_use_id: z.string().optional(),
  is_error: z.boolean().optional(),
  content: z.unknown().optional(),
});
export type ContentBlock = z.infer<typeof ContentBlockSchema>;

const UsageSchema = z.looseObject({
  input_tokens: z.number().optional(),
  output_tokens: z.number().optional(),
  cache_creation_input_tokens: z.number().optional(),
  cache_read_input_tokens: z.number().optional(),
});

const MessageSchema = z.looseObject({
  id: z.string().optional(),
  role: z.string().optional(),
  content: z.union([z.string(), z.array(ContentBlockSchema)]).optional(),
  stop_reason: z.string().nullable().optional(),
  model: z.string().optional(),
  usage: UsageSchema.optional(),
});

const RawLineSchema = z.looseObject({
  type: z.string(),
  uuid: z.string().optional(),
  parentUuid: z.string().nullable().optional(),
  sessionId: z.string().optional(),
  timestamp: z.string().optional(),
  cwd: z.string().optional(),
  agentId: z.string().optional(),
  isSidechain: z.boolean().optional(),
  isMeta: z.boolean().optional(),
  isApiErrorMessage: z.boolean().optional(),
  subtype: z.string().optional(),
  customTitle: z.string().optional(),
  agentName: z.string().optional(),
  message: MessageSchema.optional(),
});
export type RawLine = z.infer<typeof RawLineSchema>;

export function parseLine(line: string): RawLine | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let json: unknown;
  try {
    json = JSON.parse(trimmed);
  } catch {
    return null;
  }
  const result = RawLineSchema.safeParse(json);
  return result.success ? result.data : null;
}

/** Parse a chunk of JSONL text. Bad lines are skipped. */
export function parseLines(text: string): RawLine[] {
  const out: RawLine[] = [];
  for (const line of text.split('\n')) {
    const parsed = parseLine(line);
    if (parsed) out.push(parsed);
  }
  return out;
}

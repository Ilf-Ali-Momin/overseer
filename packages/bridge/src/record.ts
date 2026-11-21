import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { type AgentEvent, type DemoFile, DemoFileSchema } from '@overseer/shared';
import { SessionNormalizer, parseSubagentMeta } from './normalizer';
import { parseLines } from './parser';
import { defaultClaudeDir } from './watcher';

/**
 * `pnpm record <sessionId>`: turn one Claude Code session (plus its subagents) into a demo file.
 * Lines go through the real normalizer, so only short redacted summaries are kept; raw transcript
 * lines are never copied. Ids and project names are replaced so the file identifies no one.
 */

export interface TranscriptInput {
  /** Transcript agentId for subagent files; undefined for the main session. */
  subagentId?: string;
  text: string;
  /** Raw `.meta.json` text for subagents. */
  meta?: string;
}

export interface BuildOptions {
  sessionId: string;
  name: string;
  title?: string;
  project?: string;
}

export function buildDemo(inputs: readonly TranscriptInput[], opts: BuildOptions): DemoFile {
  const events: AgentEvent[] = [];
  for (const input of inputs) {
    const spawn = input.meta ? parseSubagentMeta(input.meta) : null;
    const n = new SessionNormalizer({
      sessionId: opts.sessionId,
      ...(input.subagentId ? { subagentId: input.subagentId } : {}),
      ...(spawn ? { spawn } : {}),
    });
    for (const line of parseLines(input.text)) events.push(...n.push(line));
  }
  events.sort((a, b) => a.ts - b.ts);

  // Stable anonymous ids.
  const agentIds = new Map<string, string>();
  const useIds = new Map<string, string>();
  const session = 'demo-session';
  const agent = (id: string): string => {
    let out = agentIds.get(id);
    if (!out) {
      out = id === opts.sessionId ? session : `${session}:agent-${agentIds.size}`;
      agentIds.set(id, out);
    }
    return out;
  };
  agent(opts.sessionId);
  const useId = (id: string): string => {
    let out = useIds.get(id);
    if (!out) {
      out = `tu-${useIds.size + 1}`;
      useIds.set(id, out);
    }
    return out;
  };

  const start = events[0]?.ts ?? 0;
  const project = opts.project ?? 'demo-app';
  const out = events.map((ev, i): AgentEvent => {
    const e: AgentEvent = {
      ...ev,
      id: `e${i + 1}`,
      ts: ev.ts - start,
      sessionId: session,
      agentId: agent(ev.agentId),
      project,
    };
    if (ev.parentAgentId) e.parentAgentId = agent(ev.parentAgentId);
    if (ev.tool) e.tool = { ...ev.tool, useId: useId(ev.tool.useId) };
    return e;
  });

  return DemoFileSchema.parse({
    version: 1,
    name: opts.name,
    ...(opts.title ? { title: opts.title } : {}),
    durationMs: out.at(-1)?.ts ?? 0,
    events: out,
  });
}

/** Read a session's main transcript and subagent transcripts from the projects folder. */
export function readSession(root: string, sessionId: string): TranscriptInput[] {
  for (const folder of readdirSync(root)) {
    const main = join(root, folder, `${sessionId}.jsonl`);
    if (!existsSync(main)) continue;
    const inputs: TranscriptInput[] = [{ text: readFileSync(main, 'utf8') }];
    const subDir = join(root, folder, sessionId, 'subagents');
    if (existsSync(subDir)) {
      for (const f of readdirSync(subDir).sort()) {
        const m = /^agent-([A-Za-z0-9_-]+)\.jsonl$/.exec(f);
        if (!m) continue;
        const metaPath = join(subDir, `agent-${m[1]}.meta.json`);
        inputs.push({
          subagentId: m[1]!,
          text: readFileSync(join(subDir, f), 'utf8'),
          ...(existsSync(metaPath) ? { meta: readFileSync(metaPath, 'utf8') } : {}),
        });
      }
    }
    return inputs;
  }
  throw new Error(`session ${sessionId} not found under ${root}`);
}

const HELP = `Usage: pnpm record <sessionId> [--name demo-1] [--title "Fix the login bug"] [--out dir] [--dir root]

Writes apps/web/public/demo/<name>.json from a Claude Code session and its subagents.
Only short redacted summaries are kept; ids and the project name are replaced.
Review the file before publishing it.`;

function main(): void {
  const { values, positionals } = parseArgs({
    options: {
      name: { type: 'string' },
      title: { type: 'string' },
      out: { type: 'string' },
      dir: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: true,
  });
  const sessionId = positionals[0];
  if (values.help || !sessionId) {
    console.log(HELP);
    return;
  }
  const here = fileURLToPath(new URL('.', import.meta.url));
  const outDir = resolve(values.out ?? join(here, '../../../apps/web/public/demo'));
  const name = values.name ?? 'demo';
  const demo = buildDemo(readSession(values.dir ?? defaultClaudeDir(), sessionId), {
    sessionId,
    name,
    ...(values.title ? { title: values.title } : {}),
  });
  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, `${name}.json`);
  writeFileSync(file, `${JSON.stringify(demo)}\n`);
  const agents = new Set(demo.events.map((e) => e.agentId)).size;
  console.log(
    `[overseer-record] ${file}: ${demo.events.length} events, ${agents} agents, ${Math.round(demo.durationMs / 1000)} s`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

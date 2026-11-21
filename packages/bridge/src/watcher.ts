import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { watch, type FSWatcher } from 'chokidar';
import type { AgentEvent } from '@overseer/shared';
import { SessionNormalizer, type SubagentSpawn, parseSubagentMeta } from './normalizer';
import { parseLine } from './parser';
import { LineBuffer } from './tail';

export const DEFAULT_RECENT_MS = 30 * 60 * 1000;

export function defaultClaudeDir(): string {
  return process.env.OVERSEER_CLAUDE_DIR ?? join(homedir(), '.claude', 'projects');
}

export interface TranscriptFile {
  projectFolder: string;
  sessionId: string;
  /** Transcript agentId for subagent files. */
  subagentId?: string;
}

const UUIDISH = /^[0-9a-f-]{8,}$/i;

/**
 * Classify a path relative to the projects root:
 * - `<project>/<sessionId>.jsonl` (main session)
 * - `<project>/<sessionId>/subagents/agent-<agentId>.jsonl` (subagent)
 * Anything else returns null.
 */
export function classifyTranscript(relPath: string): TranscriptFile | null {
  const parts = relPath.split(sep).join('/').split('/');
  if (parts.length === 2) {
    const [projectFolder, file] = parts as [string, string];
    if (!file.endsWith('.jsonl')) return null;
    const sessionId = file.slice(0, -'.jsonl'.length);
    return UUIDISH.test(sessionId) ? { projectFolder, sessionId } : null;
  }
  if (parts.length === 4 && parts[2] === 'subagents') {
    const [projectFolder, sessionId, , file] = parts as [string, string, string, string];
    const m = /^agent-([A-Za-z0-9_-]+)\.jsonl$/.exec(file);
    if (!m || !UUIDISH.test(sessionId)) return null;
    return { projectFolder, sessionId, subagentId: m[1] as string };
  }
  return null;
}

/** Readable fallback name from the encoded folder (`-Users-me-my-app` -> `my-app`-ish). */
function folderName(projectFolder: string): string {
  const parts = projectFolder.split('-').filter(Boolean);
  return parts.at(-1) ?? projectFolder;
}

interface TailState {
  file: TranscriptFile;
  offset: number;
  buffer: LineBuffer;
  normalizer: SessionNormalizer;
  queue: Promise<void>;
}

export interface WatcherOptions {
  root?: string;
  /** Files modified within this window are read from the start on startup. Older ones are tailed. */
  recentMs?: number;
  /** Force the polling backend (tests, network drives). */
  polling?: boolean;
}

export interface WatcherEvents {
  events: [events: AgentEvent[], normalizer: SessionNormalizer];
  error: [error: unknown];
  ready: [];
}

/**
 * Watches Claude Code transcript files and emits normalized AgentEvents for new lines.
 * Implements the EventSourceAdapter idea from ARCHITECTURE.md section 1.
 */
export class TranscriptWatcher extends EventEmitter<WatcherEvents> {
  readonly root: string;
  private readonly recentMs: number;
  private readonly polling: boolean;
  private watcher: FSWatcher | undefined;
  private readonly tails = new Map<string, TailState>();
  private ready = false;

  constructor(opts: WatcherOptions = {}) {
    super();
    this.root = opts.root ?? defaultClaudeDir();
    this.recentMs = opts.recentMs ?? DEFAULT_RECENT_MS;
    this.polling = opts.polling ?? false;
  }

  async start(): Promise<void> {
    const startedAt = Date.now();
    const w = watch(this.root, {
      depth: 3,
      alwaysStat: true,
      ...(this.polling ? { backend: 'polling' as const, pollingInterval: 50 } : {}),
      ignored: (path, stats) => {
        if (!stats?.isFile()) return false;
        return classifyTranscript(relative(this.root, path)) === null;
      },
    });
    this.watcher = w;
    w.on('add', (path, stats) => {
      // During the initial scan, old files start at their end: only new lines are shown.
      const isOld = !this.ready && stats && startedAt - stats.mtimeMs > this.recentMs;
      this.track(path, isOld ? stats.size : 0);
    });
    w.on('change', (path) => this.track(path));
    w.on('unlink', (path) => this.tails.delete(path));
    w.on('error', (err) => this.emit('error', err));
    await new Promise<void>((resolve) => w.once('ready', () => resolve()));
    this.ready = true;
    await Promise.all([...this.tails.values()].map((t) => t.queue));
    this.emit('ready');
  }

  async stop(): Promise<void> {
    await this.watcher?.close();
    this.watcher = undefined;
  }

  /** Wait until every queued read has finished (handy in tests). */
  async idle(): Promise<void> {
    await Promise.all([...this.tails.values()].map((t) => t.queue));
  }

  private track(path: string, initialOffset = 0): void {
    let tail = this.tails.get(path);
    if (!tail) {
      const file = classifyTranscript(relative(this.root, path));
      if (!file) return;
      tail = {
        file,
        offset: initialOffset,
        buffer: new LineBuffer(),
        normalizer: new SessionNormalizer({
          sessionId: file.sessionId,
          project: folderName(file.projectFolder),
          ...(file.subagentId ? { subagentId: file.subagentId } : {}),
          ...spawnFor(path, file.subagentId),
        }),
        queue: Promise.resolve(),
      };
      this.tails.set(path, tail);
    }
    const t = tail;
    t.queue = t.queue
      .then(() => this.readNew(path, t))
      .catch((err: unknown) => {
        this.emit('error', err);
      });
  }

  private async readNew(path: string, t: TailState): Promise<void> {
    const { size } = await stat(path);
    if (size < t.offset) {
      // File was truncated or replaced: start over.
      t.offset = 0;
      t.buffer.reset();
    }
    if (size === t.offset) return;
    const handle = await open(path, 'r');
    try {
      const length = size - t.offset;
      const chunk = Buffer.alloc(length);
      const { bytesRead } = await handle.read(chunk, 0, length, t.offset);
      t.offset += bytesRead;
      const events: AgentEvent[] = [];
      for (const line of t.buffer.feed(chunk.subarray(0, bytesRead))) {
        const parsed = parseLine(line);
        if (parsed) events.push(...t.normalizer.push(parsed));
      }
      if (events.length) this.emit('events', events, t.normalizer);
    } finally {
      await handle.close();
    }
  }
}

/** Read `agent-<id>.meta.json` next to a subagent transcript, if present. */
function spawnFor(path: string, subagentId: string | undefined): { spawn?: SubagentSpawn } {
  if (!subagentId) return {};
  try {
    const spawn = parseSubagentMeta(readFileSync(path.replace(/\.jsonl$/, '.meta.json'), 'utf8'));
    return spawn ? { spawn } : {};
  } catch {
    return {};
  }
}

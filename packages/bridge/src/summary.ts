import { truncate } from '@overseer/shared';

/**
 * Builds the short, human readable summary for a tool call.
 * Only short identifiers (paths, commands, patterns, hosts) are used, never file contents.
 * Phase 6 adds redaction on top of this (risk/redact.ts).
 */

function str(input: unknown, key: string): string | undefined {
  if (input && typeof input === 'object' && key in input) {
    const v = (input as Record<string, unknown>)[key];
    return typeof v === 'string' ? v : undefined;
  }
  return undefined;
}

/** macOS reports some folders both with and without `/private` (`/var/...` is `/private/var/...`). */
const stripPrivate = (p: string): string => p.replace(/^\/private(?=\/(?:var|tmp|etc)\/)/, '');

export function relativePath(path: string, cwd: string | undefined): string {
  if (!cwd) return path;
  const p = stripPrivate(path);
  const c = stripPrivate(cwd).replace(/\/$/, '');
  if (p === c) return '.';
  if (p.startsWith(c + '/')) return p.slice(c.length + 1);
  return path;
}

function host(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function summarizeTool(name: string, input: unknown, cwd?: string): string {
  const path = str(input, 'file_path') ?? str(input, 'notebook_path') ?? str(input, 'path');
  switch (name) {
    case 'Read':
    case 'Edit':
    case 'Write':
    case 'MultiEdit':
    case 'NotebookEdit':
      return truncate(path ? relativePath(path, cwd) : name);
    case 'Bash':
      return truncate(str(input, 'command') ?? 'shell command');
    case 'Grep': {
      const pattern = str(input, 'pattern') ?? '';
      return truncate(path ? `"${pattern}" in ${relativePath(path, cwd)}` : `"${pattern}"`);
    }
    case 'Glob':
      return truncate(str(input, 'pattern') ?? 'Glob');
    case 'LS':
      return truncate(path ? relativePath(path, cwd) : 'LS');
    case 'WebFetch': {
      const url = str(input, 'url');
      return truncate(url ? host(url) : 'WebFetch');
    }
    case 'WebSearch':
      return truncate(str(input, 'query') ?? 'WebSearch');
    case 'Agent':
    case 'Task':
      return truncate(str(input, 'description') ?? 'subagent');
    case 'AskUserQuestion':
      return 'asking the user a question';
    default: {
      const mcp = /^mcp__(.+?)__(.+)$/.exec(name);
      if (mcp) return truncate(`${mcp[1]}: ${mcp[2]}`);
      return truncate(name);
    }
  }
}

/** Detect test results in Bash output. Returns a fixed label, never the output itself. */
export function detectTestOutcome(output: string): 'tests passed' | 'tests failed' | undefined {
  for (const m of output.matchAll(/(\d+)\s+(?:failed|failing)\b/gi)) {
    if (Number(m[1]) > 0) return 'tests failed';
  }
  if (/^\s*FAIL\s/m.test(output)) return 'tests failed';
  for (const m of output.matchAll(/(\d+)\s+(?:passed|passing)\b/gi)) {
    if (Number(m[1]) > 0) return 'tests passed';
  }
  return undefined;
}

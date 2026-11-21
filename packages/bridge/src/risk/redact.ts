import { homedir } from 'node:os';

/**
 * Mask anything that looks like a secret or personal data before text leaves the machine (LLM
 * calls) or is shown in summaries: API keys and tokens, `KEY=value` assignments, emails, long
 * random strings, and the home folder.
 */

export const REDACTED = '[REDACTED]';
export const EMAIL = '[EMAIL]';

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const TOKEN_PATTERNS: readonly RegExp[] = [
  /\bsk-(?:ant-)?[A-Za-z0-9_-]{16,}/g, // OpenAI / Anthropic style keys
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g, // GitHub tokens
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, // AWS access key ids
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g, // Slack tokens
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, // JWTs
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
];

/** `API_KEY=...`, `password: ...`, `--token=...`: keep the name, mask the value. */
const ASSIGNMENT =
  /\b([A-Za-z0-9_.-]*(?:key|token|secret|password|passwd|pwd|auth(?!or)|credential)[A-Za-z0-9_.-]*)(["']?\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s"',;&|]+)/gi;

/** Source file names (`auth.ts`, `token_store.py`) followed by `:line` are not secrets. */
const CODE_FILE =
  /\.(?:[cm]?[jt]sx?|py|go|rs|rb|java|kt|swift|c|h|cpp|cs|php|json|ya?ml|toml|md)$/i;

const BEARER = /\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{8,}/g;
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
/** Long base64url / hex runs that mix letters and digits (random looking, not words). */
const LONG_RANDOM = /(?<![A-Za-z0-9_+=-])[A-Za-z0-9_+=-]{32,}(?![A-Za-z0-9_+=-])/g;

function looksRandom(s: string): boolean {
  if (!/[0-9]/.test(s) || !/[A-Za-z]/.test(s)) return false;
  // Hyphen/underscore joined short parts are names or ids (folder names, UUIDs), not keys.
  const parts = s.split(/[-_]/);
  return !(parts.length > 2 && parts.every((p) => p.length <= 12));
}

export function redact(text: string, home: string = homedir()): string {
  let out = text;
  // Home folder first so later patterns see `~/...`.
  if (home && home !== '/')
    out = out.replace(new RegExp(escape(home.replace(/\/$/, '')), 'g'), '~');
  out = out.replace(/\/(?:Users|home)\/[^/\s"']+/g, '~');

  for (const re of TOKEN_PATTERNS) out = out.replace(re, REDACTED);
  out = out.replace(BEARER, (_, scheme: string) => `${scheme} ${REDACTED}`);
  out = out.replace(ASSIGNMENT, (m, name: string, sep: string, value: string) =>
    // `Authorization: Bearer [REDACTED]` is already handled above; `auth.ts:7` is a file and line.
    /^(Bearer|Basic|Token)$/i.test(value) || value.startsWith('[') || CODE_FILE.test(name)
      ? m
      : `${name}${sep}${REDACTED}`,
  );
  out = out.replace(EMAIL_RE, EMAIL);
  out = out.replace(LONG_RANDOM, (m) => (looksRandom(m) ? REDACTED : m));
  return out;
}

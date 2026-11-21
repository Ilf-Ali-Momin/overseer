import type { RiskAssessment, RiskLevel } from '@overseer/shared';

/**
 * Risk rules: a pure, offline function from a tool call to a risk level and short reasons.
 * Rule list: docs/ARCHITECTURE.md section 4. Reasons are fixed phrases plus short identifiers
 * (a file name, a host), never file contents.
 */

const ORDER: readonly RiskLevel[] = ['none', 'low', 'medium', 'high'];

class Findings {
  level: RiskLevel = 'none';
  reasons: string[] = [];
  add(level: RiskLevel, reason: string): void {
    if (ORDER.indexOf(level) > ORDER.indexOf(this.level)) this.level = level;
    if (!this.reasons.includes(reason)) this.reasons.push(reason);
  }
  result(): RiskAssessment {
    return { level: this.level, reasons: this.reasons };
  }
}

function str(input: unknown, key: string): string | undefined {
  if (input && typeof input === 'object' && key in input) {
    const v = (input as Record<string, unknown>)[key];
    return typeof v === 'string' ? v : undefined;
  }
  return undefined;
}

function basename(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] ?? path;
}

// ---------- secret files ----------

const ENV_SAFE = /^\.env\.(example|sample|template|dist|defaults?)$/i;

/** True when a path looks like a secret: `.env`, private keys, certificates, credentials. */
export function isSecretPath(path: string): boolean {
  const name = basename(path.replace(/["'`]/g, ''));
  if (!name) return false;
  if (name === '.env' || (/^\.env\./i.test(name) && !ENV_SAFE.test(name))) return true;
  if (/^id_(rsa|dsa|ecdsa|ed25519)$/.test(name)) return true;
  if (/\.(pem|key|p12|pfx)$/i.test(name)) return true;
  if (/^credentials(\.json)?$/i.test(name)) return true;
  if (name === '.netrc' || name === '.pgpass') return true;
  return false;
}

// ---------- sensitive write targets ----------

const PROFILES = new Set([
  '.bashrc',
  '.bash_profile',
  '.profile',
  '.zshrc',
  '.zprofile',
  '.zshenv',
  '.zlogin',
  'config.fish',
]);

/** True for `~/.ssh/...`, `/etc/...` and shell profiles. */
export function isSensitiveWriteTarget(path: string): boolean {
  const p = path.replace(/["'`]/g, '');
  if (/(^|\/)\.ssh(\/|$)/.test(p)) return true;
  if (/^\/(private\/)?etc(\/|$)/.test(p)) return true;
  return PROFILES.has(basename(p));
}

function isInside(path: string, cwd: string | undefined): boolean {
  if (!cwd) return true;
  if (!path.startsWith('/') && !path.startsWith('~')) return !path.startsWith('../');
  return path === cwd || path.startsWith(cwd.replace(/\/$/, '') + '/');
}

// ---------- shell commands ----------

/** Blank out quoted text so `echo "rm -rf /"` does not look like `rm -rf /`. */
function stripQuotes(cmd: string): string {
  return cmd.replace(/'[^']*'|"(?:[^"\\]|\\.)*"/g, '""');
}

const WRAPPERS = new Set(['sudo', 'env', 'time', 'nohup', 'command', 'exec', 'xargs', 'nice']);

/** Split on command separators and return each segment's words, wrappers removed. */
function segments(cmd: string): string[][] {
  return stripQuotes(cmd)
    .split(/&&|\|\||[;|\n&]|\$\(|`|\(|\)/)
    .map((s) => s.trim().split(/\s+/).filter(Boolean))
    .map((words) => {
      let i = 0;
      while (i < words.length) {
        const w = words[i]!;
        if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w) || WRAPPERS.has(w)) i++;
        else if (w.startsWith('-') && i > 0 && WRAPPERS.has(words[i - 1]!)) i++;
        else break;
      }
      return words.slice(i);
    })
    .filter((w) => w.length > 0);
}

const NETWORK = new Set([
  'curl',
  'wget',
  'nc',
  'ncat',
  'netcat',
  'ssh',
  'scp',
  'sftp',
  'telnet',
  'ftp',
]);

const INSTALLERS: Record<string, readonly string[]> = {
  npm: ['install', 'i', 'add', 'ci'],
  pnpm: ['install', 'i', 'add'],
  yarn: ['install', 'add'],
  bun: ['install', 'i', 'add'],
  pip: ['install'],
  pip3: ['install'],
  uv: ['add', 'pip'],
  brew: ['install'],
  apt: ['install'],
  'apt-get': ['install'],
  cargo: ['install', 'add'],
  gem: ['install'],
  go: ['install', 'get'],
};

function hasFlag(words: readonly string[], short: string, long: string): boolean {
  return words.some(
    (w) => w === long || (w.startsWith('-') && !w.startsWith('--') && w.slice(1).includes(short)),
  );
}

function assessBash(cmd: string, f: Findings, cwd: string | undefined): void {
  const flat = stripQuotes(cmd);

  // Piping a download into a shell.
  if (
    /\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(sh|bash|zsh|dash|python3?|node|perl|ruby)\b/.test(flat) ||
    /\b(sh|bash|zsh)\b[^\n]*(<\(|\$\()\s*(curl|wget)\b/.test(cmd)
  ) {
    f.add('high', 'pipes a download into a shell');
  }

  for (const words of segments(cmd)) {
    const [name, ...args] = words as [string, ...string[]];
    if (name === 'rm') {
      const recursive = hasFlag(args, 'r', '--recursive') || hasFlag(args, 'R', '--recursive');
      const force = hasFlag(args, 'f', '--force');
      f.add(
        recursive && force ? 'high' : 'medium',
        recursive && force ? 'recursive force delete (rm -rf)' : 'deletes files',
      );
    }
    if (name === 'chmod' && args.some((a) => /^0?777$/.test(a) || a === 'a+rwx')) {
      f.add('high', 'makes files writable by everyone (chmod 777)');
    }
    if (name === 'git' && args[0] === 'push') {
      if (args.some((a) => /^(--force|--force-with-lease|-f)$/.test(a) || a.startsWith('+'))) {
        f.add('high', 'force pushes git history');
      } else {
        f.add('medium', 'pushes to a git remote');
      }
    }
    if (name === 'git' && args[0] === 'rm') f.add('medium', 'deletes files');
    if (NETWORK.has(name)) f.add('medium', `network call (${name})`);
    if (name === 'npx' || name === 'bunx')
      f.add('medium', `downloads and runs a package (${name})`);
    const install = INSTALLERS[name];
    if (install && args[0] && install.includes(args[0])) {
      f.add('medium', `installs packages (${name} ${args[0]})`);
    }
  }

  // `sudo` anywhere in command position.
  if (/(^|[;&|(]\s*|\s)sudo\s/.test(` ${flat}`)) f.add('high', 'runs as root (sudo)');

  // Secret files mentioned anywhere (cat .env, cp id_rsa ...).
  for (const token of cmd.split(/[\s=<>|;&()'"`]+/)) {
    if (token && isSecretPath(token)) {
      f.add('high', `touches a secret file (${basename(token)})`);
      break;
    }
  }

  // Redirects or tee into sensitive places, or outside the project.
  for (const m of cmd.matchAll(/(?:>>?|\btee\s+(?:-a\s+)?)\s*["']?([^\s"';|&]+)/g)) {
    const target = m[1]!;
    if (target.startsWith('&') || target === '/dev/null' || /^\/dev\//.test(target)) continue;
    if (isSensitiveWriteTarget(target))
      f.add('high', `writes to ${basename(target)} (system or shell config)`);
    else if (!isInside(target, cwd)) f.add('low', 'writes a file outside the project');
  }

  if (f.level === 'none') f.add('low', 'runs a shell command');
}

// ---------- web ----------

const KNOWN_HOSTS = [
  'github.com',
  'githubusercontent.com',
  'npmjs.com',
  'npmjs.org',
  'nodejs.org',
  'developer.mozilla.org',
  'stackoverflow.com',
  'python.org',
  'pypi.org',
  'anthropic.com',
  'claude.com',
  'wikipedia.org',
  'typescriptlang.org',
  'react.dev',
  'nextjs.org',
  'vercel.com',
  'threejs.org',
];

export function isKnownHost(host: string): boolean {
  const h = host.toLowerCase();
  return KNOWN_HOSTS.some((d) => h === d || h.endsWith(`.${d}`));
}

function hostOf(url: string): string | undefined {
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}

// ---------- entry point ----------

const READ_TOOLS = new Set(['Read', 'Grep', 'Glob', 'LS', 'NotebookRead']);
const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

/** Assess one tool call. `cwd` is the session's project folder, when known. */
export function assessRisk(toolName: string, input: unknown, cwd?: string): RiskAssessment {
  const f = new Findings();
  const path = str(input, 'file_path') ?? str(input, 'notebook_path') ?? str(input, 'path');

  if (toolName === 'Bash') {
    assessBash(str(input, 'command') ?? '', f, cwd);
  } else if (READ_TOOLS.has(toolName)) {
    if (path && isSecretPath(path)) f.add('high', `reads a secret file (${basename(path)})`);
    const glob = str(input, 'pattern') ?? str(input, 'glob');
    if (toolName === 'Glob' && glob && isSecretPath(glob)) {
      f.add('medium', 'searches for secret files');
    }
  } else if (WRITE_TOOLS.has(toolName)) {
    if (path && isSensitiveWriteTarget(path)) {
      f.add('high', `writes to ${basename(path)} (system or shell config)`);
    } else if (path && isSecretPath(path)) {
      f.add('high', `writes a secret file (${basename(path)})`);
    } else if (path && !isInside(path, cwd)) {
      f.add('low', 'writes a file outside the project');
    }
  } else if (toolName === 'WebFetch') {
    const host = hostOf(str(input, 'url') ?? '');
    if (!host || !isKnownHost(host))
      f.add('medium', `fetches an unknown site (${host ?? 'bad url'})`);
  }
  return f.result();
}

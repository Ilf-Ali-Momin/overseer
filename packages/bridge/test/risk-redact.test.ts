import { describe, expect, it } from 'vitest';
import { EMAIL, REDACTED, redact } from '../src/risk/redact';

const HOME = '/Users/alice';
const r = (s: string) => redact(s, HOME);

describe('redact', () => {
  it.each([
    ['curl -H "x-api-key: sk-ant-api03-AbCdEf0123456789xyz"', 'sk-ant'],
    ['export OPENAI=sk-proj-0123456789abcdefABCDEF', 'sk-proj'],
    ['git clone https://ghp_0123456789abcdefABCDEF0123@github.com/x', 'ghp_'],
    ['token github_pat_11ABCDEFG0123456789_abcdefghijklmnop', 'github_pat_'],
    ['aws AKIAIOSFODNN7EXAMPLE', 'AKIA'],
    ['slack xoxb-1234567890-abcdefghij', 'xoxb'],
    ['jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N', 'eyJ'],
  ])('masks tokens: %s', (input, leaked) => {
    const out = r(input);
    expect(out).toContain(REDACTED);
    expect(out).not.toContain(leaked);
  });

  it('masks assignments but keeps the name', () => {
    expect(r('API_KEY=abc123 pnpm dev')).toBe(`API_KEY=${REDACTED} pnpm dev`);
    expect(r('mysql --password="hunter2" -u root')).toBe(`mysql --password=${REDACTED} -u root`);
    expect(r('{"secret": "s3cr3t"}')).toBe(`{"secret": ${REDACTED}}`);
  });

  it('masks bearer tokens', () => {
    expect(r('curl -H "Authorization: Bearer abcdefgh12345678"')).toBe(
      `curl -H "Authorization: Bearer ${REDACTED}"`,
    );
  });

  it('masks emails', () => {
    expect(r('git config user.email alice@example.com')).toBe(`git config user.email ${EMAIL}`);
  });

  it('masks long random strings, keeps long words', () => {
    expect(r('hash d41d8cd98f00b204e9800998ecf8427e')).toBe(`hash ${REDACTED}`);
    expect(r('call some_really_long_function_name_without_digits')).toBe(
      'call some_really_long_function_name_without_digits',
    );
  });

  it('replaces home folders with ~', () => {
    expect(r('cat /Users/alice/project/src/a.ts')).toBe('cat ~/project/src/a.ts');
    expect(r('ls /home/bob/x')).toBe('ls ~/x');
    expect(redact('/opt/me/a', '/opt/me')).toBe('~/a');
  });

  it('leaves normal text alone', () => {
    for (const s of [
      'pnpm test',
      'git checkout 3f2a9c1',
      'git show 3f2a9c1b8d0e',
      'src/components/Button.tsx',
      'rm -rf node_modules',
      'keyboard shortcut',
      'grep -r "useState" src',
      'git log --author=bob',
      'Found TODOs in auth.ts:7, todos.ts:9 and token_store.py:12',
      'ls ~/.claude/projects/-Users-dev-Desktop-3d-agents-overseer-kit',
      'session 4220a42a-2562-43f2-9569-ba4e0bb909cc',
    ]) {
      expect(r(s)).toBe(s);
    }
  });
});

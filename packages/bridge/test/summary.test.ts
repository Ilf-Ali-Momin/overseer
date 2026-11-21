import { describe, expect, it } from 'vitest';
import { detectTestOutcome, summarizeTool } from '../src/summary';

describe('summarizeTool', () => {
  it('formats common tools', () => {
    expect(summarizeTool('Read', { file_path: '/p/a/b.ts' }, '/p')).toBe('a/b.ts');
    expect(summarizeTool('Read', { file_path: '/other/b.ts' }, '/p')).toBe('/other/b.ts');
    expect(summarizeTool('Bash', { command: 'ls -la' })).toBe('ls -la');
    expect(summarizeTool('Glob', { pattern: '**/*.ts' })).toBe('**/*.ts');
    expect(summarizeTool('WebFetch', { url: 'https://docs.example.com/x?y=1' })).toBe(
      'docs.example.com',
    );
    expect(summarizeTool('WebSearch', { query: 'zod v4' })).toBe('zod v4');
    expect(summarizeTool('Agent', { description: 'Scan' })).toBe('Scan');
    expect(summarizeTool('mcp__github__create_pr', {})).toBe('github: create_pr');
    expect(summarizeTool('Weird', null)).toBe('Weird');
  });

  it('keeps summaries short', () => {
    expect(summarizeTool('Bash', { command: 'echo ' + 'a'.repeat(400) }).length).toBe(140);
  });
});

describe('detectTestOutcome', () => {
  it('detects failures', () => {
    expect(detectTestOutcome('Tests  2 failed | 10 passed (12)')).toBe('tests failed');
    expect(detectTestOutcome(' FAIL  src/a.test.ts')).toBe('tests failed');
    expect(detectTestOutcome('3 failing')).toBe('tests failed');
  });

  it('detects passes', () => {
    expect(detectTestOutcome('Tests  12 passed (12)')).toBe('tests passed');
    expect(detectTestOutcome('0 failed, 4 passed')).toBe('tests passed');
  });

  it('returns undefined for other output', () => {
    expect(detectTestOutcome('built in 2s')).toBeUndefined();
    expect(detectTestOutcome('0 passed')).toBeUndefined();
  });
});

describe('relativePath', () => {
  it('handles the macOS /private prefix on either side', async () => {
    const { relativePath } = await import('../src/summary');
    expect(relativePath('/private/var/folders/x/demo/src/a.ts', '/var/folders/x/demo')).toBe(
      'src/a.ts',
    );
    expect(relativePath('/var/folders/x/demo/src/a.ts', '/private/var/folders/x/demo')).toBe(
      'src/a.ts',
    );
    expect(relativePath('/private/var/folders/x/demo', '/var/folders/x/demo')).toBe('.');
    expect(relativePath('/opt/other/a.ts', '/var/folders/x/demo')).toBe('/opt/other/a.ts');
  });
});

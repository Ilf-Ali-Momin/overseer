import { describe, expect, it } from 'vitest';
import { parseLine, parseLines } from '../src/parser';
import { ERRORS, NORMAL, fixtureText } from './helpers';

describe('parseLine', () => {
  it('parses a typed line and keeps unknown fields', () => {
    const line = parseLine('{"type":"assistant","uuid":"u1","extra":42}');
    expect(line?.type).toBe('assistant');
    expect((line as Record<string, unknown>).extra).toBe(42);
  });

  it('returns null for broken, empty or untyped lines', () => {
    expect(parseLine('{"type":"assistant","uuid":"broken')).toBeNull();
    expect(parseLine('   ')).toBeNull();
    expect(parseLine('[1,2]')).toBeNull();
    expect(parseLine('{"no":"type"}')).toBeNull();
    expect(parseLine('null')).toBeNull();
  });

  it('accepts string and array message content', () => {
    expect(parseLine('{"type":"user","message":{"content":"hi"}}')?.message?.content).toBe('hi');
    const arr = parseLine('{"type":"user","message":{"content":[{"type":"text","text":"x"}]}}');
    expect(Array.isArray(arr?.message?.content)).toBe(true);
  });
});

describe('parseLines on fixtures', () => {
  it('parses every line of the normal session', () => {
    const text = fixtureText(`${NORMAL}.jsonl`);
    expect(parseLines(text)).toHaveLength(text.trim().split('\n').length);
  });

  it('skips the truncated last line in the errors session', () => {
    const text = fixtureText(`${ERRORS}.jsonl`);
    expect(parseLines(text)).toHaveLength(text.trim().split('\n').length - 1);
  });
});

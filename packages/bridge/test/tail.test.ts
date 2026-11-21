import { describe, expect, it } from 'vitest';
import { LineBuffer } from '../src/tail';

describe('LineBuffer', () => {
  it('returns only complete lines and keeps the rest', () => {
    const b = new LineBuffer();
    expect(b.feed(Buffer.from('{"a":1}\n{"b":'))).toEqual(['{"a":1}']);
    expect(b.pendingBytes).toBe(5);
    expect(b.feed(Buffer.from('2}\n'))).toEqual(['{"b":2}']);
    expect(b.pendingBytes).toBe(0);
  });

  it('handles a chunk with no newline and skips blank lines', () => {
    const b = new LineBuffer();
    expect(b.feed(Buffer.from('abc'))).toEqual([]);
    expect(b.feed(Buffer.from('\n\n\ndef\n'))).toEqual(['abc', 'def']);
  });

  it('does not break multi-byte UTF-8 characters split across chunks', () => {
    const b = new LineBuffer();
    const bytes = Buffer.from('{"t":"héllo ✓"}\n');
    const cut = bytes.indexOf(0xa9); // inside "é"
    expect(b.feed(bytes.subarray(0, cut))).toEqual([]);
    expect(b.feed(bytes.subarray(cut))).toEqual(['{"t":"héllo ✓"}']);
  });
});

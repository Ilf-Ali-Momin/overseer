/**
 * Splits appended bytes into complete lines. Bytes after the last newline are kept until the next
 * chunk arrives, so half-written lines (and split UTF-8 characters) are never parsed early.
 */
export class LineBuffer {
  private pending: Buffer = Buffer.alloc(0);

  feed(chunk: Buffer): string[] {
    const data = this.pending.length ? Buffer.concat([this.pending, chunk]) : chunk;
    const lastNl = data.lastIndexOf(0x0a);
    if (lastNl === -1) {
      this.pending = data;
      return [];
    }
    this.pending = data.subarray(lastNl + 1);
    return data
      .subarray(0, lastNl)
      .toString('utf8')
      .split('\n')
      .filter((l) => l.trim().length > 0);
  }

  get pendingBytes(): number {
    return this.pending.length;
  }

  reset(): void {
    this.pending = Buffer.alloc(0);
  }
}

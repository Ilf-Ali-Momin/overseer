/**
 * Walkable grid and A* path finding on the office floor (x/z plane). Pure, no three.js.
 */

export type Pt = readonly [number, number];

export interface Rect {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

const SQRT2 = Math.SQRT2;
const NEIGHBOURS: readonly (readonly [number, number, number])[] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, 1, SQRT2],
  [-1, -1, SQRT2],
];

/** Min-heap of cell indices keyed by f score. */
class Heap {
  private items: number[] = [];
  constructor(private readonly score: Float64Array) {}
  get size(): number {
    return this.items.length;
  }
  push(i: number): void {
    const a = this.items;
    a.push(i);
    let c = a.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (this.score[a[p]!]! <= this.score[a[c]!]!) break;
      [a[p], a[c]] = [a[c]!, a[p]!];
      c = p;
    }
  }
  pop(): number {
    const a = this.items;
    const top = a[0]!;
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let p = 0;
      for (;;) {
        const l = 2 * p + 1;
        const r = l + 1;
        let m = p;
        if (l < a.length && this.score[a[l]!]! < this.score[a[m]!]!) m = l;
        if (r < a.length && this.score[a[r]!]! < this.score[a[m]!]!) m = r;
        if (m === p) break;
        [a[p], a[m]] = [a[m]!, a[p]!];
        p = m;
      }
    }
    return top;
  }
}

export class NavGrid {
  readonly cols: number;
  readonly rows: number;
  private readonly blocked: Uint8Array;

  /**
   * @param width room size along x, @param depth along z (room spans [0, width] x [0, depth]).
   * @param cell cell size. @param radius agent radius: obstacles and walls are grown by it.
   */
  constructor(
    readonly width: number,
    readonly depth: number,
    readonly cell: number,
    obstacles: readonly Rect[],
    readonly radius: number,
  ) {
    this.cols = Math.ceil(width / cell);
    this.rows = Math.ceil(depth / cell);
    this.blocked = new Uint8Array(this.cols * this.rows);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const x = (c + 0.5) * cell;
        const z = (r + 0.5) * cell;
        const nearWall = x < radius || z < radius || x > width - radius || z > depth - radius;
        const hit = obstacles.some(
          (o) =>
            x > o.minX - radius &&
            x < o.maxX + radius &&
            z > o.minZ - radius &&
            z < o.maxZ + radius,
        );
        if (nearWall || hit) this.blocked[r * this.cols + c] = 1;
      }
    }
  }

  private index(x: number, z: number): number {
    const c = Math.floor(x / this.cell);
    const r = Math.floor(z / this.cell);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return -1;
    return r * this.cols + c;
  }

  private center(i: number): Pt {
    return [((i % this.cols) + 0.5) * this.cell, (Math.floor(i / this.cols) + 0.5) * this.cell];
  }

  isFree(x: number, z: number): boolean {
    const i = this.index(x, z);
    return i >= 0 && this.blocked[i] === 0;
  }

  /** Nearest free cell to a point (ring search), or -1 when the grid has no free cell nearby. */
  private nearestFree(x: number, z: number): number {
    const c0 = Math.min(this.cols - 1, Math.max(0, Math.floor(x / this.cell)));
    const r0 = Math.min(this.rows - 1, Math.max(0, Math.floor(z / this.cell)));
    const maxRing = Math.max(this.cols, this.rows);
    for (let ring = 0; ring < maxRing; ring++) {
      let best = -1;
      let bestD = Infinity;
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
          const c = c0 + dc;
          const r = r0 + dr;
          if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) continue;
          const i = r * this.cols + c;
          if (this.blocked[i]) continue;
          const [cx, cz] = this.center(i);
          const d = (cx - x) ** 2 + (cz - z) ** 2;
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  /** True when the straight segment a-b stays on free cells. */
  lineOfSight(a: Pt, b: Pt): boolean {
    // Exact grid traversal (Amanatides & Woo): visits every cell the segment touches.
    const cs = this.cell;
    let c = Math.floor(a[0] / cs);
    let r = Math.floor(a[1] / cs);
    const c1 = Math.floor(b[0] / cs);
    const r1 = Math.floor(b[1] / cs);
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const sc = dx > 0 ? 1 : -1;
    const sr = dz > 0 ? 1 : -1;
    const tdc = dx !== 0 ? Math.abs(cs / dx) : Infinity;
    const tdr = dz !== 0 ? Math.abs(cs / dz) : Infinity;
    let tmc = dx !== 0 ? ((dx > 0 ? c + 1 : c) * cs - a[0]) / dx : Infinity;
    let tmr = dz !== 0 ? ((dz > 0 ? r + 1 : r) * cs - a[1]) / dz : Infinity;
    const blockedAt = (cc: number, rr: number) =>
      cc < 0 ||
      rr < 0 ||
      cc >= this.cols ||
      rr >= this.rows ||
      this.blocked[rr * this.cols + cc] === 1;
    for (let guard = this.cols + this.rows + 2; guard > 0; guard--) {
      if (blockedAt(c, r)) return false;
      // Done once the segment ends inside the current cell (also covers ends on a cell edge).
      if ((c === c1 && r === r1) || Math.min(tmc, tmr) >= 1 - 1e-9) return true;
      if (Math.abs(tmc - tmr) < 1e-12) {
        // Passing exactly through a corner touches both side cells.
        if (blockedAt(c + sc, r) || blockedAt(c, r + sr)) return false;
        c += sc;
        r += sr;
        tmc += tdc;
        tmr += tdr;
      } else if (tmc < tmr) {
        c += sc;
        tmc += tdc;
      } else {
        r += sr;
        tmr += tdr;
      }
    }
    return true;
  }

  /**
   * Shortest path from `from` to `to` as a list of waypoints, smoothed with line of sight checks.
   * Start and goal snap to the nearest free cell when they are blocked. Returns [] when unreachable.
   */
  findPath(from: Pt, to: Pt): Pt[] {
    const start = this.isFree(from[0], from[1])
      ? this.index(from[0], from[1])
      : this.nearestFree(from[0], from[1]);
    const goal = this.isFree(to[0], to[1])
      ? this.index(to[0], to[1])
      : this.nearestFree(to[0], to[1]);
    if (start < 0 || goal < 0) return [];
    const startPt: Pt = this.isFree(from[0], from[1]) ? from : this.center(start);
    const goalPt: Pt = this.isFree(to[0], to[1]) ? to : this.center(goal);
    if (start === goal || this.lineOfSight(startPt, goalPt)) return [startPt, goalPt];

    const n = this.cols * this.rows;
    const g = new Float64Array(n).fill(Infinity);
    const f = new Float64Array(n).fill(Infinity);
    const came = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const gc = goal % this.cols;
    const gr = Math.floor(goal / this.cols);
    const h = (i: number) => {
      const dc = Math.abs((i % this.cols) - gc);
      const dr = Math.abs(Math.floor(i / this.cols) - gr);
      return Math.max(dc, dr) + (SQRT2 - 1) * Math.min(dc, dr);
    };
    const open = new Heap(f);
    g[start] = 0;
    f[start] = h(start);
    open.push(start);

    while (open.size > 0) {
      const cur = open.pop();
      if (cur === goal) break;
      if (closed[cur]) continue;
      closed[cur] = 1;
      const c = cur % this.cols;
      const r = Math.floor(cur / this.cols);
      for (const [dc, dr, cost] of NEIGHBOURS) {
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= this.cols || nr >= this.rows) continue;
        const ni = nr * this.cols + nc;
        if (this.blocked[ni] || closed[ni]) continue;
        // No corner cutting: both orthogonal neighbours must be free for a diagonal step.
        if (
          dc !== 0 &&
          dr !== 0 &&
          (this.blocked[r * this.cols + nc] || this.blocked[nr * this.cols + c])
        ) {
          continue;
        }
        const ng = g[cur]! + cost;
        if (ng < g[ni]!) {
          g[ni] = ng;
          f[ni] = ng + h(ni);
          came[ni] = cur;
          open.push(ni);
        }
      }
    }
    if (came[goal] === -1) return [];

    const cells: Pt[] = [];
    for (let i = came[goal]!; i !== start && i !== -1; i = came[i]!) cells.push(this.center(i));
    cells.reverse();
    return this.smooth([startPt, ...cells, goalPt]);
  }

  /** Drop waypoints that can be skipped with a straight line. */
  smooth(points: readonly Pt[]): Pt[] {
    if (points.length <= 2) return [...points];
    const out: Pt[] = [points[0]!];
    let i = 0;
    while (i < points.length - 1) {
      let j = points.length - 1;
      while (j > i + 1 && !this.lineOfSight(points[i]!, points[j]!)) j--;
      out.push(points[j]!);
      i = j;
    }
    return out;
  }
}

/** Total length of a path. */
export function pathLength(path: readonly Pt[]): number {
  let len = 0;
  for (let i = 1; i < path.length; i++) {
    len += Math.hypot(path[i]![0] - path[i - 1]![0], path[i]![1] - path[i - 1]![1]);
  }
  return len;
}

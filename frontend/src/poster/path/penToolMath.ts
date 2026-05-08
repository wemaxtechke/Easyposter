import type { PosterPathPoint } from '../types';

export interface Vec2 {
  x: number;
  y: number;
}

/** Cubic control points: b0 anchor → b1 → b2 → b3 anchor */
export function resolveSegmentControls(prev: PosterPathPoint, cur: PosterPathPoint): [Vec2, Vec2, Vec2, Vec2] {
  const b0 = { x: prev.x, y: prev.y };
  const b1 =
    prev.outX != null && prev.outY != null ? { x: prev.outX, y: prev.outY } : { x: prev.x, y: prev.y };
  const b2 = cur.inX != null && cur.inY != null ? { x: cur.inX, y: cur.inY } : { x: cur.x, y: cur.y };
  const b3 = { x: cur.x, y: cur.y };
  return [b0, b1, b2, b3];
}

/**
 * Photoshop-style SVG path: every span is a cubic `C`. Missing handles collapse
 * to anchors so that side of the segment is straight.
 */
export function pathPointsToPathD(points: PosterPathPoint[], closed: boolean): string {
  if (!points.length) return 'M 0 0';
  const p0 = points[0]!;
  const cmds: string[] = [`M ${p0.x} ${p0.y}`];

  const emit = (prev: PosterPathPoint, cur: PosterPathPoint) => {
    const [b0, b1, b2, b3] = resolveSegmentControls(prev, cur);
    cmds.push(`C ${b1.x} ${b1.y} ${b2.x} ${b2.y} ${b3.x} ${b3.y}`);
  };

  for (let i = 1; i < points.length; i++) {
    emit(points[i - 1]!, points[i]!);
  }

  if (closed && points.length > 1) {
    const last = points[points.length - 1]!;
    const first = points[0]!;
    emit(last, first);
    cmds.push('Z');
  }

  return cmds.join(' ');
}

function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function cubicAt(b0: Vec2, b1: Vec2, b2: Vec2, b3: Vec2, t: number): Vec2 {
  const u = 1 - t;
  const uu = u * u;
  const tt = t * t;
  return {
    x: uu * u * b0.x + 3 * uu * t * b1.x + 3 * u * tt * b2.x + tt * t * b3.x,
    y: uu * u * b0.y + 3 * uu * t * b1.y + 3 * u * tt * b2.y + tt * t * b3.y,
  };
}

/** First derivative of cubic at t (scaled; direction only matters for distance). */
function cubicTangent(b0: Vec2, b1: Vec2, b2: Vec2, b3: Vec2, t: number): Vec2 {
  const u = 1 - t;
  return {
    x: 3 * u * u * (b1.x - b0.x) + 6 * u * t * (b2.x - b1.x) + 3 * t * t * (b3.x - b2.x),
    y: 3 * u * u * (b1.y - b0.y) + 6 * u * t * (b2.y - b1.y) + 3 * t * t * (b3.y - b2.y),
  };
}

function distSq(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/**
 * Distance from `p` to cubic segment, sampled + Newton polish.
 * Returns min distance and parameter t in [0,1] on the segment.
 */
export function distanceToCubicSegment(
  b0: Vec2,
  b1: Vec2,
  b2: Vec2,
  b3: Vec2,
  p: Vec2,
): { dist: number; t: number } {
  let bestT = 0;
  let bestD = distSq(p, b0);
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const q = cubicAt(b0, b1, b2, b3, t);
    const d = distSq(p, q);
    if (d < bestD) {
      bestD = d;
      bestT = t;
    }
  }

  for (let iter = 0; iter < 6; iter++) {
    const pt = cubicAt(b0, b1, b2, b3, bestT);
    const tan = cubicTangent(b0, b1, b2, b3, bestT);
    const rel = { x: p.x - pt.x, y: p.y - pt.y };
    const denom = tan.x * tan.x + tan.y * tan.y;
    if (denom < 1e-12) break;
    const tNext = bestT + (rel.x * tan.x + rel.y * tan.y) / denom;
    bestT = Math.max(0, Math.min(1, tNext));
  }

  const endPt = cubicAt(b0, b1, b2, b3, bestT);
  return { dist: Math.sqrt(distSq(p, endPt)), t: bestT };
}

/** Segment index i connects points[i] → points[i+1]; for closed, includes wrap segment. */
export function pathSegmentCount(points: PosterPathPoint[], closed: boolean): number {
  if (points.length < 2) return 0;
  return closed ? points.length : points.length - 1;
}

export function hitTestPathSegments(
  points: PosterPathPoint[],
  closed: boolean,
  p: Vec2,
  maxDist: number,
): { segmentIndex: number; t: number } | null {
  if (points.length < 2) return null;
  let best: { segmentIndex: number; t: number; dist: number } | null = null;
  const n = points.length;
  const segCount = pathSegmentCount(points, closed);
  for (let i = 0; i < segCount; i++) {
    const prev = points[i]!;
    const cur = closed ? points[(i + 1) % n]! : points[i + 1]!;
    const [b0, b1, b2, b3] = resolveSegmentControls(prev, cur);
    const { dist, t } = distanceToCubicSegment(b0, b1, b2, b3, p);
    if (dist <= maxDist && (!best || dist < best.dist)) {
      best = { segmentIndex: i, t, dist };
    }
  }
  return best ? { segmentIndex: best.segmentIndex, t: best.t } : null;
}

/**
 * Split cubic between points[segIndex] and points[segIndex+1] (or wrap) at t;
 * inserts a new PosterPathPoint with smooth handles.
 */
export function insertPathAnchorOnSegment(
  points: PosterPathPoint[],
  closed: boolean,
  segmentIndex: number,
  t: number,
): { points: PosterPathPoint[]; insertedIndex: number } {
  const n = points.length;
  if (n < 2 || segmentIndex < 0) return { points, insertedIndex: -1 };
  const maxSeg = pathSegmentCount(points, closed) - 1;
  if (segmentIndex > maxSeg) return { points, insertedIndex: -1 };

  const prevIdx = segmentIndex;
  const curIdx = closed ? (segmentIndex + 1) % n : segmentIndex + 1;
  const prev = points[prevIdx]!;
  const cur = points[curIdx]!;
  const [b0, b1, b2, b3] = resolveSegmentControls(prev, cur);

  const q0 = lerp(b0, b1, t);
  const q1 = lerp(b1, b2, t);
  const q2 = lerp(b2, b3, t);
  const r0 = lerp(q0, q1, t);
  const r1 = lerp(q1, q2, t);
  const r2 = lerp(r0, r1, t);

  const next = [...points];

  const newPt: PosterPathPoint = {
    x: r2.x,
    y: r2.y,
    inX: r0.x,
    inY: r0.y,
    outX: r1.x,
    outY: r1.y,
  };

  const prevOut: PosterPathPoint = {
    ...prev,
    outX: q0.x,
    outY: q0.y,
  };

  const curIn: PosterPathPoint = {
    ...cur,
    inX: q2.x,
    inY: q2.y,
  };

  let insertedIndex: number;

  if (closed) {
    next[prevIdx] = prevOut;
    next[curIdx] = curIn;
    const wrapSeg = curIdx <= prevIdx;
    if (wrapSeg) {
      insertedIndex = next.length;
      next.push(newPt);
    } else {
      insertedIndex = curIdx;
      next.splice(curIdx, 0, newPt);
    }
  } else {
    next[prevIdx] = prevOut;
    next[curIdx] = curIn;
    insertedIndex = curIdx;
    next.splice(curIdx, 0, newPt);
  }

  return { points: next, insertedIndex };
}

/** Strip handles on neighbors after removing a knot (stable, low surprise). */
export function removePathAnchorAt(points: PosterPathPoint[], index: number, closed: boolean): PosterPathPoint[] {
  const n = points.length;
  const minOpen = 2;
  const minClosed = 3;
  if (!closed && n <= minOpen) return points;
  if (closed && n <= minClosed) return points;
  if (index < 0 || index >= n) return points;

  const next = [...points];
  next.splice(index, 1);
  const nn = next.length;

  const stripCorner = (i: number) => {
    const ii = ((i % nn) + nn) % nn;
    const p = next[ii]!;
    next[ii] = { x: p.x, y: p.y };
  };

  const left = (index - 1 + nn) % nn;
  const right = index % nn;
  stripCorner(left);
  stripCorner(right);

  return next;
}

/** Append a corner anchor (click, no drag). Applies segment rule: incoming handle implicit at anchor. */
export function appendCornerAnchor(
  points: PosterPathPoint[],
  x: number,
  y: number,
): PosterPathPoint[] {
  return [...points, { x, y }];
}

/**
 * Append smooth anchor at `anchor` after drag to `dragEnd` (both local coords).
 * Symmetric handles along (dragEnd - anchor). Adjusts previous anchor's out handle for continuity.
 */
export function appendSmoothAnchor(
  points: PosterPathPoint[],
  anchor: Vec2,
  dragEnd: Vec2,
): PosterPathPoint[] {
  const vx = dragEnd.x - anchor.x;
  const vy = dragEnd.y - anchor.y;
  const next = [...points];
  const newPt: PosterPathPoint = {
    x: anchor.x,
    y: anchor.y,
    inX: anchor.x - vx,
    inY: anchor.y - vy,
    outX: anchor.x + vx,
    outY: anchor.y + vy,
  };

  if (next.length > 0) {
    const prev = next[next.length - 1]!;
    const prevIdx = next.length - 1;
    const dx = anchor.x - prev.x;
    const dy = anchor.y - prev.y;
    const prevUpdated: PosterPathPoint = {
      ...prev,
      outX: prev.x + dx * 0.38,
      outY: prev.y + dy * 0.38,
    };
    next[prevIdx] = prevUpdated;
  }

  next.push(newPt);
  return next;
}

/** Plain SVG `d` plus optional `<path .../>` wrapper for clipboard / decal workflows. */
export function pathPointsToSvgPathElement(
  points: PosterPathPoint[],
  closed: boolean,
  attrs: { fill?: string; stroke?: string; strokeWidth?: number } = {},
): string {
  const d = pathPointsToPathD(points, closed);
  const fill = attrs.fill ?? '#000000';
  const stroke = attrs.stroke ?? 'none';
  const sw = attrs.strokeWidth ?? 0;
  return `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" />`;
}

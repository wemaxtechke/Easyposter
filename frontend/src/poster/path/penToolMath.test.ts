import { describe, expect, it } from 'vitest';
import {
  appendCornerAnchor,
  appendSmoothAnchor,
  distanceToCubicSegment,
  hitTestPathSegments,
  insertPathAnchorOnSegment,
  pathPointsToPathD,
  pathPointsToSvgPathElement,
  pathSegmentCount,
  removePathAnchorAt,
  resolveSegmentControls,
} from './penToolMath';

describe('pathPointsToPathD', () => {
  it('emits cubic-only d with degenerate controls for line segments', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    const d = pathPointsToPathD(pts, false);
    expect(d).toMatch(/^M 0 0 C 0 0 100 0 100 0$/);
  });

  it('uses explicit out/in handles in C command', () => {
    const pts = [
      { x: 0, y: 0, outX: 50, outY: 0 },
      { x: 100, y: 100, inX: 50, inY: 100 },
    ];
    const d = pathPointsToPathD(pts, false);
    expect(d).toBe('M 0 0 C 50 0 50 100 100 100');
  });

  it('closes with cubic back to first and Z', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 50, y: 80 },
    ];
    const d = pathPointsToPathD(pts, true);
    expect(d).toContain('Z');
    expect(d.split('C').length - 1).toBe(pts.length);
  });
});

describe('resolveSegmentControls', () => {
  it('falls back to anchors when handles missing', () => {
    const [b0, b1, b2, b3] = resolveSegmentControls(
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    );
    expect(b0).toEqual({ x: 0, y: 0 });
    expect(b1).toEqual({ x: 0, y: 0 });
    expect(b2).toEqual({ x: 10, y: 10 });
    expect(b3).toEqual({ x: 10, y: 10 });
  });
});

describe('distanceToCubicSegment', () => {
  it('returns ~0 for point on straight cubic', () => {
    const b0 = { x: 0, y: 0 };
    const b1 = { x: 0, y: 0 };
    const b2 = { x: 10, y: 0 };
    const b3 = { x: 10, y: 0 };
    const { dist, t } = distanceToCubicSegment(b0, b1, b2, b3, { x: 5, y: 0 });
    expect(dist).toBeLessThan(0.1);
    expect(t).toBeGreaterThan(0.4);
    expect(t).toBeLessThan(0.6);
  });
});

describe('hitTestPathSegments', () => {
  it('hits horizontal segment', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    const hit = hitTestPathSegments(pts, false, { x: 50, y: 1 }, 5);
    expect(hit).not.toBeNull();
    expect(hit!.segmentIndex).toBe(0);
  });

  it('returns null when too far', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    const hit = hitTestPathSegments(pts, false, { x: 50, y: 30 }, 5);
    expect(hit).toBeNull();
  });
});

describe('pathSegmentCount', () => {
  it('counts wrap for closed', () => {
    const pts = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }];
    expect(pathSegmentCount(pts, true)).toBe(3);
    expect(pathSegmentCount(pts, false)).toBe(2);
  });
});

describe('insertPathAnchorOnSegment', () => {
  it('splits open path', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    const { points: next, insertedIndex } = insertPathAnchorOnSegment(pts, false, 0, 0.5);
    expect(next.length).toBe(3);
    expect(insertedIndex).toBe(1);
    expect(pathPointsToPathD(next, false)).toContain('C');
  });

  it('splits closing segment on closed path', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 50, y: 80 },
    ];
    const segLast = 2;
    const { points: next, insertedIndex } = insertPathAnchorOnSegment(pts, true, segLast, 0.5);
    expect(next.length).toBe(4);
    expect(insertedIndex).toBeGreaterThanOrEqual(0);
  });
});

describe('removePathAnchorAt', () => {
  it('refuses to shrink open path below 2', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    expect(removePathAnchorAt(pts, 0, false)).toBe(pts);
  });

  it('removes middle of open path', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 0 },
    ];
    const next = removePathAnchorAt(pts, 1, false);
    expect(next.length).toBe(2);
  });
});

describe('appendCornerAnchor / appendSmoothAnchor', () => {
  it('appendCornerAnchor adds bare point', () => {
    const n = appendCornerAnchor([{ x: 0, y: 0 }], 10, 20);
    expect(n[1]).toEqual({ x: 10, y: 20 });
  });

  it('appendSmoothAnchor adds symmetric handles', () => {
    const n = appendSmoothAnchor([], { x: 10, y: 10 }, { x: 20, y: 30 });
    expect(n[0]!.outX).toBeDefined();
    expect(n[0]!.inX).toBeDefined();
    expect(n[0]!.x).toBe(10);
  });
});

describe('pathPointsToSvgPathElement', () => {
  it('includes islands, fill-rule, and fill-opacity', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }];
    const islands = [[{ x: 2, y: 2 }, { x: 4, y: 2 }, { x: 2, y: 4 }]];
    const svg = pathPointsToSvgPathElement(pts, true, {
      fill: '#ff0000',
      islands,
      fillRule: 'evenodd',
      fillOpacity: 0.5,
    });

    expect(svg).toContain('M 0 0');
    expect(svg).toContain('M 2 2');
    expect(svg).toContain('fill="#ff0000"');
    expect(svg).toContain('fill-rule="evenodd"');
    expect(svg).toContain('fill-opacity="0.5"');
    expect(svg).toContain('Z');
  });

  it('omits fill-opacity if 1 or null', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
    const svg1 = pathPointsToSvgPathElement(pts, false, { fillOpacity: 1 });
    expect(svg1).not.toContain('fill-opacity');

    const svgNull = pathPointsToSvgPathElement(pts, false, { fillOpacity: undefined });
    expect(svgNull).not.toContain('fill-opacity');
  });
});

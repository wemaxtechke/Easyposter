import { describe, it, expect, beforeEach } from 'vitest';
import { usePosterStore } from '../store/posterStore';

function resetStore() {
  usePosterStore.setState({
    elements: [],
    canvasWidth: 800,
    canvasHeight: 600,
    canvasBackground: { type: 'solid', color: '#ffffff' },
    canvasZoom: 1,
    canvasPan: { x: 0, y: 0 },
    fitCenterNonce: 1,
    selectedIds: [],
    history: [[]],
    historyIndex: 0,
    fieldBindings: null,
    marqueeLocalPath: null,
    marqueeTargetId: null,
  });
}

beforeEach(() => {
  resetStore();
});

describe('Multi-island path conversion', () => {
  it('merges multiple islands into a single path element with evenodd fill rule', async () => {
    // Setup marquee state with two islands
    usePosterStore.setState({
      marqueeLocalPath: [
        [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
        [{ x: 25, y: 25 }, { x: 75, y: 25 }, { x: 75, y: 75 }, { x: 25, y: 75 }]
      ],
      marqueeTargetId: 'target-1',
      elements: [{ id: 'target-1', type: 'image', left: 100, top: 100, scaleX: 1, scaleY: 1, angle: 0, opacity: 1, zIndex: 1, src: '' }]
    });

    await usePosterStore.getState().confirmSelectionAsVector();

    const elements = usePosterStore.getState().elements;
    // target-1 + 1 merged path
    expect(elements).toHaveLength(2);

    const pathEl = elements.find(e => e.type === 'path') as any;
    expect(pathEl).toBeDefined();
    expect(pathEl.pathPoints).toHaveLength(4);
    expect(pathEl.islands).toHaveLength(1);
    expect(pathEl.islands[0]).toHaveLength(4);
    expect(pathEl.fillRule).toBe('evenodd');
  });

  it('combinePaths merges two separate path elements into one with an island', async () => {
    usePosterStore.setState({
      elements: [
        {
          id: 'path-1',
          type: 'path',
          left: 0,
          top: 0,
          scaleX: 1,
          scaleY: 1,
          angle: 0,
          opacity: 1,
          zIndex: 1,
          pathPoints: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
          closed: true,
          fill: '#ff0000'
        },
        {
          id: 'path-2',
          type: 'path',
          left: 25,
          top: 25,
          scaleX: 1,
          scaleY: 1,
          angle: 0,
          opacity: 1,
          zIndex: 2,
          pathPoints: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 0, y: 50 }],
          closed: true,
          fill: '#00ff00'
        }
      ]
    });

    usePosterStore.getState().combinePaths(['path-1', 'path-2']);

    const elements = usePosterStore.getState().elements;
    expect(elements).toHaveLength(1);

    const merged = elements[0] as any;
    expect(merged.id).toBe('path-1');
    expect(merged.islands).toHaveLength(1);
    // path-2 points transformed to path-1 local space.
    // path-2 was at (25,25) in scene. path-1 was at (0,0).
    // So transformed points should be offset by +25.
    expect(merged.islands[0][0]).toMatchObject({ x: 25, y: 25 });
    expect(merged.fillRule).toBe('evenodd');
  });
});

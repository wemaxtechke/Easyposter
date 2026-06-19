import { describe, it, expect } from 'vitest';
import { __testables } from '../fromReferenceDesignController.js';

describe('fromReferenceDesignController helpers', () => {
  it('converts image elements into placeholder paths', () => {
    const el = __testables.sanitizeElement({
      type: 'image',
      left: 40,
      top: 50,
      width: 240,
      height: 180,
      opacity: 0.8,
      scaleX: 1,
      scaleY: 1,
      angle: 0,
    });

    expect(el?.type).toBe('path');
    expect(el?.layerName).toBe('Image placeholder');
    expect(el?.closed).toBe(true);
    expect(Array.isArray(el?.pathPoints)).toBe(true);
    expect(el?.pathPoints).toHaveLength(8);
  });

  it('normalizes a parsed project and assigns ids and z-index', () => {
    const project = __testables.sanitizeProject(
      {
        canvasWidth: 900,
        canvasHeight: 1200,
        canvasBackground: { type: 'solid', color: '#112233' },
        elements: [
          { type: 'text', text: 'Hello', left: 10, top: 20, fontSize: 48, fontFamily: 'Arial', fill: '#000000' },
          { type: 'rect', left: 20, top: 30, width: 100, height: 50, fill: '#ffffff' },
        ],
      },
      { canvasWidth: 800, canvasHeight: 1200 }
    );

    expect(project.canvasWidth).toBe(900);
    expect(project.canvasHeight).toBe(1200);
    expect(project.canvasBackground).toEqual({ type: 'solid', color: '#112233' });
    expect(project.elements).toHaveLength(2);
    expect(project.elements[0].id).toMatch(/^el_/);
    expect(project.elements[0].zIndex).toBe(1);
    expect(project.elements[1].zIndex).toBe(2);
  });

  it('falls back to a sensible canvas size from aspect ratio', () => {
    expect(__testables.inferCanvasSize(2000, 1000)).toEqual({ canvasWidth: 1200, canvasHeight: 800 });
    expect(__testables.inferCanvasSize(1000, 2000)).toEqual({ canvasWidth: 800, canvasHeight: 1200 });
    expect(__testables.inferCanvasSize(1200, 1100)).toEqual({ canvasWidth: 800, canvasHeight: 800 });
  });

  it('renders a preview svg for the review loop', () => {
    const svg = __testables.projectPreviewSvg({
      canvasWidth: 800,
      canvasHeight: 1200,
      canvasBackground: { type: 'solid', color: '#ffffff' },
      elements: [
        {
          id: 'el_1',
          type: 'text',
          text: 'Hello world',
          left: 20,
          top: 30,
          scaleX: 1,
          scaleY: 1,
          angle: 0,
          opacity: 1,
          zIndex: 1,
          fontSize: 48,
          fontFamily: 'Arial',
          fill: '#111111',
          width: 240,
        },
        {
          id: 'el_2',
          type: 'rect',
          left: 40,
          top: 120,
          scaleX: 1,
          scaleY: 1,
          angle: 0,
          opacity: 0.5,
          zIndex: 2,
          width: 120,
          height: 80,
          fill: '#ff0000',
        },
      ],
    });

    expect(svg).toContain('<svg');
    expect(svg).toContain('Hello world');
    expect(svg).toContain('<rect');
  });
});

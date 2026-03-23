import type { PosterProject, PosterElement } from '../types';

/**
 * Build a project context suitable for sending to the AI.
 * - 3d-text: only layout props (id, type, left, top, scaleX, scaleY, angle, opacity, zIndex)
 * - image/3d-text: replace src/image data/blob URLs with placeholder to save tokens
 * - Truncate long text content
 */
export function buildProjectContextForAi(project: PosterProject): {
  canvasWidth: number;
  canvasHeight: number;
  canvasBackground: PosterProject['canvasBackground'];
  elements: object[];
} {
  if (!project?.elements) {
    return {
      canvasWidth: project?.canvasWidth ?? 800,
      canvasHeight: project?.canvasHeight ?? 600,
      canvasBackground: project?.canvasBackground ?? { type: 'solid', color: '#ffffff' },
      elements: [],
    };
  }
  const elements = project.elements.map((el: PosterElement) => {
    if (el.type === '3d-text') {
      return {
        id: el.id,
        type: '3d-text',
        left: el.left,
        top: el.top,
        scaleX: el.scaleX,
        scaleY: el.scaleY,
        angle: el.angle,
        opacity: el.opacity,
        zIndex: el.zIndex,
      };
    }
    const clone = { ...el } as Record<string, unknown>;
    if ('src' in el && typeof el.src === 'string' && (el.src.startsWith('data:') || el.src.startsWith('blob:'))) {
      clone.src = '[image]';
    }
    if ('text' in clone && typeof clone.text === 'string' && clone.text.length > 300) {
      clone.text = (clone.text as string).slice(0, 300) + '…';
    }
    return clone;
  });
  return {
    canvasWidth: project.canvasWidth ?? 800,
    canvasHeight: project.canvasHeight ?? 600,
    canvasBackground: project.canvasBackground ?? { type: 'solid', color: '#ffffff' },
    elements,
  };
}

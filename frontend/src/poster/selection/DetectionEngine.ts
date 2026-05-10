import { Canvas } from 'fabric';

export interface Point {
  x: number;
  y: number;
}

export class DetectionEngine {
  private canvas: Canvas;

  constructor(canvas: Canvas) {
    this.canvas = canvas;
  }

  public featherPath(path: Point[], amount: number): Point[] {
    // Simulated feathering by slightly expanding the path points
    const centerX = path.reduce((sum, p) => sum + p.x, 0) / path.length;
    const centerY = path.reduce((sum, p) => sum + p.y, 0) / path.length;

    return path.map(p => {
      const dx = p.x - centerX;
      const dy = p.y - centerY;
      const mag = Math.hypot(dx, dy);
      if (mag === 0) return p;
      return {
        x: p.x + (dx / mag) * amount,
        y: p.y + (dy / mag) * amount
      };
    });
  }

  public expandContractPath(path: Point[], amount: number): Point[] {
    // Normal-based expansion (more robust than center-scaling)
    const newPath: Point[] = [];
    for (let i = 0; i < path.length; i++) {
      const prev = path[(i - 1 + path.length) % path.length];
      const curr = path[i];
      const next = path[(i + 1) % path.length];

      const dx1 = curr.x - prev.x;
      const dy1 = curr.y - prev.y;
      const dx2 = next.x - curr.x;
      const dy2 = next.y - curr.y;

      const mag1 = Math.hypot(dx1, dy1) || 1;
      const mag2 = Math.hypot(dx2, dy2) || 1;

      // Edge normals
      const n1x = -dy1 / mag1;
      const n1y = dx1 / mag1;
      const n2x = -dy2 / mag2;
      const n2y = dx2 / mag2;

      // Average normal at vertex
      const nx = (n1x + n2x) / 2;
      const ny = (n1y + n2y) / 2;
      const magN = Math.hypot(nx, ny) || 1;

      newPath.push({
        x: curr.x + (nx / magN) * amount,
        y: curr.y + (ny / magN) * amount
      });
    }
    return newPath;
  }

  public invertSelection(path: Point[], canvasWidth: number, canvasHeight: number): Point[] {
    // Create a path that covers the whole canvas but has a hole for the selection
    return [
      { x: 0, y: 0 },
      { x: canvasWidth, y: 0 },
      { x: canvasWidth, y: canvasHeight },
      { x: 0, y: canvasHeight },
      { x: 0, y: 0 },
      ...path,
      path[0]
    ];
  }

  /**
   * Detects the dominant object within the given path.
   * For simplicity in this implementation, it finds the object with the largest intersection with the path.
   */
  public async detectObject(path: Point[]): Promise<string | null> {
    const objects = this.canvas.getObjects();
    const minX = Math.min(...path.map((p) => p.x));
    const maxX = Math.max(...path.map((p) => p.x));
    const minY = Math.min(...path.map((p) => p.y));
    const maxY = Math.max(...path.map((p) => p.y));

    let bestTargetId: string | null = null;
    let maxScore = 0;

    // Sample points in a grid to find the most "present" object
    const samples = 5;
    for (const obj of objects) {
      const posterId = (obj as any).data?.posterId;
      if (!posterId) continue;

      let score = 0;
      for (let i = 0; i <= samples; i++) {
        for (let j = 0; j <= samples; j++) {
          const px = minX + (maxX - minX) * (i / samples);
          const py = minY + (maxY - minY) * (j / samples);

          // Fabric's containsPoint works well for most shapes
          if (obj.containsPoint({ x: px, y: py } as any)) {
            score++;
          }
        }
      }

      if (score > maxScore) {
        maxScore = score;
        bestTargetId = posterId;
      }
    }

    return bestTargetId;
  }

  /**
   * Generates a precise path around the object.
   */
  public async generatePrecisePath(elementId: string): Promise<Point[] | null> {
    const obj = this.canvas.getObjects().find((o: any) => o.data?.posterId === elementId);
    if (!obj) return null;

    // For Fabric objects, we can get their coordinates
    const matrix = obj.calcTransformMatrix();

    if (obj.type === 'rect') {
      const w = (obj as any).width;
      const h = (obj as any).height;
      return this.transformPoints([
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: w, y: h },
        { x: 0, y: h }
      ], matrix, (obj as any).originX, (obj as any).originY, w, h);
    }

    if (obj.type === 'circle') {
      const r = (obj as any).radius;
      const pts: Point[] = [];
      for (let i = 0; i < 360; i += 10) {
        const rad = (i * Math.PI) / 180;
        pts.push({ x: r + r * Math.cos(rad), y: r + r * Math.sin(rad) });
      }
      return this.transformPoints(pts, matrix, (obj as any).originX, (obj as any).originY, r * 2, r * 2);
    }

    if (obj.type === 'ellipse') {
      const rx = (obj as any).rx;
      const ry = (obj as any).ry;
      const pts: Point[] = [];
      for (let i = 0; i < 360; i += 10) {
        const rad = (i * Math.PI) / 180;
        pts.push({ x: rx + rx * Math.cos(rad), y: ry + ry * Math.sin(rad) });
      }
      return this.transformPoints(pts, matrix, (obj as any).originX, (obj as any).originY, rx * 2, ry * 2);
    }

    if (obj.type === 'triangle') {
      const w = (obj as any).width;
      const h = (obj as any).height;
      return this.transformPoints([
        { x: w / 2, y: 0 },
        { x: w, y: h },
        { x: 0, y: h }
      ], matrix, (obj as any).originX, (obj as any).originY, w, h);
    }

    if (obj.type === 'polygon') {
      const pts = (obj as any).points;
      const w = (obj as any).width;
      const h = (obj as any).height;
      return this.transformPoints(pts, matrix, (obj as any).originX, (obj as any).originY, w, h);
    }

    if (obj.type === 'path') {
      const pathData = (obj as any).path;
      const pts: Point[] = [];
      // Simplified: just take the points from M and L commands
      for (const cmd of pathData) {
        if (cmd[0] === 'M' || cmd[0] === 'L') {
          pts.push({ x: cmd[1], y: cmd[2] });
        } else if (cmd[0] === 'Q') {
          pts.push({ x: cmd[1], y: cmd[2] });
          pts.push({ x: cmd[3], y: cmd[4] });
        } else if (cmd[0] === 'C') {
          pts.push({ x: cmd[1], y: cmd[2] });
          pts.push({ x: cmd[3], y: cmd[4] });
          pts.push({ x: cmd[5], y: cmd[6] });
        }
      }
      const w = (obj as any).width;
      const h = (obj as any).height;
      return this.transformPoints(pts, matrix, (obj as any).originX, (obj as any).originY, w, h);
    }

    // Default to bounding rect for others (images, etc)
    const rect = obj.getBoundingRect(true);
    let path = [
      { x: rect.left, y: rect.top },
      { x: rect.left + rect.width, y: rect.top },
      { x: rect.left + rect.width, y: rect.top + rect.height },
      { x: rect.left, y: rect.top + rect.height },
    ];

    // For AI selection, we "shrink-wrap" if it's an image with transparency
    if (obj.type === 'image') {
      const tight = await this.getTightBoundingBox(obj as any);
      if (tight) {
        path = [
          { x: tight.left, y: tight.top },
          { x: tight.left + tight.width, y: tight.top },
          { x: tight.left + tight.width, y: tight.top + tight.height },
          { x: tight.left, y: tight.top + tight.height },
        ];
      }
    }

    return path;
  }

  private async getTightBoundingBox(img: any): Promise<{left: number, top: number, width: number, height: number} | null> {
    // Basic pixel-based shrink wrap for images
    try {
      const element = img.getElement();
      if (!element) return null;

      const canvas = document.createElement('canvas');
      canvas.width = element.width;
      canvas.height = element.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;

      ctx.drawImage(element, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      let minX = canvas.width, maxX = 0, minY = canvas.height, maxY = 0;
      let found = false;

      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const alpha = data[(y * canvas.width + x) * 4 + 3];
          if (alpha > 10) { // threshold
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            found = true;
          }
        }
      }

      if (!found) return null;

      // Transform local tight box to canvas coordinates
      const rect = img.getBoundingRect(true);
      const scaleX = rect.width / canvas.width;
      const scaleY = rect.height / canvas.height;

      return {
        left: rect.left + minX * scaleX,
        top: rect.top + minY * scaleY,
        width: (maxX - minX) * scaleX,
        height: (maxY - minY) * scaleY
      };
    } catch (e) {
      console.error('Failed to get tight bounding box', e);
      return null;
    }
  }

  private transformPoints(pts: Point[], matrix: any, originX: string, originY: string, w: number, h: number): Point[] {
    let offsetX = 0;
    let offsetY = 0;
    if (originX === 'center') offsetX = w / 2;
    if (originY === 'center') offsetY = h / 2;

    return pts.map(p => {
      const x = p.x - offsetX;
      const y = p.y - offsetY;
      return {
        x: matrix[0] * x + matrix[2] * y + matrix[4],
        y: matrix[1] * x + matrix[3] * y + matrix[5]
      };
    });
  }

  /**
   * For Magnetic Lasso: Finds the nearest edge to a point.
   * Simple implementation: looks for objects and snaps to their bounding box edges.
   */
  public findNearestEdge(point: Point): Point {
    const objects = this.canvas.getObjects();
    let minDistance = Infinity;
    let nearestPoint = point;

    for (const obj of objects) {
      if (!(obj as any).data?.posterId) continue;
      const rect = obj.getBoundingRect(true);

      const edges = [
        { x1: rect.left, y1: rect.top, x2: rect.left + rect.width, y2: rect.top }, // top
        { x1: rect.left + rect.width, y1: rect.top, x2: rect.left + rect.width, y2: rect.top + rect.height }, // right
        { x1: rect.left, y1: rect.top + rect.height, x2: rect.left + rect.width, y2: rect.top + rect.height }, // bottom
        { x1: rect.left, y1: rect.top, x2: rect.left, y2: rect.top + rect.height } // left
      ];

      for (const edge of edges) {
        const p = this.getClosestPointOnSegment(point, edge.x1, edge.y1, edge.x2, edge.y2);
        const dist = Math.hypot(p.x - point.x, p.y - point.y);
        if (dist < minDistance && dist < 30) { // Snapping threshold 30px
          minDistance = dist;
          nearestPoint = p;
        }
      }
    }

    return nearestPoint;
  }

  private getClosestPointOnSegment(p: Point, x1: number, y1: number, x2: number, y2: number): Point {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq === 0) return { x: x1, y: y1 };

    let t = ((p.x - x1) * dx + (p.y - y1) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));

    return {
      x: x1 + t * dx,
      y: y1 + t * dy
    };
  }

  /**
   * Converts a Point array to a Fabric.js Path string.
   */
  public static pointsToPathData(points: Point[]): string {
    if (points.length < 2) return '';
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      d += ` L ${points[i].x} ${points[i].y}`;
    }
    d += ' Z';
    return d;
  }
}

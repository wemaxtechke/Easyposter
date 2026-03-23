import { useEffect, useRef, useState, memo } from 'react';
import type {
  PosterProject,
  PosterElement,
  PosterTextElement,
  PosterShapeElement,
  CanvasBackground,
  PosterShapeFill,
  GradientStop,
} from '../types';
import { getPosterShapeLocalSize, lineStrokeFromFill, shapeFillFallbackForType } from '../posterShapeGeometry';
import {
  rectHasPerCornerRadii,
  roundedRectPathD,
  perCornerRadiiFromShape,
} from '../roundedRectPath';

interface TemplateThumbnailProps {
  project: PosterProject;
  /** Pre-captured PNG (data URL or HTTP URL). When set, displayed as <img> instead of canvas. */
  thumbnail?: string;
  width?: number;
  height?: number;
  className?: string;
}

function fillBackground(
  ctx: CanvasRenderingContext2D,
  bg: CanvasBackground | undefined,
  w: number,
  h: number,
  fallbackColor?: string,
): void {
  if (!bg) {
    ctx.fillStyle = fallbackColor ?? '#ffffff';
    ctx.fillRect(0, 0, w, h);
    return;
  }
  if (bg.type === 'solid') {
    ctx.fillStyle = bg.color;
    ctx.fillRect(0, 0, w, h);
    return;
  }
  const stopsArr = bg.stops ?? [];
  if (bg.type === 'linear') {
    const rad = (bg.angle * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const g = ctx.createLinearGradient(
      w * (0.5 - cos * 0.5), h * (0.5 - sin * 0.5),
      w * (0.5 + cos * 0.5), h * (0.5 + sin * 0.5),
    );
    stopsArr.forEach((s) => { try { g.addColorStop(s.offset, s.color); } catch { /* skip */ } });
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    return;
  }
  if (bg.type === 'radial') {
    const cx = (bg.cx ?? 0.5) * w;
    const cy = (bg.cy ?? 0.5) * h;
    const r = Math.max(w, h) * (bg.r ?? 0.5);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    stopsArr.forEach((s) => { try { g.addColorStop(s.offset, s.color); } catch { /* skip */ } });
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    return;
  }
  ctx.fillStyle = fallbackColor ?? '#ffffff';
  ctx.fillRect(0, 0, w, h);
}

function resolveShapeFill(
  ctx: CanvasRenderingContext2D,
  fill: string | PosterShapeFill,
  x: number, y: number, w: number, h: number,
): string | CanvasGradient {
  if (typeof fill === 'string') return fill;
  const stops = (fill as { stops?: GradientStop[] }).stops ?? [];
  if (fill.type === 'solid') return fill.color;
  if (fill.type === 'linear') {
    const rad = ((fill.angle ?? 0) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const g = ctx.createLinearGradient(
      x + w * (0.5 - cos * 0.5), y + h * (0.5 - sin * 0.5),
      x + w * (0.5 + cos * 0.5), y + h * (0.5 + sin * 0.5),
    );
    stops.forEach((s) => { try { g.addColorStop(s.offset, s.color); } catch { /* skip */ } });
    return g;
  }
  if (fill.type === 'radial') {
    const cx = x + (fill.cx ?? 0.5) * w;
    const cy = y + (fill.cy ?? 0.5) * h;
    const r = Math.max(w, h) * (fill.r ?? 0.5);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    stops.forEach((s) => { try { g.addColorStop(s.offset, s.color); } catch { /* skip */ } });
    return g;
  }
  return '#cccccc';
}

function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function stripPlaceholders(text: string): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const spaced = key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim();
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
  });
}

function renderElement(
  ctx: CanvasRenderingContext2D,
  el: PosterElement,
  scale: number,
): void {
  ctx.save();
  ctx.globalAlpha = el.opacity ?? 1;
  const sx = (el.scaleX ?? 1) * scale;
  const sy = (el.scaleY ?? 1) * scale;
  const x = el.left * scale;
  const y = el.top * scale;

  if (el.angle) {
    ctx.translate(x, y);
    ctx.rotate((el.angle * Math.PI) / 180);
    ctx.translate(-x, -y);
  }

  switch (el.type) {
    case 'rect': {
      const shape = el as PosterShapeElement;
      const bw = shape.width ?? 100;
      const bh = shape.height ?? 80;
      const w = bw * sx;
      const h = bh * sy;
      const fillOpacity = shape.fillOpacity ?? 1;
      const stroke = shape.stroke && (shape.strokeWidth ?? 0) > 0 ? shape.stroke : '';
      const strokeW = stroke ? (shape.strokeWidth ?? 2) * scale * Math.max(sx, sy) : 0;
      if (rectHasPerCornerRadii(shape)) {
        const { tl, tr, br, bl } = perCornerRadiiFromShape(shape);
        const d = roundedRectPathD(bw, bh, tl, tr, br, bl);
        ctx.translate(x, y);
        ctx.scale(sx, sy);
        ctx.fillStyle = resolveShapeFill(ctx, shape.fill, 0, 0, bw, bh);
        ctx.save();
        ctx.globalAlpha *= fillOpacity;
        try {
          ctx.fill(new Path2D(d));
        } catch {
          ctx.fillRect(0, 0, bw, bh);
        }
        ctx.restore();
        if (strokeW) {
          ctx.strokeStyle = stroke;
          ctx.lineWidth = strokeW;
          try {
            ctx.stroke(new Path2D(d));
          } catch {
            ctx.strokeRect(0, 0, bw, bh);
          }
        }
        ctx.scale(1 / sx, 1 / sy);
        ctx.translate(-x, -y);
        break;
      }
      const rx = (shape.rx ?? 0) * scale;
      const fill = resolveShapeFill(ctx, shape.fill, x, y, w, h);
      ctx.fillStyle = fill;
      if (rx > 0) drawRoundRect(ctx, x, y, w, h, rx);
      else {
        ctx.beginPath();
        ctx.rect(x, y, w, h);
      }
      ctx.save();
      ctx.globalAlpha *= fillOpacity;
      ctx.fill();
      ctx.restore();
      if (strokeW) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = strokeW;
        ctx.stroke();
      }
      break;
    }
    case 'circle': {
      const shape = el as PosterShapeElement;
      const r = (shape.radius ?? 50) * scale;
      const fillOpacity = shape.fillOpacity ?? 1;
      const stroke = shape.stroke && (shape.strokeWidth ?? 0) > 0 ? shape.stroke : '';
      const strokeW = stroke ? (shape.strokeWidth ?? 2) * scale * Math.max(sx, sy) : 0;
      const fill = resolveShapeFill(ctx, shape.fill, x, y, r * 2, r * 2);
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(x + r, y + r, r, 0, Math.PI * 2);
      ctx.save();
      ctx.globalAlpha *= fillOpacity;
      ctx.fill();
      ctx.restore();
      if (strokeW) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = strokeW;
        ctx.stroke();
      }
      break;
    }
    case 'text': {
      const t = el as PosterTextElement;
      const fSize = Math.max(4, (t.fontSize ?? 16) * scale);
      const weight = t.fontWeight === 'bold' || t.fontWeight === 700 || t.fontWeight === '700' ? 'bold' : 'normal';
      const style = t.fontStyle === 'italic' ? 'italic' : 'normal';
      ctx.font = `${style} ${weight} ${fSize}px ${t.fontFamily || 'system-ui, sans-serif'}`;
      ctx.textBaseline = 'top';
      const fillOpacity = t.fillOpacity ?? 1;
      let fillColor = t.fill ?? '#000000';
      if (t.fillGradient?.stops?.[0]?.color) fillColor = t.fillGradient.stops[0].color;
      if (fillOpacity < 1) {
        const m = fillColor.match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
        if (m) {
          let hex = m[1];
          if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
          const r = parseInt(hex.slice(0, 2), 16);
          const g = parseInt(hex.slice(2, 4), 16);
          const b = parseInt(hex.slice(4, 6), 16);
          fillColor = `rgba(${r},${g},${b},${fillOpacity})`;
        }
      }
      ctx.fillStyle = fillOpacity <= 0 ? 'transparent' : fillColor;
      const strokeW = (t.strokeWidth ?? 0) * scale * Math.max(sx, sy);
      const strokeColor = t.stroke && strokeW > 0 ? t.stroke : undefined;
      const displayText = stripPlaceholders(t.text ?? '');
      const maxW = (t.width ?? 300) * sx;
      wrapText(ctx, displayText, x, y, maxW, fSize * 1.25, strokeColor, strokeW);
      break;
    }
    case 'image': {
      const w = 80 * sx;
      const h = 60 * sy;
      ctx.fillStyle = '#e4e4e7';
      drawRoundRect(ctx, x, y, w, h, 4 * scale);
      ctx.fill();
      ctx.fillStyle = '#a1a1aa';
      const iconSize = Math.min(w, h) * 0.35;
      const cx = x + w / 2;
      const cy = y + h / 2;
      ctx.beginPath();
      ctx.arc(cx - iconSize * 0.25, cy - iconSize * 0.15, iconSize * 0.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx - iconSize * 0.5, cy + iconSize * 0.4);
      ctx.lineTo(cx, cy - iconSize * 0.1);
      ctx.lineTo(cx + iconSize * 0.5, cy + iconSize * 0.4);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case '3d-text': {
      const w = 100 * sx;
      const h = 40 * sy;
      ctx.fillStyle = '#fef3c7';
      drawRoundRect(ctx, x, y, w, h, 4 * scale);
      ctx.fill();
      ctx.fillStyle = '#92400e';
      const fSize = Math.max(4, 10 * scale);
      ctx.font = `bold ${fSize}px system-ui, sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText('3D', x + w / 2, y + h / 2);
      ctx.textAlign = 'start';
      break;
    }
    case 'triangle': {
      const shape = el as PosterShapeElement;
      const w = (shape.width ?? 100) * sx;
      const h = (shape.height ?? 100) * sy;
      const fillOpacity = shape.fillOpacity ?? 1;
      const stroke = shape.stroke && (shape.strokeWidth ?? 0) > 0 ? shape.stroke : '';
      const strokeW = stroke ? (shape.strokeWidth ?? 2) * scale * Math.max(sx, sy) : 0;
      const fill = resolveShapeFill(ctx, shape.fill, x, y, w, h);
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(x + w / 2, y);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x, y + h);
      ctx.closePath();
      ctx.save();
      ctx.globalAlpha *= fillOpacity;
      ctx.fill();
      ctx.restore();
      if (strokeW) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = strokeW;
        ctx.stroke();
      }
      break;
    }
    case 'ellipse': {
      const shape = el as PosterShapeElement;
      const rx = (shape.rx ?? 60) * sx;
      const ry = (shape.ry ?? 40) * sy;
      const w = rx * 2;
      const h = ry * 2;
      const fillOpacity = shape.fillOpacity ?? 1;
      const stroke = shape.stroke && (shape.strokeWidth ?? 0) > 0 ? shape.stroke : '';
      const strokeW = stroke ? (shape.strokeWidth ?? 2) * scale * Math.max(sx, sy) : 0;
      const fill = resolveShapeFill(ctx, shape.fill, x, y, w, h);
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.ellipse(x + rx, y + ry, rx, ry, 0, 0, Math.PI * 2);
      ctx.save();
      ctx.globalAlpha *= fillOpacity;
      ctx.fill();
      ctx.restore();
      if (strokeW) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = strokeW;
        ctx.stroke();
      }
      break;
    }
    case 'line': {
      const shape = el as PosterShapeElement;
      const x1 = x + (shape.x1 ?? 0) * sx;
      const y1 = y + (shape.y1 ?? 0) * sy;
      const x2 = x + (shape.x2 ?? 0) * sx;
      const y2 = y + (shape.y2 ?? 0) * sy;
      const cx = shape.curveControl
        ? x + shape.curveControl.x * sx
        : (x1 + x2) / 2;
      const cy = shape.curveControl
        ? y + shape.curveControl.y * sy
        : (y1 + y2) / 2;
      ctx.strokeStyle = lineStrokeFromFill(shape.fill, shapeFillFallbackForType('line'));
      ctx.lineWidth = (shape.strokeWidth ?? 4) * scale * Math.max(el.scaleX ?? 1, el.scaleY ?? 1);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      if (shape.curveControl) {
        ctx.quadraticCurveTo(cx, cy, x2, y2);
      } else {
        ctx.lineTo(x2, y2);
      }
      ctx.stroke();
      break;
    }
    case 'polygon': {
      const shape = el as PosterShapeElement;
      const pts = shape.polygonPoints;
      if (!pts?.length) break;
      const { w: bw, h: bh } = getPosterShapeLocalSize(shape);
      const fillOpacity = shape.fillOpacity ?? 1;
      const stroke = shape.stroke && (shape.strokeWidth ?? 0) > 0 ? shape.stroke : '';
      const strokeW = stroke ? (shape.strokeWidth ?? 2) * scale * Math.max(sx, sy) : 0;
      const fill = resolveShapeFill(ctx, shape.fill, x, y, bw * sx, bh * sy);
      ctx.fillStyle = fill;
      ctx.beginPath();
      pts.forEach((p, i) => {
        const px = x + p.x * sx;
        const py = y + p.y * sy;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.save();
      ctx.globalAlpha *= fillOpacity;
      ctx.fill();
      ctx.restore();
      if (strokeW) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = strokeW;
        ctx.stroke();
      }
      break;
    }
    default:
      break;
  }
  ctx.restore();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  lineH: number,
  strokeColor?: string,
  strokeWidth?: number,
): void {
  const words = text.split(/\s+/);
  let line = '';
  let curY = y;
  const drawLine = (l: string, cx: number, cy: number) => {
    if (strokeColor && strokeWidth && strokeWidth > 0) {
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeWidth;
      ctx.strokeText(l, cx, cy);
    }
    ctx.fillText(l, cx, cy);
  };
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      drawLine(line, x, curY);
      line = word;
      curY += lineH;
    } else {
      line = test;
    }
  }
  if (line) drawLine(line, x, curY);
}

/**
 * Canvas-based fallback renderer when no saved thumbnail exists.
 */
const CanvasFallbackThumbnail = memo(function CanvasFallbackThumbnail({
  project,
  width: renderW,
  height: renderH,
  className,
}: {
  project: PosterProject;
  width: number;
  height: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cw = project.canvasWidth || 800;

  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const dpr = Math.min(window.devicePixelRatio, 2);
    cvs.width = renderW * dpr;
    cvs.height = renderH * dpr;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const scale = renderW / cw;
    const bg = project.canvasBackground ?? (project as { canvasBackgroundColor?: string }).canvasBackgroundColor
      ? project.canvasBackground
      : undefined;
    fillBackground(ctx, bg, renderW, renderH, (project as { canvasBackgroundColor?: string }).canvasBackgroundColor);

    const sorted = [...(project.elements ?? [])].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
    for (const el of sorted) {
      renderElement(ctx, el, scale);
    }
  }, [project, renderW, renderH, cw]);

  return (
    <canvas
      ref={canvasRef}
      width={renderW}
      height={renderH}
      className={className}
      style={{ width: renderW, height: renderH }}
    />
  );
});

export const TemplateThumbnail = memo(function TemplateThumbnail({
  project,
  thumbnail,
  width = 240,
  height: heightProp,
  className,
}: TemplateThumbnailProps) {
  const cw = project.canvasWidth || 800;
  const ch = project.canvasHeight || 600;
  const aspect = ch / cw;
  const renderW = width;
  const renderH = heightProp ?? Math.round(width * aspect);

  const [imgError, setImgError] = useState(false);

  if (thumbnail && !imgError) {
    return (
      <img
        src={thumbnail}
        alt="Template preview"
        width={renderW}
        height={renderH}
        className={className}
        style={{ width: renderW, height: renderH, objectFit: 'cover' }}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <CanvasFallbackThumbnail
      project={project}
      width={renderW}
      height={renderH}
      className={className}
    />
  );
});

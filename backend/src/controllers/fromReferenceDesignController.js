import OpenAI from 'openai';
import sharp from 'sharp';
import User, { FREE_TIER_TOKEN_LIMIT } from '../models/User.js';
import { incrementTokenUsage } from '../utils/tokenAccounting.js';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const FROM_REFERENCE_SYSTEM_PROMPT = `You are a professional poster reconstruction AI for Sanaa Studio.

The user provides a reference poster image and wants a brand-new editable poster project that closely matches it.

OUTPUT FORMAT - strict JSON only, no markdown, no fences, no extra text:
{
  "canvasWidth": <number>,
  "canvasHeight": <number>,
  "canvasBackground": { "type": "solid" | "linear" | "radial", ... },
  "elements": [ ... ]
}

CANVAS RULES:
- Match the reference aspect ratio as closely as possible.
- Use sensible poster dimensions: portrait 800x1200, landscape 1200x800, square 800x800, or A4-ish 794x1123.
- The canvas defines the coordinate system for every element.

BACKGROUND:
- Use a solid color when the background is mostly flat.
- Use a gradient object when the background clearly blends.

ELEMENT RULES:
- Recreate every visible text block, line, divider, block, and decorative shape.
- Keep text exactly as seen in the reference.
- Do not invent content that is not visible.
- For any photo, illustration, or non-reconstructable image area, create a placeholder SHAPE instead of an image.
- Placeholders should look like a simplified silhouette or framed region using a path or rect with a neutral fill and layerName like "Image placeholder".
- Never emit real image src URLs.

TEXT ELEMENTS:
{
  "type": "text",
  "text": "<visible text>",
  "left": <number>,
  "top": <number>,
  "scaleX": 1,
  "scaleY": 1,
  "angle": 0,
  "opacity": 1,
  "fontSize": <number>,
  "fontFamily": "Arial",
  "fill": "#000000",
  "width": <number>,
  "fontWeight": "normal" or "bold",
  "fontStyle": "normal" or "italic",
  "textAlign": "left" or "center" or "right"
}

SHAPE ELEMENTS:
- Use rect, circle, ellipse, triangle, line, polygon, or path to reproduce the layout.
- For image placeholders, prefer a path shaped as a simplified silhouette or framed region.

STRICT RULES:
1. Output only JSON.
2. Include all visible design elements.
3. Do not include zIndex or id; those are assigned by the server.
4. If unsure, prefer a simpler placeholder shape over fabricating details.`;

const FROM_REFERENCE_REVIEW_PROMPT = `You are reviewing a draft poster project against the same reference image.

Improve accuracy, spacing, typography, and the placement of placeholders. Keep every unresolved image region as a placeholder shape. Return only the corrected JSON project, no markdown, no fences, no commentary.`;

function parseJsonResponse(content) {
  if (!content || typeof content !== 'string') return null;
  const cleaned = content.replace(/```(?:json)?\s*|\s*```/g, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[0]);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }
}

function normalizeBackground(bg) {
  if (!bg) return { type: 'solid', color: '#ffffff' };
  if (typeof bg === 'string') return { type: 'solid', color: bg };
  if (bg.type === 'solid' || bg.type === 'linear' || bg.type === 'radial') return bg;
  return { type: 'solid', color: '#ffffff' };
}

function assignIdsAndZIndex(elements) {
  if (!Array.isArray(elements)) return [];
  return elements.map((el, i) => ({
    ...el,
    id: `el_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    zIndex: i + 1,
    scaleX: el.scaleX ?? 1,
    scaleY: el.scaleY ?? 1,
    angle: el.angle ?? 0,
    opacity: el.opacity ?? 1,
  }));
}

function inferCanvasSize(width, height) {
  if (!width || !height || !Number.isFinite(width) || !Number.isFinite(height)) {
    return { canvasWidth: 800, canvasHeight: 1200 };
  }

  const ratio = width / height;
  if (ratio > 1.15) return { canvasWidth: 1200, canvasHeight: 800 };
  if (ratio < 0.87) return { canvasWidth: 800, canvasHeight: 1200 };
  return { canvasWidth: 800, canvasHeight: 800 };
}

function roundedPlaceholderPath(width, height, cutRatio = 0.12) {
  const safeWidth = Math.max(24, Math.round(width));
  const safeHeight = Math.max(24, Math.round(height));
  const cutX = Math.max(4, Math.round(safeWidth * cutRatio));
  const cutY = Math.max(4, Math.round(safeHeight * cutRatio));
  return [
    { x: cutX, y: 0 },
    { x: safeWidth - cutX, y: 0 },
    { x: safeWidth, y: cutY },
    { x: safeWidth, y: safeHeight - cutY },
    { x: safeWidth - cutX, y: safeHeight },
    { x: cutX, y: safeHeight },
    { x: 0, y: safeHeight - cutY },
    { x: 0, y: cutY },
  ];
}

function getElementSize(el) {
  const radius = Number(el.radius ?? 0);
  const rawWidth = Number(el.width ?? el.w ?? 0);
  const rawHeight = Number(el.height ?? el.h ?? 0);
  return {
    width: rawWidth > 0 ? rawWidth : radius > 0 ? radius * 2 : 160,
    height: rawHeight > 0 ? rawHeight : radius > 0 ? radius * 2 : 120,
  };
}

function normalizePathPoints(points, width, height) {
  if (!Array.isArray(points) || points.length < 3) return roundedPlaceholderPath(width, height);
  return points
    .filter((p) => p && typeof p.x === 'number' && typeof p.y === 'number')
    .map((p) => ({
      x: Math.max(0, Math.min(width, p.x)),
      y: Math.max(0, Math.min(height, p.y)),
      ...(typeof p.inX === 'number' ? { inX: p.inX } : {}),
      ...(typeof p.inY === 'number' ? { inY: p.inY } : {}),
      ...(typeof p.outX === 'number' ? { outX: p.outX } : {}),
      ...(typeof p.outY === 'number' ? { outY: p.outY } : {}),
    }));
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function colorStopList(fill) {
  if (!fill || typeof fill === 'string') return null;
  if (fill.type === 'solid') return null;
  const stops = Array.isArray(fill.stops) ? fill.stops : [];
  if (stops.length < 2) return null;
  return stops
    .filter((s) => s && typeof s.color === 'string')
    .map((s) => ({ offset: Math.max(0, Math.min(1, Number(s.offset ?? 0))), color: s.color }));
}

function fillToSvgPaint(fill, defs, keyBase) {
  if (!fill || typeof fill === 'string') return escapeXml(fill || '#cccccc');
  const gradientStops = colorStopList(fill);
  if (!gradientStops) {
    if (fill.type === 'solid') return escapeXml(fill.color || '#cccccc');
    return '#cccccc';
  }
  const id = `${keyBase}_${defs.length}`;
  if (fill.type === 'linear') {
    const angle = Number(fill.angle ?? 0) * (Math.PI / 180);
    const x1 = 50 - Math.cos(angle) * 50;
    const y1 = 50 - Math.sin(angle) * 50;
    const x2 = 50 + Math.cos(angle) * 50;
    const y2 = 50 + Math.sin(angle) * 50;
    defs.push(
      `<linearGradient id="${id}" x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%">` +
        gradientStops.map((s) => `<stop offset="${s.offset * 100}%" stop-color="${escapeXml(s.color)}"/>`).join('') +
      `</linearGradient>`
    );
    return `url(#${id})`;
  }
  if (fill.type === 'radial') {
    defs.push(
      `<radialGradient id="${id}" cx="${Number(fill.cx ?? 0.5) * 100}%" cy="${Number(fill.cy ?? 0.5) * 100}%" r="${Number(fill.r ?? 0.5) * 100}%">` +
        gradientStops.map((s) => `<stop offset="${s.offset * 100}%" stop-color="${escapeXml(s.color)}"/>`).join('') +
      `</radialGradient>`
    );
    return `url(#${id})`;
  }
  return '#cccccc';
}

function pointsToSvgPath(points, closed = true) {
  if (!Array.isArray(points) || points.length === 0) return '';
  const cmds = [`M ${points[0].x} ${points[0].y}`];
  for (let i = 1; i < points.length; i++) {
    cmds.push(`L ${points[i].x} ${points[i].y}`);
  }
  if (closed) cmds.push('Z');
  return cmds.join(' ');
}

function projectPreviewSvg(project) {
  const width = Math.max(1, Math.round(project?.canvasWidth ?? 800));
  const height = Math.max(1, Math.round(project?.canvasHeight ?? 1200));
  const defs = [];
  const sorted = Array.isArray(project?.elements) ? [...project.elements].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)) : [];
  const body = [];

  const bg = normalizeBackground(project?.canvasBackground);
  if (bg.type === 'solid') {
    body.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="${escapeXml(bg.color || '#ffffff')}"/>`);
  } else {
    const bgPaint = fillToSvgPaint(bg, defs, 'bg');
    body.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="${bgPaint}"/>`);
  }

  for (const el of sorted) {
    if (!el || typeof el !== 'object') continue;
    const opacity = Number(el.opacity ?? 1);
    const left = Number(el.left ?? 0);
    const top = Number(el.top ?? 0);
    const rotate = Number(el.angle ?? 0);
    const sx = Number(el.scaleX ?? 1);
    const sy = Number(el.scaleY ?? 1);
    const transforms = [`translate(${left} ${top})`];
    if (rotate) transforms.push(`rotate(${rotate})`);
    if (sx !== 1 || sy !== 1) transforms.push(`scale(${sx} ${sy})`);
    const transformAttr = transforms.length > 0 ? ` transform="${transforms.join(' ')}"` : '';

    if (el.type === 'text') {
      const fontSize = Number(el.fontSize ?? 32);
      const fill = escapeXml(typeof el.fill === 'string' ? el.fill : '#111111');
      const text = escapeXml(String(el.text ?? '').slice(0, 400));
      body.push(
        `<text x="0" y="${fontSize}" font-family="${escapeXml(el.fontFamily || 'Arial')}" font-size="${fontSize}" font-weight="${escapeXml(el.fontWeight || 'normal')}" font-style="${escapeXml(el.fontStyle || 'normal')}" fill="${fill}" opacity="${opacity}"${transformAttr}>` +
          `<tspan>${text}</tspan>` +
        `</text>`
      );
      continue;
    }

    if (el.type === 'rect') {
      const widthEl = Number(el.width ?? 100);
      const heightEl = Number(el.height ?? 80);
      const fill = fillToSvgPaint(el.fill, defs, 'fill');
      const rx = Number(el.rx ?? 0);
      body.push(`<rect x="${left}" y="${top}" width="${widthEl}" height="${heightEl}" rx="${rx}" fill="${fill}" opacity="${opacity}"/>`);
      continue;
    }

    if (el.type === 'circle') {
      const radius = Number(el.radius ?? 50);
      const fill = fillToSvgPaint(el.fill, defs, 'fill');
      body.push(`<circle cx="${left + radius}" cy="${top + radius}" r="${radius}" fill="${fill}" opacity="${opacity}"/>`);
      continue;
    }

    if (el.type === 'ellipse') {
      const rx = Number(el.rx ?? 60);
      const ry = Number(el.ry ?? 40);
      const fill = fillToSvgPaint(el.fill, defs, 'fill');
      body.push(`<ellipse cx="${left + rx}" cy="${top + ry}" rx="${rx}" ry="${ry}" fill="${fill}" opacity="${opacity}"/>`);
      continue;
    }

    if (el.type === 'triangle') {
      const widthEl = Number(el.width ?? 100);
      const heightEl = Number(el.height ?? 100);
      const fill = fillToSvgPaint(el.fill, defs, 'fill');
      const points = `0,${heightEl} ${widthEl / 2},0 ${widthEl},${heightEl}`;
      body.push(`<polygon points="${points}" fill="${fill}" opacity="${opacity}" transform="translate(${left} ${top})"/>`);
      continue;
    }

    if (el.type === 'line') {
      const x1 = Number(el.x1 ?? 0);
      const y1 = Number(el.y1 ?? 0);
      const x2 = Number(el.x2 ?? 100);
      const y2 = Number(el.y2 ?? 0);
      const stroke = escapeXml(typeof el.fill === 'string' ? el.fill : '#111111');
      const strokeWidth = Number(el.strokeWidth ?? 4);
      if (el.curveControl) {
        const cx = Number(el.curveControl.x ?? (x1 + x2) / 2);
        const cy = Number(el.curveControl.y ?? (y1 + y2) / 2);
        body.push(`<path d="M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}" transform="translate(${left} ${top})"/>`);
      } else {
        body.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}" transform="translate(${left} ${top})"/>`);
      }
      continue;
    }

    if (el.type === 'polygon') {
      const pts = Array.isArray(el.polygonPoints) ? el.polygonPoints : [];
      if (!pts.length) continue;
      const fill = fillToSvgPaint(el.fill, defs, 'fill');
      const points = pts.map((p) => `${p.x},${p.y}`).join(' ');
      body.push(`<polygon points="${points}" fill="${fill}" opacity="${opacity}" transform="translate(${left} ${top})"/>`);
      continue;
    }

    if (el.type === 'path') {
      const pts = Array.isArray(el.pathPoints) ? el.pathPoints : [];
      if (!pts.length) continue;
      const fill = fillToSvgPaint(el.fill, defs, 'fill');
      const d = pointsToSvgPath(pts, el.closed !== false);
      const stroke = typeof el.stroke === 'string' ? escapeXml(el.stroke) : 'none';
      const strokeWidth = Number(el.strokeWidth ?? 0);
      body.push(`<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}" transform="translate(${left} ${top})"/>`);
      continue;
    }
  }

  const defsBlock = defs.length > 0 ? `<defs>${defs.join('')}</defs>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${defsBlock}${body.join('')}</svg>`;
}

async function projectPreviewDataUrl(project) {
  const svg = projectPreviewSvg(project);
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return `data:image/png;base64,${png.toString('base64')}`;
}

function sanitizeElement(el) {
  if (!el || typeof el !== 'object' || typeof el.type !== 'string') return null;

  if (el.type === 'image') {
    const { width, height } = getElementSize(el);
    return {
      type: 'path',
      left: Number(el.left ?? 0),
      top: Number(el.top ?? 0),
      scaleX: Number(el.scaleX ?? 1),
      scaleY: Number(el.scaleY ?? 1),
      angle: Number(el.angle ?? 0),
      opacity: Number(el.opacity ?? 0.35),
      fill: '#d9d9d9',
      stroke: '#9ca3af',
      strokeWidth: 2,
      fillOpacity: 0.25,
      layerName: 'Image placeholder',
      pathPoints: roundedPlaceholderPath(width, height),
      closed: true,
    };
  }

  if (el.type === 'path') {
    const { width, height } = getElementSize(el);
    return {
      ...el,
      pathPoints: normalizePathPoints(el.pathPoints, width, height),
      closed: el.closed ?? true,
      fill: typeof el.fill === 'string' || typeof el.fill === 'object' ? el.fill : '#d9d9d9',
      fillOpacity: typeof el.fillOpacity === 'number' ? el.fillOpacity : 1,
      strokeWidth: typeof el.strokeWidth === 'number' ? el.strokeWidth : 0,
      left: Number(el.left ?? 0),
      top: Number(el.top ?? 0),
      scaleX: Number(el.scaleX ?? 1),
      scaleY: Number(el.scaleY ?? 1),
      angle: Number(el.angle ?? 0),
      opacity: Number(el.opacity ?? 1),
    };
  }

  if (el.type === 'text') {
    return {
      ...el,
      text: typeof el.text === 'string' ? el.text : '',
      left: Number(el.left ?? 0),
      top: Number(el.top ?? 0),
      scaleX: Number(el.scaleX ?? 1),
      scaleY: Number(el.scaleY ?? 1),
      angle: Number(el.angle ?? 0),
      opacity: Number(el.opacity ?? 1),
      fontSize: Number(el.fontSize ?? 32),
      fontFamily: typeof el.fontFamily === 'string' ? el.fontFamily : 'Arial',
      fill: typeof el.fill === 'string' ? el.fill : '#111111',
      width: typeof el.width === 'number' ? el.width : 200,
      fontWeight:
        typeof el.fontWeight === 'string' || typeof el.fontWeight === 'number' ? el.fontWeight : 'normal',
      fontStyle: el.fontStyle === 'italic' ? 'italic' : 'normal',
      textAlign: el.textAlign === 'center' || el.textAlign === 'right' ? el.textAlign : 'left',
    };
  }

  return {
    ...el,
    left: Number(el.left ?? 0),
    top: Number(el.top ?? 0),
    scaleX: Number(el.scaleX ?? 1),
    scaleY: Number(el.scaleY ?? 1),
    angle: Number(el.angle ?? 0),
    opacity: Number(el.opacity ?? 1),
  };
}

function sanitizeProject(parsed, fallbackSize) {
  const elements = Array.isArray(parsed?.elements) ? parsed.elements.map(sanitizeElement).filter(Boolean) : [];
  return {
    canvasWidth: Number(parsed?.canvasWidth ?? fallbackSize.canvasWidth ?? 800),
    canvasHeight: Number(parsed?.canvasHeight ?? fallbackSize.canvasHeight ?? 1200),
    canvasBackground: normalizeBackground(parsed?.canvasBackground),
    elements: assignIdsAndZIndex(elements),
  };
}

async function runGenerationPass(openai, imageDataUrl, draftProject = null) {
  const draftPreviewDataUrl = draftProject ? await projectPreviewDataUrl(draftProject) : null;
  const messages = draftProject
    ? [
        { role: 'system', content: FROM_REFERENCE_REVIEW_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: `Reference image and current draft preview image. Improve the draft project JSON while keeping unresolved image regions as placeholders.` },
            { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } },
            ...(draftPreviewDataUrl ? [{ type: 'image_url', image_url: { url: draftPreviewDataUrl, detail: 'low' } }] : []),
          ],
        },
      ]
    : [
        { role: 'system', content: FROM_REFERENCE_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Analyze the reference poster and output a brand-new editable poster project. Recreate layout, typography, colors, shapes, and placeholders for any images.',
            },
            { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } },
          ],
        },
      ];

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages,
    response_format: { type: 'json_object' },
    temperature: draftProject ? 0.15 : 0.2,
    max_tokens: 4096,
  });

  const raw = completion.choices[0]?.message?.content?.trim();
  const totalTokens = completion.usage?.total_tokens ?? 0;
  const parsed = parseJsonResponse(raw);
  if (!parsed || !Array.isArray(parsed.elements)) {
    return { error: true, raw, totalTokens };
  }

  return {
    project: sanitizeProject(parsed, draftProject ?? { canvasWidth: 800, canvasHeight: 1200 }),
    totalTokens,
  };
}

export async function fromReferencePoster(req, res) {
  if (!OPENAI_API_KEY) {
    return res.status(503).json({ error: 'OpenAI API key not configured.' });
  }

  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Authentication required.' });

  const user = await User.findById(userId).lean();
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const tokenLimit = user.tokenLimit ?? FREE_TIER_TOKEN_LIMIT;
  if (tokenLimit !== null && user.tokensUsedThisPeriod >= tokenLimit) {
    return res.status(429).json({ error: 'AI token limit reached for this period.' });
  }

  const file = req.file;
  if (!file?.buffer) {
    return res.status(400).json({ error: 'Missing image file (field name: image).' });
  }

  const mime = file.mimetype || '';
  if (!mime.startsWith('image/')) {
    return res.status(400).json({ error: 'File must be an image (JPEG, PNG, WebP, etc.).' });
  }

  const reviewPassesRaw = Number(req.body?.reviewPasses ?? 1);
  const reviewPasses = Number.isFinite(reviewPassesRaw) ? Math.max(0, Math.min(2, Math.floor(reviewPassesRaw))) : 1;
  const metadata = await sharp(file.buffer).metadata();
  const fallbackSize = inferCanvasSize(metadata.width, metadata.height);
  const base64 = file.buffer.toString('base64');
  const imageDataUrl = `data:${mime};base64,${base64}`;

  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

  try {
    const firstPass = await runGenerationPass(openai, imageDataUrl, null);
    if (firstPass.error) {
      return res.status(502).json({
        error: 'AI returned an invalid response. Please try again.',
        raw: firstPass.raw?.slice(0, 500),
      });
    }

    let project = {
      ...firstPass.project,
      canvasWidth: firstPass.project.canvasWidth || fallbackSize.canvasWidth,
      canvasHeight: firstPass.project.canvasHeight || fallbackSize.canvasHeight,
    };
    let totalTokens = firstPass.totalTokens;

    for (let i = 0; i < reviewPasses; i++) {
      const review = await runGenerationPass(openai, imageDataUrl, project);
      totalTokens += review.totalTokens ?? 0;
      if (review.error) {
        break;
      }
      project = {
        ...review.project,
        canvasWidth: review.project.canvasWidth || project.canvasWidth,
        canvasHeight: review.project.canvasHeight || project.canvasHeight,
      };
    }

    const newTotal = await incrementTokenUsage(userId, totalTokens);
    const updatedUser = await User.findById(userId).select('tokensUsedThisPeriod tokenLimit').lean();
    const tokensUsed = updatedUser?.tokensUsedThisPeriod ?? newTotal;
    const limit = updatedUser?.tokenLimit ?? FREE_TIER_TOKEN_LIMIT;

    return res.json({
      project,
      usage: {
        totalTokens,
        tokensUsed,
        limit,
        remaining: limit !== null ? Math.max(0, limit - tokensUsed) : null,
      },
      reviewPasses,
    });
  } catch (err) {
    console.error('[from-reference-poster] OpenAI error:', err.message || err);
    return res.status(502).json({ error: 'Failed to analyze the design. Please try again.' });
  }
}

export const __testables = {
  roundedPlaceholderPath,
  sanitizeElement,
  sanitizeProject,
  inferCanvasSize,
  normalizeBackground,
  parseJsonResponse,
  projectPreviewSvg,
  projectPreviewDataUrl,
};

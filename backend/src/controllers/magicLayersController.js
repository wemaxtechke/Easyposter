/**
 * POST /api/magic-layers — poster image → Google Cloud Vision DOCUMENT_TEXT_DETECTION
 *   → generate text-region mask → OpenAI DALL-E inpainting → draft layer positions.
 *
 * Env: GOOGLE_CLOUD_VISION_API_KEY, OPENAI_API_KEY (optional – enables text inpainting).
 */
import OpenAI, { toFile } from 'openai';
import sharp from 'sharp';

/* ------------------------------------------------------------------ */
/*  Bounding-box helpers                                               */
/* ------------------------------------------------------------------ */

function bboxFromVertices(vertices) {
  if (!vertices?.length) return null;
  const xs = vertices.map((v) => v.x ?? 0);
  const ys = vertices.map((v) => v.y ?? 0);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

function unionBboxes(boxes) {
  const valid = boxes.filter(Boolean);
  if (!valid.length) return null;
  return {
    minX: Math.min(...valid.map((b) => b.minX)),
    maxX: Math.max(...valid.map((b) => b.maxX)),
    minY: Math.min(...valid.map((b) => b.minY)),
    maxY: Math.max(...valid.map((b) => b.maxY)),
  };
}

/* ------------------------------------------------------------------ */
/*  Paragraph extraction from Vision API                               */
/* ------------------------------------------------------------------ */

function paragraphText(paragraph) {
  let s = '';
  for (const word of paragraph.words || []) {
    for (const sym of word.symbols || []) {
      s += sym.text || '';
    }
    if ((paragraph.words || []).length) s += ' ';
  }
  return s.trim();
}

function paragraphBox(paragraph) {
  const direct = bboxFromVertices(paragraph.boundingBox?.vertices);
  if (direct) return direct;
  const wordBoxes = (paragraph.words || [])
    .map((w) => bboxFromVertices(w.boundingBox?.vertices))
    .filter(Boolean);
  return unionBboxes(wordBoxes);
}

function estimateWordStyle(word) {
  const box = bboxFromVertices(word.boundingBox?.vertices);
  if (!box) return { bold: false };
  const symCount = (word.symbols || []).length || 1;
  const ww = box.maxX - box.minX;
  const wh = box.maxY - box.minY;
  const charW = ww / symCount;
  const ratio = wh > 0 ? charW / wh : 0;
  return { bold: ratio > 0.55 };
}

function estimateLineCount(paragraph, pageH) {
  const words = paragraph.words || [];
  if (words.length === 0) return 1;
  const centers = [];
  for (const w of words) {
    const box = bboxFromVertices(w.boundingBox?.vertices);
    if (box) centers.push((box.minY + box.maxY) / 2);
  }
  if (centers.length === 0) return 1;
  centers.sort((a, b) => a - b);
  const pbox = paragraphBox(paragraph);
  const lineH = pbox ? (pbox.maxY - pbox.minY) / Math.max(1, centers.length) : pageH * 0.03;
  const threshold = Math.max(lineH * 0.5, pageH * 0.008);
  let lines = 1;
  for (let i = 1; i < centers.length; i++) {
    if (centers[i] - centers[i - 1] > threshold) lines++;
  }
  return Math.max(1, lines);
}

function collectParagraphs(page) {
  const pageH = page.height || 1;
  const rows = [];
  for (const block of page.blocks || []) {
    for (const paragraph of block.paragraphs || []) {
      const text = paragraphText(paragraph);
      const box = paragraphBox(paragraph);
      if (!text || !box) continue;
      const w = box.maxX - box.minX;
      const h = box.maxY - box.minY;
      const area = w * h;
      const lineCount = estimateLineCount(paragraph, pageH);
      let boldCount = 0;
      let totalWords = 0;
      for (const word of paragraph.words || []) {
        totalWords++;
        if (estimateWordStyle(word).bold) boldCount++;
      }
      const isBold = totalWords > 0 && boldCount / totalWords > 0.5;
      rows.push({ text, box, w, h, area, lineCount, isBold });
    }
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/*  Map paragraphs → layer DTOs                                        */
/* ------------------------------------------------------------------ */

function mapToLayers(paragraphs, pageW, pageH, maxLayers) {
  const minH = Math.max(4, pageH * 0.006);
  const filtered = paragraphs.filter((p) => p.h >= minH && p.text.length > 0);
  filtered.sort((a, b) => a.box.minY - b.box.minY || a.box.minX - b.box.minX);
  const top = filtered.slice(0, maxLayers);

  return top.map((p, i) => {
    const { minX, minY, maxX, maxY } = p.box;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const bh = maxY - minY;
    const hFrac = bh / pageH;

    const positionX = (cx / pageW - 0.5) * 12;
    const positionY = -(cy / pageH - 0.5) * 12;
    const scale = Math.max(0.25, Math.min(2.8, hFrac / 0.09));
    const fontSize = Math.round(Math.max(22, Math.min(180, 36 + 150 * hFrac)));

    return {
      text: p.text,
      bboxNorm: {
        minX: minX / pageW,
        minY: minY / pageH,
        maxX: maxX / pageW,
        maxY: maxY / pageH,
      },
      lineCount: p.lineCount,
      isBold: p.isBold,
      positionX: Math.round(positionX * 1000) / 1000,
      positionY: Math.round(positionY * 1000) / 1000,
      positionZ: Math.round(i * 0.06 * 1000) / 1000,
      scale: Math.round(scale * 1000) / 1000,
      fontSize,
    };
  });
}

/* ------------------------------------------------------------------ */
/*  Object localization + NMS                                          */
/* ------------------------------------------------------------------ */

function normBBoxFromObjectVertices(vertices) {
  if (!vertices?.length) return null;
  const xs = vertices.map((v) => v.x ?? 0);
  const ys = vertices.map((v) => v.y ?? 0);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const w = maxX - minX;
  const h = maxY - minY;
  if (w < 0.02 || h < 0.02 || w * h > 0.55) return null;
  return { minX, minY, maxX, maxY };
}

function bboxIoU(a, b) {
  const iMinX = Math.max(a.minX, b.minX);
  const iMinY = Math.max(a.minY, b.minY);
  const iMaxX = Math.min(a.maxX, b.maxX);
  const iMaxY = Math.min(a.maxY, b.maxY);
  if (iMaxX <= iMinX || iMaxY <= iMinY) return 0;
  const inter = (iMaxX - iMinX) * (iMaxY - iMinY);
  const areaA = (a.maxX - a.minX) * (a.maxY - a.minY);
  const areaB = (b.maxX - b.minX) * (b.maxY - b.minY);
  return inter / (areaA + areaB - inter);
}

/** Non-Maximum Suppression: keep the highest-score detection when IoU > threshold. */
function nmsRegions(regions, threshold = 0.4) {
  const kept = [];
  const suppressed = new Set();
  for (let i = 0; i < regions.length; i++) {
    if (suppressed.has(i)) continue;
    kept.push(regions[i]);
    for (let j = i + 1; j < regions.length; j++) {
      if (suppressed.has(j)) continue;
      if (bboxIoU(regions[i].bboxNorm, regions[j].bboxNorm) > threshold) {
        suppressed.add(j);
      }
    }
  }
  return kept;
}

function extractImageRegions(resp, maxRegions) {
  const raw = resp?.localizedObjectAnnotations || [];
  const out = [];
  for (const o of raw) {
    const bn = normBBoxFromObjectVertices(o.boundingPoly?.normalizedVertices);
    if (!bn) continue;
    const score = typeof o.score === 'number' ? o.score : 0;
    if (score < 0.35) continue;
    out.push({
      name: String(o.name || 'Object').slice(0, 80),
      score,
      bboxNorm: bn,
    });
  }
  out.sort((a, b) => b.score - a.score);
  const sliced = out.slice(0, Math.min(maxRegions, 8));
  return nmsRegions(sliced);
}

/* ------------------------------------------------------------------ */
/*  OpenAI DALL-E inpainting                                           */
/* ------------------------------------------------------------------ */

const DALLE_SIZE = 1024;
const INPAINT_PROMPT =
  'Continue the surrounding background pattern and colors seamlessly. ' +
  'Fill the area to match adjacent textures and gradients naturally. ' +
  'Do not add any text, words, letters, numbers, or symbols.';

/**
 * Resize + letterbox an image to a square PNG with alpha channel (DALL-E 2 requirement).
 */
async function prepareSquareImage(imageBuffer, targetSize) {
  const meta = await sharp(imageBuffer).metadata();
  const w = meta.width || 1;
  const h = meta.height || 1;
  const scale = Math.min(targetSize / w, targetSize / h);
  const newW = Math.round(w * scale);
  const newH = Math.round(h * scale);
  const padLeft = Math.floor((targetSize - newW) / 2);
  const padTop = Math.floor((targetSize - newH) / 2);

  const squarePng = await sharp(imageBuffer)
    .resize(newW, newH)
    .extend({
      top: padTop,
      bottom: targetSize - newH - padTop,
      left: padLeft,
      right: targetSize - newW - padLeft,
      background: { r: 128, g: 128, b: 128, alpha: 255 },
    })
    .ensureAlpha()
    .png()
    .toBuffer();

  return { buffer: squarePng, innerRect: { x: padLeft, y: padTop, w: newW, h: newH }, origW: w, origH: h, scale };
}

/**
 * Generate an RGBA PNG mask: opaque (keep) everywhere except text regions (transparent → inpaint).
 * Text bbox pixel coords are relative to the original image; they are scaled+offset into square space.
 */
async function generateInpaintMask(squareSize, textBboxesPx, innerRect, imgScale) {
  const rects = textBboxesPx
    .map((b) => {
      const bw = (b.maxX - b.minX) * imgScale;
      const bh = (b.maxY - b.minY) * imgScale;
      const pad = Math.max(4, Math.round(Math.min(bw, bh) * 0.12));
      const x = Math.max(0, Math.round(b.minX * imgScale + innerRect.x - pad));
      const y = Math.max(0, Math.round(b.minY * imgScale + innerRect.y - pad));
      const w = Math.min(squareSize - x, Math.round(bw + 2 * pad));
      const h = Math.min(squareSize - y, Math.round(bh + 2 * pad));
      if (w <= 0 || h <= 0) return '';
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" ry="4"/>`;
    })
    .filter(Boolean)
    .join('\n    ');

  if (!rects) return null;

  const svgStr = `<svg width="${squareSize}" height="${squareSize}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="white"/>
    <g fill="black">${rects}</g>
  </svg>`;

  const grayBuf = await sharp(Buffer.from(svgStr))
    .resize(squareSize, squareSize)
    .greyscale()
    .raw()
    .toBuffer();

  const totalPx = squareSize * squareSize;
  const rgba = Buffer.alloc(totalPx * 4);
  for (let i = 0; i < totalPx; i++) {
    rgba[i * 4 + 3] = grayBuf[i];
  }

  return sharp(rgba, { raw: { width: squareSize, height: squareSize, channels: 4 } })
    .png()
    .toBuffer();
}

/**
 * Use OpenAI DALL-E 2 image editing to inpaint text regions out of the poster image.
 * Returns a data-URL of the cleaned image, or null on failure / missing config.
 */
async function inpaintTextRegions(imageBuffer, paragraphs) {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return null;

  const textBboxesPx = paragraphs.map((p) => p.box);
  if (textBboxesPx.length === 0) return null;

  try {
    const prepared = await prepareSquareImage(imageBuffer, DALLE_SIZE);

    const maskBuf = await generateInpaintMask(
      DALLE_SIZE,
      textBboxesPx,
      prepared.innerRect,
      prepared.scale,
    );
    if (!maskBuf) return null;

    const openai = new OpenAI({ apiKey: openaiKey });
    const resp = await openai.images.edit({
      model: 'dall-e-2',
      image: await toFile(prepared.buffer, 'image.png', { type: 'image/png' }),
      mask: await toFile(maskBuf, 'mask.png', { type: 'image/png' }),
      prompt: INPAINT_PROMPT,
      size: `${DALLE_SIZE}x${DALLE_SIZE}`,
      response_format: 'b64_json',
      n: 1,
    });

    const b64 = resp.data?.[0]?.b64_json;
    if (!b64) return null;

    const resultBuf = Buffer.from(b64, 'base64');
    const cropped = await sharp(resultBuf)
      .extract({
        left: prepared.innerRect.x,
        top: prepared.innerRect.y,
        width: prepared.innerRect.w,
        height: prepared.innerRect.h,
      })
      .jpeg({ quality: 88 })
      .toBuffer();

    return `data:image/jpeg;base64,${cropped.toString('base64')}`;
  } catch (err) {
    console.error('[magic-layers] Inpainting failed, using original image:', err.message || err);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Main controller                                                    */
/* ------------------------------------------------------------------ */

export async function magicLayersFromPoster(req, res) {
  const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error:
        'Magic layers is not configured. Set GOOGLE_CLOUD_VISION_API_KEY in backend/.env (Google Cloud Vision API, billing enabled).',
    });
  }

  const file = req.file;
  if (!file?.buffer) {
    return res.status(400).json({ error: 'Missing image file (field name: image).' });
  }

  const mime = file.mimetype || '';
  if (!mime.startsWith('image/')) {
    return res.status(400).json({ error: 'File must be an image (JPEG, PNG, WebP, etc.).' });
  }

  const base64 = file.buffer.toString('base64');

  try {
    const url = `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`;
    const visionRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [
          {
            image: { content: base64 },
            features: [
              { type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 },
              { type: 'OBJECT_LOCALIZATION', maxResults: 10 },
            ],
          },
        ],
      }),
    });

    const data = await visionRes.json();

    if (!visionRes.ok) {
      const msg = data?.error?.message || visionRes.statusText || 'Vision API request failed';
      console.error('[magic-layers] Vision API error:', data?.error || visionRes.status);
      return res.status(502).json({ error: msg });
    }

    const resp = data.responses?.[0];
    const err = resp?.error;
    if (err) {
      return res.status(502).json({ error: err.message || 'Vision API returned an error' });
    }

    const page = resp?.fullTextAnnotation?.pages?.[0];
    if (!page) {
      const fallback = resp?.textAnnotations?.[0]?.description?.trim();
      if (fallback) {
        return res.json({
          imageWidth: null,
          imageHeight: null,
          imageRegions: extractImageRegions(resp, 4),
          layers: [
            {
              text: fallback.slice(0, 500),
              bboxNorm: { minX: 0.05, minY: 0.4, maxX: 0.95, maxY: 0.55 },
              lineCount: 1,
              isBold: false,
              positionX: 0,
              positionY: 0,
              positionZ: 0,
              scale: 1,
              fontSize: 72,
            },
          ],
          inpaintedImageBase64: null,
          warning:
            'Only plain text was detected (no layout). One layer was created — check wording and position.',
        });
      }
      return res.json({
        imageWidth: null,
        imageHeight: null,
        imageRegions: extractImageRegions(resp, 4),
        layers: [],
        inpaintedImageBase64: null,
        warning: 'No text detected in this image.',
      });
    }

    const pageW = page.width || 1;
    const pageH = page.height || 1;
    const paragraphs = collectParagraphs(page);
    const maxLayers = Math.min(Number(req.body?.maxLayers) || 30, 50);
    const layers = mapToLayers(paragraphs, pageW, pageH, maxLayers);
    const imageRegions = extractImageRegions(resp, 6);

    // Inpaint: erase detected text from the background using OpenAI DALL-E 2
    console.log(`[magic-layers] Detected ${paragraphs.length} paragraphs, ${layers.length} layers. Starting inpainting…`);
    const inpaintedImageBase64 = await inpaintTextRegions(file.buffer, paragraphs);
    if (inpaintedImageBase64) {
      console.log('[magic-layers] Inpainting succeeded.');
    } else {
      console.log('[magic-layers] Inpainting skipped or failed — original image will be used.');
    }

    return res.json({
      imageWidth: pageW,
      imageHeight: pageH,
      imageRegions,
      layers,
      inpaintedImageBase64,
      warning:
        layers.length === 0
          ? 'No suitable text blocks found. Try a clearer poster or higher resolution.'
          : undefined,
    });
  } catch (e) {
    console.error('[magic-layers]', e);
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Magic layers failed' });
  }
}

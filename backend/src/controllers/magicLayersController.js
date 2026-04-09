/**
 * POST /api/magic-layers — poster image → Google Cloud Vision DOCUMENT_TEXT_DETECTION → draft layer positions.
 * Env: GOOGLE_CLOUD_VISION_API_KEY (API key restricted to Cloud Vision in GCP console).
 */

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

function collectParagraphs(page) {
  const rows = [];
  for (const block of page.blocks || []) {
    for (const paragraph of block.paragraphs || []) {
      const text = paragraphText(paragraph);
      const box = paragraphBox(paragraph);
      if (!text || !box) continue;
      const w = box.maxX - box.minX;
      const h = box.maxY - box.minY;
      const area = w * h;
      rows.push({ text, box, w, h, area });
    }
  }
  return rows;
}

function mapToLayers(paragraphs, pageW, pageH, maxLayers) {
  const minH = Math.max(8, pageH * 0.012);
  const filtered = paragraphs.filter((p) => p.h >= minH && p.text.length > 0);
  filtered.sort((a, b) => b.area - a.area);
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
      positionX: Math.round(positionX * 1000) / 1000,
      positionY: Math.round(positionY * 1000) / 1000,
      positionZ: Math.round(i * 0.06 * 1000) / 1000,
      scale: Math.round(scale * 1000) / 1000,
      fontSize,
    };
  });
}

/** 0–1 normalized bbox from Vision object localization vertices. */
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
  return out.slice(0, Math.min(maxRegions, 6));
}

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
              positionX: 0,
              positionY: 0,
              positionZ: 0,
              scale: 1,
              fontSize: 72,
            },
          ],
          warning:
            'Only plain text was detected (no layout). One layer was created — check wording and position.',
        });
      }
      return res.json({
        imageWidth: null,
        imageHeight: null,
        imageRegions: extractImageRegions(resp, 4),
        layers: [],
        warning: 'No text detected in this image.',
      });
    }

    const pageW = page.width || 1;
    const pageH = page.height || 1;
    const paragraphs = collectParagraphs(page);
    const maxLayers = Math.min(Number(req.body?.maxLayers) || 6, 20);
    const layers = mapToLayers(paragraphs, pageW, pageH, maxLayers);
    const imageRegions = extractImageRegions(resp, 4);

    return res.json({
      imageWidth: pageW,
      imageHeight: pageH,
      imageRegions,
      layers,
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

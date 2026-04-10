import OpenAI from 'openai';
import User, { FREE_TIER_TOKEN_LIMIT } from '../models/User.js';
import { incrementTokenUsage } from '../utils/tokenAccounting.js';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const RECREATE_SYSTEM_PROMPT = `You are a professional design-analysis AI for a poster editor called Sanaa Studio.

The user uploads an image of a poster, flyer, card, or any graphic design. Your job is to analyze the design and output a JSON object that recreates it as closely as possible.

OUTPUT FORMAT — strict JSON, no markdown fences, no extra text:
{
  "canvasWidth": <number>,
  "canvasHeight": <number>,
  "canvasBackground": { "type": "solid", "color": "<hex>" },
  "elements": [ ... ]
}

CANVAS DIMENSIONS:
- Estimate the aspect ratio from the image.
- Use standard sizes. Portrait posters: 800×1200. Landscape: 1200×800. Square: 800×800. A4-ish: 794×1123.
- The dimensions define the coordinate space for all element positions.

BACKGROUND:
- Identify the dominant background color. Use { "type": "solid", "color": "#hex" }.
- If it's a gradient, use { "type": "linear", "angle": <deg>, "stops": [{ "offset": 0, "color": "#hex" }, { "offset": 1, "color": "#hex" }] }.

ELEMENTS — each element needs these fields:

For text elements:
{
  "type": "text",
  "text": "<exact text content>",
  "left": <x position>,
  "top": <y position>,
  "scaleX": 1,
  "scaleY": 1,
  "angle": 0,
  "opacity": 1,
  "fontSize": <number>,
  "fontFamily": "<closest match>",
  "fill": "<hex color>",
  "width": <textbox width>,
  "fontWeight": "normal" or "bold",
  "fontStyle": "normal" or "italic",
  "textAlign": "left" or "center" or "right"
}

For rectangle/shape elements (colored blocks, banners, dividers):
{
  "type": "rect",
  "left": <x>,
  "top": <y>,
  "scaleX": 1,
  "scaleY": 1,
  "angle": 0,
  "opacity": <0-1>,
  "width": <number>,
  "height": <number>,
  "fill": "<hex color>",
  "rx": <corner radius or 0>
}

For circles:
{
  "type": "circle",
  "left": <x>,
  "top": <y>,
  "scaleX": 1,
  "scaleY": 1,
  "angle": 0,
  "opacity": 1,
  "radius": <number>,
  "fill": "<hex color>"
}

For lines/dividers:
{
  "type": "line",
  "left": <x>,
  "top": <y>,
  "scaleX": 1,
  "scaleY": 1,
  "angle": 0,
  "opacity": 1,
  "x1": 0,
  "y1": 0,
  "x2": <length>,
  "y2": 0,
  "fill": "#000000",
  "strokeWidth": <number>
}

FONT FAMILIES — use these exact names (system has these loaded):
Arial, Helvetica, Georgia, Times New Roman, Courier New, Verdana, Impact, Comic Sans MS, Trebuchet MS, Palatino Linotype, Brush Script MT, Lucida Console, Garamond

Choose the closest match for each text block based on the apparent style:
- Sans-serif body text → "Arial" or "Helvetica"
- Serif text → "Georgia" or "Times New Roman"
- Display/bold headers → "Impact" or "Arial"
- Script/handwriting → "Brush Script MT"
- Monospace → "Courier New" or "Lucida Console"

POSITIONING RULES:
- left/top are in canvas-unit pixels from the top-left corner (0,0).
- Place elements precisely where they appear in the design.
- Width for text elements should match the apparent text block width.
- fontSize is in pixels — estimate from the visual size relative to the canvas.

Z-ORDERING:
- Do NOT include zIndex — the system will assign these automatically.
- List elements from back to front (background shapes first, then text on top).

STRICT RULES:
1. Output ONLY the JSON object. No explanation, no markdown.
2. Reproduce ALL visible text exactly as it appears (spelling, capitalization, line breaks).
3. Match colors as closely as possible using hex codes.
4. Include ALL visible design elements: text blocks, colored shapes, lines, dividers.
5. Do not invent or add elements that aren't in the image.
6. For areas with photographic images, add a placeholder rect with the approximate size and position, colored to match the dominant color of that region.`;

function parseJsonResponse(raw) {
  if (!raw) return null;
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
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

function normalizeBackground(bg) {
  if (!bg) return { type: 'solid', color: '#ffffff' };
  if (typeof bg === 'string') return { type: 'solid', color: bg };
  if (bg.type === 'solid' || bg.type === 'linear' || bg.type === 'radial') return bg;
  return { type: 'solid', color: '#ffffff' };
}

export async function recreateDesign(req, res) {
  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OpenAI API key not configured.' });
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

  const base64 = file.buffer.toString('base64');
  const dataUrl = `data:${mime};base64,${base64}`;

  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: RECREATE_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Analyze this design image and output a JSON poster project that recreates it. Include every visible text block, shape, and colored area.',
            },
            {
              type: 'image_url',
              image_url: { url: dataUrl, detail: 'high' },
            },
          ],
        },
      ],
      temperature: 0.2,
      max_tokens: 4096,
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    const totalTokens = completion.usage?.total_tokens ?? 0;

    await incrementTokenUsage(userId, totalTokens);

    const parsed = parseJsonResponse(raw);
    if (!parsed || !Array.isArray(parsed.elements)) {
      return res.status(502).json({
        error: 'AI returned an invalid response. Please try again.',
        raw: raw?.slice(0, 500),
      });
    }

    const project = {
      canvasWidth: parsed.canvasWidth ?? 800,
      canvasHeight: parsed.canvasHeight ?? 1200,
      canvasBackground: normalizeBackground(parsed.canvasBackground),
      elements: assignIdsAndZIndex(parsed.elements),
    };

    const updatedUser = await User.findById(userId).select('tokensUsedThisPeriod tokenLimit').lean();
    const tokensUsed = updatedUser?.tokensUsedThisPeriod ?? 0;
    const limit = updatedUser?.tokenLimit ?? FREE_TIER_TOKEN_LIMIT;

    return res.json({
      project,
      usage: {
        totalTokens,
        tokensUsed,
        limit,
        remaining: limit !== null ? Math.max(0, limit - tokensUsed) : null,
      },
    });
  } catch (err) {
    console.error('[recreateDesign] OpenAI error:', err.message || err);
    return res.status(502).json({ error: 'Failed to analyze the design. Please try again.' });
  }
}

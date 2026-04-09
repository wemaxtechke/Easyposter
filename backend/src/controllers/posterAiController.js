import OpenAI from 'openai';
import User, { FREE_TIER_TOKEN_LIMIT } from '../models/User.js';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const POSTER_AI_SYSTEM_PROMPT = `You are a helpful design assistant for a poster editor. The user describes changes; you output edits as JSON.

RULES:
1. Output ONLY valid JSON: { "edits": [...], "message": "..." }. No markdown, no fences.
2. Keep "message" short and polite (1–2 sentences).
3. "edits" is an array of { "elementId": string, "updates": object }.

FIELD BINDINGS (when provided): The poster may have template fields mapping keys/labels to elements. Use these to resolve user references like "Min. Caro picture", "speaker 1 photo", or "the guest name text" to the correct elementId. For example, if fields show speaker_1 (label "Speaker 1") -> el_123 and speaker_1_picture (label "Speaker 1 picture") -> el_456, then "move Min. Caro picture to the top" refers to the image at el_456 (when "Min. Caro" fills speaker_1). Match by label or key; prefer the element whose field label best matches the user's phrasing.

CONTROL BY ELEMENT TYPE:

**text** – Full control: text, fontSize, fontFamily, fill, left, top, scaleX, scaleY, angle, opacity, zIndex, width, fontWeight, fontStyle, underline, linethrough, charSpacing, textAlign.

**image** – Full control EXCEPT src (cannot change image source / bitmap URL): left, top, scaleX, scaleY, angle, opacity, zIndex, mask, edge, edgeFadeAmount, edgeFadeMinOpacity, edgeFadeDirection, maskCornerRadius, adjustBrightness, adjustContrast, adjustSaturation, adjustSharpness, flipHorizontal, flipVertical, textureOverlay, shadow, maskImageOffsetX, maskImageOffsetY, maskImageScale, maskScale, edgeTearSeed. Some elements typed as image in the JSON are raster exports from the 3D text tool — treat them like any other image (still never change src).

**shapes** (rect, circle, triangle, ellipse, line, polygon) – Full control: fill, left, top, scaleX, scaleY, angle, opacity, zIndex, width, height, radius, rx, ry, strokeWidth, stroke, fillOpacity, polygonPoints, etc.

CANVAS: You may receive canvasWidth, canvasHeight, canvasBackground. Do not include these in element edits.

elementId must match an existing element id. Only include updates for properties that change.`;

/** Raster image-like edits allowed for real element type `3d-text` (stored as `image` in AI context). Never apply src/image from AI. */
const RASTER_3D_TEXT_AI_KEYS = new Set([
  'left',
  'top',
  'scaleX',
  'scaleY',
  'angle',
  'opacity',
  'zIndex',
  'mask',
  'edge',
  'edgeFadeAmount',
  'edgeFadeMinOpacity',
  'edgeFadeDirection',
  'edgeTearSeed',
  'maskCornerRadius',
  'maskImageOffsetX',
  'maskImageOffsetY',
  'maskImageScale',
  'maskScale',
  'adjustBrightness',
  'adjustContrast',
  'adjustSaturation',
  'adjustSharpness',
  'flipHorizontal',
  'flipVertical',
  'textureOverlay',
  'shadow',
]);

function buildProjectContextForAi(project) {
  if (!project || !Array.isArray(project.elements)) {
    return { canvasWidth: 800, canvasHeight: 600, canvasBackground: { type: 'solid', color: '#ffffff' }, elements: [] };
  }
  const elements = project.elements.map((el) => {
    if (el.type === '3d-text') {
      return {
        id: el.id,
        type: 'image',
        left: el.left,
        top: el.top,
        scaleX: el.scaleX,
        scaleY: el.scaleY,
        angle: el.angle,
        opacity: el.opacity,
        zIndex: el.zIndex,
        src: '[image]',
        mask: el.mask ?? 'none',
        edge: el.edge ?? 'none',
        edgeFadeAmount: el.edgeFadeAmount,
        edgeFadeMinOpacity: el.edgeFadeMinOpacity,
        edgeFadeDirection: el.edgeFadeDirection,
        maskCornerRadius: el.maskCornerRadius,
        adjustBrightness: el.adjustBrightness,
        adjustContrast: el.adjustContrast,
        adjustSaturation: el.adjustSaturation,
        adjustSharpness: el.adjustSharpness,
      };
    }
    const clone = { ...el };
    if (el.src && (String(el.src).startsWith('data:') || String(el.src).startsWith('blob:'))) {
      clone.src = '[image]';
    }
    if (el.image && (String(el.image).startsWith('data:') || String(el.image).startsWith('blob:'))) {
      clone.image = '[image]';
    }
    if (clone.text && clone.text.length > 300) {
      clone.text = clone.text.slice(0, 300) + '…';
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

function sanitizeEdits(edits, project) {
  const elementIds = new Set((project?.elements ?? []).map((e) => e.id));
  const elementTypes = new Map((project?.elements ?? []).map((e) => [e.id, e.type]));
  const out = [];
  for (const item of edits) {
    if (!item || typeof item.elementId !== 'string' || typeof item.updates !== 'object') continue;
    if (!elementIds.has(item.elementId)) continue;
    const elType = elementTypes.get(item.elementId);
    let updates = item.updates;
    if (elType === '3d-text') {
      updates = {};
      for (const k of Object.keys(item.updates)) {
        if (k === 'src' || k === 'image') continue;
        if (RASTER_3D_TEXT_AI_KEYS.has(k)) updates[k] = item.updates[k];
      }
    }
    if (Object.keys(updates).length > 0) {
      out.push({ elementId: item.elementId, updates });
    }
  }
  return out;
}

function parseJsonResponse(content) {
  if (!content || typeof content !== 'string') return null;
  const cleaned = content.replace(/```(?:json)?\s*|\s*```/g, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export async function posterAiChat(req, res) {
  if (!OPENAI_API_KEY) {
    return res.status(503).json({ error: 'AI service not configured' });
  }
  const userId = req.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const user = await User.findById(userId);
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }

  user.ensureTokenPeriod();
  const limit = user.getTokenLimit();
  if (user.plan !== 'pro' && user.tokensUsedThisPeriod >= limit) {
    return res.status(402).json({
      error: 'Token limit reached',
      message: 'You have reached your monthly AI token limit. Upgrade to Pro for more.',
    });
  }

  const body = req.body || {};
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const project = body.project;
  const fields = Array.isArray(body.fields) ? body.fields : [];
  const projectContext = project ? buildProjectContextForAi(project) : { elements: [], canvasWidth: 800, canvasHeight: 600, canvasBackground: { type: 'solid', color: '#ffffff' } };
  let contextStr = JSON.stringify(projectContext);
  if (fields.length > 0) {
    const fieldsDesc = fields
      .map((f) => `${f.key} (${f.label || f.key}, ${f.kind || 'text'}) -> ${f.sourceElementId}`)
      .join('; ');
    contextStr = `Field bindings: ${fieldsDesc}\n\nPoster:\n${contextStr}`;
  }

  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  const conversationPart =
    messages.length > 0
      ? '\n\n---\nConversation:\n' +
        messages.map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.content || ''}`).join('\n')
      : '';
  const apiMessages = [
    { role: 'system', content: POSTER_AI_SYSTEM_PROMPT },
    { role: 'user', content: `Current poster:\n${contextStr}${conversationPart}` },
  ];

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: apiMessages,
      temperature: 0.3,
      max_tokens: 1024,
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    const totalTokens = completion.usage?.total_tokens ?? 0;

    user.tokensUsedThisPeriod += totalTokens;
    await user.save();

    const parsed = parseJsonResponse(raw);
    const edits = Array.isArray(parsed?.edits) ? sanitizeEdits(parsed.edits, project) : [];
    const message = typeof parsed?.message === 'string' ? parsed.message.trim() : 'Done.';

    return res.json({
      edits,
      message: message || 'Done.',
      usage: {
        totalTokens,
        tokensUsed: user.tokensUsedThisPeriod,
        limit: limit === Infinity ? null : limit,
        remaining: limit === Infinity ? null : Math.max(0, limit - user.tokensUsedThisPeriod),
      },
    });
  } catch (err) {
    console.error('[poster-ai]', err);
    return res.status(500).json({
      error: 'AI request failed',
      message: err?.message || 'Something went wrong',
    });
  }
}

const POSTER_FIELDS_SYSTEM_PROMPT = `You extract structured poster copy from a user's description and pick the best template.

You MUST respond with a single JSON object only (no markdown, no code fences). Keys:
- templateId: string — MUST be exactly one of the template ids provided in the user message.
- Plus every key listed in requiredKeys: string values (use empty string "" if unknown).

Infer sensible text for dates, venues, hosts, speakers, taglines, and contact lines from context.
Keep wording concise and suitable for a printed poster.`;

export async function suggestPosterFields(req, res) {
  if (!OPENAI_API_KEY) {
    return res.status(503).json({ error: 'AI service not configured' });
  }
  const userId = req.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const user = await User.findById(userId);
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }

  user.ensureTokenPeriod();
  const limit = user.getTokenLimit();
  if (user.plan !== 'pro' && user.tokensUsedThisPeriod >= limit) {
    return res.status(402).json({
      error: 'Token limit reached',
      message: 'You have reached your monthly AI token limit. Upgrade to Pro for more.',
    });
  }

  const body = req.body || {};
  const category = typeof body.category === 'string' ? body.category : '';
  const userDescription = typeof body.userDescription === 'string' ? body.userDescription.trim() : '';
  const templates = Array.isArray(body.templates) ? body.templates : [];
  const requiredKeys = Array.isArray(body.requiredKeys) ? body.requiredKeys : [];

  if (!userDescription) {
    return res.status(400).json({ error: 'userDescription is required' });
  }
  const allowedIds = new Set(templates.map((t) => t?.id).filter(Boolean));
  if (allowedIds.size === 0) {
    return res.status(400).json({ error: 'No templates available for AI selection' });
  }

  const payload = {
    category,
    userDescription,
    templates,
    requiredKeys,
  };

  try {
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: POSTER_FIELDS_SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(payload) },
      ],
      temperature: 0.3,
      max_tokens: 1024,
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    const totalTokens = completion.usage?.total_tokens ?? 0;

    user.tokensUsedThisPeriod += totalTokens;
    await user.save();

    const parsed = parseJsonResponse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return res.status(500).json({ error: 'Invalid JSON from AI' });
    }

    const rawId = typeof parsed.templateId === 'string' ? parsed.templateId : '';
    const first = templates[0]?.id || '';
    const resolvedTemplateId = allowedIds.has(rawId) ? rawId : first;

    const out = { templateId: resolvedTemplateId };
    for (const key of requiredKeys) {
      const v = parsed[key];
      out[key] = v == null ? '' : String(v);
    }

    return res.json({
      ...out,
      usage: {
        tokensUsed: user.tokensUsedThisPeriod,
        limit: limit === Infinity ? null : limit,
        remaining: limit === Infinity ? null : Math.max(0, limit - user.tokensUsedThisPeriod),
      },
    });
  } catch (err) {
    console.error('[poster-ai suggest-fields]', err);
    return res.status(500).json({
      error: 'AI request failed',
      message: err?.message || 'Something went wrong',
    });
  }
}

export async function posterAiUsage(req, res) {
  const userId = req.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const user = await User.findById(userId).select('tokensUsedThisPeriod tokenPeriodStart plan');
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }

  user.ensureTokenPeriod();
  await user.save();

  const limit = user.getTokenLimit();
  return res.json({
    tokensUsed: user.tokensUsedThisPeriod,
    limit: limit === Infinity ? null : limit,
    remaining: limit === Infinity ? null : Math.max(0, limit - user.tokensUsedThisPeriod),
  });
}

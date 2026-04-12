import OpenAI from 'openai';
import User, { FREE_TIER_TOKEN_LIMIT } from '../models/User.js';
import { sanitizeMessages, sanitizePrompt } from '../middleware/aiValidation.js';
import { incrementTokenUsage } from '../utils/tokenAccounting.js';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const POSTER_AI_SYSTEM_PROMPT = `You are a helpful design assistant for a poster editor. The user describes changes; you output edits as JSON.

RULES:
1. Output ONLY valid JSON: { "edits": [...], "message": "..." }. No markdown, no fences.
2. Keep "message" short and polite (1–2 sentences).
3. "edits" is an array of { "elementId": string, "updates": object }.

FIELD BINDINGS (when provided): The poster may have template fields mapping keys/labels to elements. Use these to resolve user references like "Min. Caro picture", "speaker 1 photo", or "the guest name text" to the correct elementId. For example, if fields show speaker_1 (label "Speaker 1") -> el_123 and speaker_1_picture (label "Speaker 1 picture") -> el_456, then "move Min. Caro picture to the top" refers to the image at el_456 (when "Min. Caro" fills speaker_1). Match by label or key; prefer the element whose field label best matches the user's phrasing.

CONTROL BY ELEMENT TYPE:

**text** – Full control: text, fontSize, fontFamily, fill, left, top, scaleX, scaleY, angle, opacity, zIndex, width, fontWeight, fontStyle, underline, linethrough, charSpacing, textAlign.

**image** – Full control EXCEPT src (cannot change image source / bitmap URL): left, top, scaleX, scaleY, angle, opacity, zIndex, mask, edge, edgeFadeAmount, edgeFadeMinOpacity, edgeFadeDirection, maskCornerRadius, adjustBrightness, adjustContrast, adjustSaturation, adjustSharpness, adjustHue, adjustTintColor, adjustTintAmount, flipHorizontal, flipVertical, textureOverlay, shadow, maskImageOffsetX, maskImageOffsetY, maskImageScale, maskScale, edgeTearSeed. Some elements typed as image in the JSON are raster exports from the 3D text tool — treat them like any other image (still never change src).

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
  'adjustHue',
  'adjustTintColor',
  'adjustTintAmount',
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
        adjustHue: el.adjustHue,
        adjustTintColor: el.adjustTintColor,
        adjustTintAmount: el.adjustTintAmount,
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
    let updates = { ...item.updates };
    delete updates.src;
    delete updates.image;
    if (elType === '3d-text') {
      const filtered = {};
      for (const k of Object.keys(updates)) {
        if (RASTER_3D_TEXT_AI_KEYS.has(k)) filtered[k] = updates[k];
      }
      updates = filtered;
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
  const messages = sanitizeMessages(body.messages);
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
        messages.map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.content}`).join('\n')
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

    const newTotal = await incrementTokenUsage(user._id, totalTokens);

    const parsed = parseJsonResponse(raw);
    const edits = Array.isArray(parsed?.edits) ? sanitizeEdits(parsed.edits, project) : [];
    const message = typeof parsed?.message === 'string' ? parsed.message.trim() : 'Done.';

    return res.json({
      edits,
      message: message || 'Done.',
      usage: {
        totalTokens,
        tokensUsed: newTotal,
        limit: limit === Infinity ? null : limit,
        remaining: limit === Infinity ? null : Math.max(0, limit - newTotal),
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
  const category = typeof body.category === 'string' ? body.category.slice(0, 200) : '';
  const userDescription = sanitizePrompt(body.userDescription);
  const templates = Array.isArray(body.templates) ? body.templates.slice(0, 20) : [];
  const requiredKeys = Array.isArray(body.requiredKeys) ? body.requiredKeys.slice(0, 50) : [];

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

    const newTotal = await incrementTokenUsage(user._id, totalTokens);

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
        tokensUsed: newTotal,
        limit: limit === Infinity ? null : limit,
        remaining: limit === Infinity ? null : Math.max(0, limit - newTotal),
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

/* ───────────── Conversational Wizard endpoints ───────────── */

const WIZARD_IDENTIFY_SYSTEM = `You are a polite, direct design assistant. A user wants to create a poster or flyer.

Your task: understand what they need and identify the best category.

Available categories (use the VALUE, not the label):
{{categories}}

Respond with ONLY a JSON object (no markdown, no fences):
{
  "message": "Your polite, direct response",
  "category": "category_value_or_null"
}

STRICT RULES:
- NEVER make up or assume names, people, events, or details the user has not mentioned.
- NEVER add suggestions like "Pastor X would be great" or "This sounds like a wonderful event" — you know nothing about their context.
- Be polite but direct. Acknowledge what the user said, then move forward.
- If the user's request clearly matches a category, set category to that value.
- If ambiguous, set category to null and ask ONE short clarifying question.
- Keep messages short (1-2 sentences). No filler, no flattery, no assumptions.
- Never say "JSON" or mention categories by their code names.`;

const WIZARD_GATHER_SYSTEM = `You are a polite, direct design assistant helping fill in details for a poster template.

The user chose a template called "{{templateName}}".
The following fields need to be filled:
{{fieldsDescription}}

You are having a natural conversation to gather this information.

Respond with ONLY a JSON object (no markdown, no fences):
{
  "message": "Your polite, direct response or follow-up question",
  "fields": { "key": "extracted_value", ... },
  "complete": true_or_false
}

STRICT RULES:
- ONLY use information the user has explicitly provided. NEVER invent names, dates, venues, or any detail.
- If the user has not mentioned something, leave the field as "" — do NOT guess or fill placeholder text.
- Be polite but direct. Ask for missing info clearly without filler or flattery.
- Ask for the most important missing fields first (1-2 at a time), not all at once.
- Set complete=true only when ALL required text fields have non-empty values from the user.
- Keep messages short (1-2 sentences). No assumptions, no suggestions about their content.
- Never mention field keys or JSON — speak naturally.`;

export async function wizardIdentify(req, res) {
  if (!OPENAI_API_KEY) return res.status(503).json({ error: 'AI service not configured' });
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Authentication required' });

  const user = await User.findById(userId);
  if (!user) return res.status(401).json({ error: 'User not found' });
  user.ensureTokenPeriod();
  const limit = user.getTokenLimit();
  if (user.plan !== 'pro' && user.tokensUsedThisPeriod >= limit) {
    return res.status(402).json({ error: 'Token limit reached', message: 'Upgrade to Pro for more tokens.' });
  }

  const { categories = [] } = req.body || {};
  const messages = sanitizeMessages(req.body?.messages);
  const catList = categories.slice(0, 50).map((c) => `${c.value} — "${c.label}"`).join('\n');
  const systemPrompt = WIZARD_IDENTIFY_SYSTEM.replace('{{categories}}', catList);

  const apiMessages = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ];

  try {
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: apiMessages,
      temperature: 0.5,
      max_tokens: 512,
    });
    const raw = completion.choices[0]?.message?.content?.trim();
    const totalTokens = completion.usage?.total_tokens ?? 0;
    await incrementTokenUsage(user._id, totalTokens);

    const parsed = parseJsonResponse(raw);
    const message = typeof parsed?.message === 'string' ? parsed.message : raw || 'How can I help?';
    const category = typeof parsed?.category === 'string' ? parsed.category : null;

    return res.json({ message, category });
  } catch (err) {
    console.error('[wizard-identify]', err);
    return res.status(500).json({ error: 'AI request failed', message: err?.message || 'Something went wrong' });
  }
}

export async function wizardGatherFields(req, res) {
  if (!OPENAI_API_KEY) return res.status(503).json({ error: 'AI service not configured' });
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Authentication required' });

  const user = await User.findById(userId);
  if (!user) return res.status(401).json({ error: 'User not found' });
  user.ensureTokenPeriod();
  const limit = user.getTokenLimit();
  if (user.plan !== 'pro' && user.tokensUsedThisPeriod >= limit) {
    return res.status(402).json({ error: 'Token limit reached', message: 'Upgrade to Pro for more tokens.' });
  }

  const { templateName = '', fieldKeys = [], fieldLabels = {} } = req.body || {};
  const messages = sanitizeMessages(req.body?.messages);
  const safeFieldKeys = Array.isArray(fieldKeys) ? fieldKeys.slice(0, 50) : [];
  const fieldsDesc = safeFieldKeys
    .map((k) => `- ${k}: "${fieldLabels[k] || k}"`)
    .join('\n');
  const systemPrompt = WIZARD_GATHER_SYSTEM
    .replace('{{templateName}}', String(templateName).slice(0, 200))
    .replace('{{fieldsDescription}}', fieldsDesc);

  const apiMessages = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ];

  try {
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: apiMessages,
      temperature: 0.4,
      max_tokens: 1024,
    });
    const raw = completion.choices[0]?.message?.content?.trim();
    const totalTokens = completion.usage?.total_tokens ?? 0;
    await incrementTokenUsage(user._id, totalTokens);

    const parsed = parseJsonResponse(raw);
    const message = typeof parsed?.message === 'string' ? parsed.message : raw || '';
    const fields = parsed?.fields && typeof parsed.fields === 'object' ? parsed.fields : {};
    const complete = Boolean(parsed?.complete);

    // Normalize field values to strings
    const cleanFields = {};
    for (const k of fieldKeys) {
      cleanFields[k] = fields[k] != null ? String(fields[k]) : '';
    }

    return res.json({ message, fields: cleanFields, complete });
  } catch (err) {
    console.error('[wizard-gather-fields]', err);
    return res.status(500).json({ error: 'AI request failed', message: err?.message || 'Something went wrong' });
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

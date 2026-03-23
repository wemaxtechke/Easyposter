import OpenAI from 'openai';
import User from '../models/User.js';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const GENERATE_SYSTEM_PROMPT = `You are an assistant that translates design prompts into complete preset settings for a 3D text editor with WebGL rendering.

The user describes a visual style (e.g. "matte black with thin silver edge", "warm rose gold", "glossy glass with gold trim").
Respond with a valid JSON object. The editor uses WebGL with white front face and colored/metallic extrusion. Use only these keys:

- renderEngine: "webgl" (always)
- text: optional { content?, fontFamily? (e.g. "Dancing Script"), fontSize? (72), fontWeight? }
- frontColor: hex string (front face, default "#ffffff")
- extrusionColor: hex string (sides, e.g. "#d4af37" gold, "#c8c8c8" silver)
- extrusionGlass: boolean (true = transparent reflective extrusion, false = solid color)
- metalness: 0-1 (1 = full metallic)
- roughness: 0-1 (0.1 = glossy, 0.5 = matte)
- bevelSize: 0.02-0.35
- extrusionDepth: 1-3
- lightIntensity: 1-3
- extrusion: { depth: 5-50, steps: 4-20, shine: 0-1, angle?: -45 to 45 }
- lighting: { azimuth: 0-360, elevation: 0-90, intensity: 0.5-2, ambient: 0.2-0.8 }
- extrusionLighting: { azimuth, elevation, ambient } (lighting for extrusion sides only)
- filters: { shine: 0-1, metallic: 0-1, edgeRoundness: 0-1 }
- gradientStops: [{ offset: 0-1, color: hex }] (at least 2 stops)
- extrusionGradientStops: optional, same format

Example for "brushed steel with blue tint":
{"renderEngine":"webgl","frontColor":"#ffffff","extrusionColor":"#7a8a9a","extrusionGlass":false,"metalness":1,"roughness":0.15,"bevelSize":0.15,"extrusionDepth":2,"lightIntensity":1.5,"extrusion":{"depth":12,"steps":10,"shine":0.7},"lighting":{"azimuth":45,"elevation":40,"intensity":1.2,"ambient":0.4},"extrusionLighting":{"azimuth":45,"elevation":40,"ambient":0.35},"filters":{"shine":0.5,"metallic":0.9,"edgeRoundness":0.5},"gradientStops":[{"offset":0,"color":"#ffffff"},{"offset":0.5,"color":"#a0b0c0"},{"offset":1,"color":"#4a5a6a"}]}

Respond ONLY with the JSON object, no markdown or extra text.`;

const ADJUST_SYSTEM_PROMPT = `You are an assistant that tweaks 3D text editor settings based on brief adjustment requests.

The user gives a short instruction (e.g. "make it warmer", "more reflective", "darker extrusion", "softer lighting") and the current state.
Return a JSON object with ONLY the keys you need to change. This will be merged into the current state—do not repeat unchanged values.

Allowed keys (return only what changes):
- frontColor, extrusionColor (hex)
- extrusionGlass (boolean)
- metalness, roughness (0-1)
- bevelSize, extrusionDepth, lightIntensity
- extrusion: { depth?, steps?, shine?, angle? }
- lighting: { azimuth?, elevation?, intensity?, ambient? }
- extrusionLighting: { azimuth?, elevation?, ambient? }
- filters: { shine?, metallic?, edgeRoundness? }
- gradientStops: array (include full array if changing)

Examples:
"make it warmer" → {"extrusionColor":"#e5b030","lighting":{"azimuth":45,"elevation":35,"intensity":1.3}}
"more reflective" → {"metalness":1,"roughness":0.08}
"darker extrusion" → {"extrusionColor":"#6a5a4a"}
"softer lighting" → {"lighting":{"intensity":1,"ambient":0.5},"extrusionLighting":{"ambient":0.5}}

Respond ONLY with the JSON object, no markdown or extra text.`;

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

function parseGradientStops(arr) {
  if (!Array.isArray(arr) || arr.length < 2) return null;
  const stops = arr
    .filter((s) => s && typeof s === 'object' && typeof s.offset === 'number' && typeof s.color === 'string')
    .map((s) => ({
      offset: Math.max(0, Math.min(1, s.offset)),
      color: String(s.color),
    }))
    .slice(0, 10);
  return stops.length >= 2 ? stops : null;
}

function buildResult(obj, isAdjust) {
  const result = {};

  if (obj.renderEngine === 'webgl') result.renderEngine = 'webgl';

  if (obj.text && typeof obj.text === 'object') {
    const t = obj.text;
    const text = {};
    if (typeof t.content === 'string') text.content = t.content;
    if (typeof t.fontFamily === 'string') text.fontFamily = t.fontFamily;
    if (typeof t.fontSize === 'number') text.fontSize = t.fontSize;
    if (typeof t.fontWeight === 'string') text.fontWeight = t.fontWeight;
    if (Object.keys(text).length > 0) result.text = text;
  }

  if (typeof obj.frontColor === 'string') result.frontColor = obj.frontColor;
  if (typeof obj.extrusionColor === 'string') result.extrusionColor = obj.extrusionColor;
  if (typeof obj.extrusionGlass === 'boolean') result.extrusionGlass = obj.extrusionGlass;
  if (typeof obj.metalness === 'number') result.metalness = Math.max(0, Math.min(1, obj.metalness));
  if (typeof obj.roughness === 'number') result.roughness = Math.max(0, Math.min(1, obj.roughness));
  if (typeof obj.bevelSize === 'number') result.bevelSize = Math.max(0.02, Math.min(0.35, obj.bevelSize));
  if (typeof obj.extrusionDepth === 'number') result.extrusionDepth = Math.max(0.5, Math.min(4, obj.extrusionDepth));
  if (typeof obj.lightIntensity === 'number') result.lightIntensity = Math.max(0.5, Math.min(4, obj.lightIntensity));

  if (obj.extrusion && typeof obj.extrusion === 'object') {
    const e = obj.extrusion;
    const extrusion = {};
    if (typeof e.depth === 'number') extrusion.depth = Math.max(5, Math.min(50, e.depth));
    if (typeof e.steps === 'number') extrusion.steps = Math.max(4, Math.min(20, Math.round(e.steps)));
    if (typeof e.shine === 'number') extrusion.shine = Math.max(0, Math.min(1, e.shine));
    if (typeof e.angle === 'number') extrusion.angle = Math.max(-45, Math.min(45, e.angle));
    if (Object.keys(extrusion).length > 0) result.extrusion = extrusion;
  }

  if (obj.lighting && typeof obj.lighting === 'object') {
    const l = obj.lighting;
    const lighting = {};
    if (typeof l.azimuth === 'number') lighting.azimuth = ((l.azimuth % 360) + 360) % 360;
    if (typeof l.elevation === 'number') lighting.elevation = Math.max(0, Math.min(90, l.elevation));
    if (typeof l.intensity === 'number') lighting.intensity = Math.max(0.5, Math.min(2, l.intensity));
    if (typeof l.ambient === 'number') lighting.ambient = Math.max(0.2, Math.min(0.8, l.ambient));
    if (Object.keys(lighting).length > 0) result.lighting = lighting;
  }

  if (obj.extrusionLighting && typeof obj.extrusionLighting === 'object') {
    const el = obj.extrusionLighting;
    const extrusionLighting = {};
    if (typeof el.azimuth === 'number') extrusionLighting.azimuth = ((el.azimuth % 360) + 360) % 360;
    if (typeof el.elevation === 'number') extrusionLighting.elevation = Math.max(0, Math.min(90, el.elevation));
    if (typeof el.ambient === 'number') extrusionLighting.ambient = Math.max(0.2, Math.min(0.8, el.ambient));
    if (Object.keys(extrusionLighting).length > 0) result.extrusionLighting = extrusionLighting;
  }

  if (obj.filters && typeof obj.filters === 'object') {
    const f = obj.filters;
    const filters = {};
    if (typeof f.shine === 'number') filters.shine = Math.max(0, Math.min(1, f.shine));
    if (typeof f.metallic === 'number') filters.metallic = Math.max(0, Math.min(1, f.metallic));
    if (typeof f.edgeRoundness === 'number') filters.edgeRoundness = Math.max(0, Math.min(1, f.edgeRoundness));
    if (Object.keys(filters).length > 0) result.filters = filters;
  }

  const gs = parseGradientStops(obj.gradientStops);
  if (gs) result.gradientStops = gs;
  const egs = parseGradientStops(obj.extrusionGradientStops);
  if (egs) result.extrusionGradientStops = egs;

  return result;
}

async function ensureUserAndLimit(req, res) {
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
  return { user, limit };
}

export async function threeTextAiGenerate(req, res) {
  const auth = await ensureUserAndLimit(req, res);
  if (auth.user === undefined) return;

  const { user, limit } = auth;
  const body = req.body || {};
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';

  if (!prompt) {
    return res.status(400).json({ error: 'Missing prompt' });
  }

  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: GENERATE_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 1024,
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    const totalTokens = completion.usage?.total_tokens ?? 0;

    user.tokensUsedThisPeriod += totalTokens;
    await user.save();

    const obj = parseJsonResponse(raw);
    if (!obj) {
      return res.status(500).json({ error: 'Invalid response from AI', message: 'Could not parse AI response' });
    }

    const preset = buildResult(obj, false);
    if (!preset.renderEngine) preset.renderEngine = 'webgl';

    if (Object.keys(preset).length === 0) {
      return res.status(500).json({ error: 'Invalid response from AI', message: 'No valid preset returned' });
    }

    return res.json({
      preset,
      usage: {
        totalTokens,
        tokensUsed: user.tokensUsedThisPeriod,
        limit: limit === Infinity ? null : limit,
        remaining: limit === Infinity ? null : Math.max(0, limit - user.tokensUsedThisPeriod),
      },
    });
  } catch (err) {
    console.error('[3d-text-ai]', err);
    return res.status(500).json({
      error: 'AI request failed',
      message: err?.message || 'Something went wrong',
    });
  }
}

export async function threeTextAiAdjust(req, res) {
  const auth = await ensureUserAndLimit(req, res);
  if (auth.user === undefined) return;

  const { user, limit } = auth;
  const body = req.body || {};
  const adjustment = typeof body.adjustment === 'string' ? body.adjustment.trim() : '';
  const currentState = body.currentState && typeof body.currentState === 'object' ? body.currentState : {};

  if (!adjustment) {
    return res.status(400).json({ error: 'Missing adjustment' });
  }

  const summary = {};
  if (currentState.frontColor) summary.frontColor = currentState.frontColor;
  if (currentState.extrusionColor) summary.extrusionColor = currentState.extrusionColor;
  if (currentState.extrusionGlass != null) summary.extrusionGlass = currentState.extrusionGlass;
  if (currentState.metalness != null) summary.metalness = currentState.metalness;
  if (currentState.roughness != null) summary.roughness = currentState.roughness;
  if (currentState.lighting) summary.lighting = currentState.lighting;
  if (currentState.extrusionLighting) summary.extrusionLighting = currentState.extrusionLighting;
  if (currentState.extrusion) summary.extrusion = currentState.extrusion;

  const userContent = `Current: ${JSON.stringify(summary)}\n\nAdjustment: "${adjustment}"`;

  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: ADJUST_SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      temperature: 0.3,
      max_tokens: 1024,
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    const totalTokens = completion.usage?.total_tokens ?? 0;

    user.tokensUsedThisPeriod += totalTokens;
    await user.save();

    const obj = parseJsonResponse(raw);
    if (!obj) {
      return res.status(500).json({ error: 'Invalid response from AI', message: 'Could not parse AI response' });
    }

    const preset = buildResult(obj, true);
    if (Object.keys(preset).length === 0) {
      return res.status(500).json({ error: 'Invalid response from AI', message: 'No valid preset returned' });
    }

    return res.json({
      preset,
      usage: {
        totalTokens,
        tokensUsed: user.tokensUsedThisPeriod,
        limit: limit === Infinity ? null : limit,
        remaining: limit === Infinity ? null : Math.max(0, limit - user.tokensUsedThisPeriod),
      },
    });
  } catch (err) {
    console.error('[3d-text-ai]', err);
    return res.status(500).json({
      error: 'AI request failed',
      message: err?.message || 'Something went wrong',
    });
  }
}

import OpenAI from 'openai';
import User from '../models/User.js';
import { sanitizePrompt } from '../middleware/aiValidation.js';
import { incrementTokenUsage } from '../utils/tokenAccounting.js';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const SHAPE_GEN_SYSTEM_PROMPT = `You are an assistant that translates design prompts into a single, clean SVG path 'd' attribute.
The user describes a shape (e.g. "lightning bolt", "minimalist crown", "heart", "coffee cup").

RULES:
1. Output ONLY a valid JSON object: { "d": "...", "label": "..." }.
2. "d" must be a valid SVG path data string (commands like M, L, Q, C, Z).
3. The shape should be centered around (0,0) or fit within a 100x100 box.
4. Keep the path as clean and simple as possible. No multiple paths, no groups, no colors.
5. "label" is a short 1-2 word name for the shape.

Example for "star":
{ "d": "M 50 5 L 63 38 L 95 38 L 69 59 L 79 92 L 50 72 L 21 92 L 31 59 L 5 38 L 37 38 Z", "label": "Star" }

Respond ONLY with the JSON object. No markdown.`;

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

export async function generateShapeAi(req, res) {
  const auth = await ensureUserAndLimit(req, res);
  if (!auth || auth.user === undefined) return;

  const { user, limit } = auth;
  const body = req.body || {};
  const prompt = sanitizePrompt(body.prompt);

  if (!prompt) {
    return res.status(400).json({ error: 'Missing prompt' });
  }

  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SHAPE_GEN_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      temperature: 0.5,
      max_tokens: 512,
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    const totalTokens = completion.usage?.total_tokens ?? 0;

    const newTotal = await incrementTokenUsage(user._id, totalTokens);

    const obj = parseJsonResponse(raw);
    if (!obj || !obj.d) {
      return res.status(500).json({ error: 'Invalid response from AI', message: 'Could not parse SVG path from AI' });
    }

    return res.json({
      d: obj.d,
      label: obj.label || prompt,
      usage: {
        totalTokens,
        tokensUsed: newTotal,
        limit: limit === Infinity ? null : limit,
        remaining: limit === Infinity ? null : Math.max(0, limit - newTotal),
      },
    });
  } catch (err) {
    console.error('[shape-ai]', err);
    return res.status(500).json({
      error: 'AI request failed',
      message: err?.message || 'Something went wrong',
    });
  }
}

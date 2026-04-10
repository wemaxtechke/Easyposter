import jwt from 'jsonwebtoken';
import User, { isAdminEmail } from '../models/User.js';
import RefreshToken, {
  generateRefreshToken,
  hashRefreshToken,
} from '../models/RefreshToken.js';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set. Auth will not work.');
}

const ACCESS_TOKEN_EXPIRY = process.env.JWT_EXPIRY || '15m';
const REFRESH_TOKEN_DAYS = 7;

function signAccessToken(user) {
  return jwt.sign(
    { userId: user._id.toString(), email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
}

async function createRefreshTokenForUser(userId) {
  const raw = generateRefreshToken();
  const tokenHash = hashRefreshToken(raw);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);
  await RefreshToken.create({ userId, tokenHash, expiresAt });
  return raw;
}

function userToJson(user) {
  return {
    id: user._id.toString(),
    email: user.email,
    role: user.role,
    name: user.name,
  };
}

const PASSWORD_POLICY_MSG =
  'Password must be at least 8 characters with at least one uppercase letter, one lowercase letter, and one digit.';

export function isStrongPassword(pw) {
  return (
    typeof pw === 'string' &&
    pw.length >= 8 &&
    /[A-Z]/.test(pw) &&
    /[a-z]/.test(pw) &&
    /[0-9]/.test(pw)
  );
}

export async function signup(req, res) {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const emailNorm = String(email).toLowerCase().trim();

    if (!isStrongPassword(password)) {
      return res.status(400).json({ error: PASSWORD_POLICY_MSG });
    }

    const existing = await User.findOne({ email: emailNorm });
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const role = isAdminEmail(emailNorm) ? 'admin' : 'user';
    const user = await User.create({
      email: emailNorm,
      password,
      name: name?.trim() || '',
      role,
    });

    const token = signAccessToken(user);
    const refreshToken = await createRefreshTokenForUser(user._id);

    res.status(201).json({
      user: userToJson(user),
      token,
      refreshToken,
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
}

export async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const emailNorm = String(email).toLowerCase().trim();
    const user = await User.findOne({ email: emailNorm }).select('+password');
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = await user.comparePassword(password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (isAdminEmail(user.email) && user.role !== 'admin') {
      user.role = 'admin';
      await user.save({ validateBeforeSave: false });
    }

    const token = signAccessToken(user);
    const refreshToken = await createRefreshTokenForUser(user._id);

    res.json({
      user: userToJson(user),
      token,
      refreshToken,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
}

export async function refresh(req, res) {
  try {
    const { refreshToken } = req.body || {};
    if (!refreshToken || typeof refreshToken !== 'string') {
      return res.status(400).json({ error: 'Missing refresh token' });
    }

    const tokenHash = hashRefreshToken(refreshToken);
    const stored = await RefreshToken.findOne({ tokenHash });

    if (!stored || stored.expiresAt < new Date()) {
      if (stored) await RefreshToken.deleteOne({ _id: stored._id });
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    const user = await User.findById(stored.userId);
    if (!user) {
      await RefreshToken.deleteOne({ _id: stored._id });
      return res.status(401).json({ error: 'User not found' });
    }

    // Rotate: delete old, create new
    await RefreshToken.deleteOne({ _id: stored._id });

    const newAccessToken = signAccessToken(user);
    const newRefreshToken = await createRefreshTokenForUser(user._id);

    res.json({
      token: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (err) {
    console.error('Refresh error:', err);
    res.status(500).json({ error: 'Token refresh failed' });
  }
}

export async function logout(req, res) {
  try {
    const { refreshToken } = req.body || {};
    if (refreshToken && typeof refreshToken === 'string') {
      const tokenHash = hashRefreshToken(refreshToken);
      await RefreshToken.deleteOne({ tokenHash });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Logout error:', err);
    res.json({ ok: true });
  }
}

export async function me(req, res) {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user: userToJson(user) });
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
}

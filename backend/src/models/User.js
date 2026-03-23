import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const ADMIN_EMAIL = 'easyposterke@gmail.com';

const PERIOD_DAYS = 30;
export const FREE_TIER_TOKEN_LIMIT = 40_000;

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, minLength: 6, select: false },
  role: { type: String, enum: ['user', 'creator', 'admin'], default: 'user' },
  name: { type: String, trim: true },
  createdAt: { type: Date, default: Date.now },
  plan: { type: String, enum: ['free', 'pro'], default: 'free' },
  tokensUsedThisPeriod: { type: Number, default: 0 },
  tokenPeriodStart: { type: Date, default: Date.now },
});

// Hash password before saving
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

// Set admin role for easyposterke@gmail.com
userSchema.pre('save', function () {
  if (this.email === ADMIN_EMAIL) {
    this.role = 'admin';
  }
});

userSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.ensureTokenPeriod = function () {
  const now = new Date();
  const start = this.tokenPeriodStart || now;
  const msPerDay = 24 * 60 * 60 * 1000;
  if ((now - start) / msPerDay >= PERIOD_DAYS) {
    this.tokensUsedThisPeriod = 0;
    this.tokenPeriodStart = now;
  }
};

userSchema.methods.getTokenLimit = function () {
  return this.plan === 'pro' ? Infinity : FREE_TIER_TOKEN_LIMIT;
};

export function isAdminEmail(email) {
  return String(email || '').toLowerCase().trim() === ADMIN_EMAIL;
}

export default mongoose.models.User || mongoose.model('User', userSchema);

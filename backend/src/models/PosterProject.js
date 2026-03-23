import mongoose from 'mongoose';

/**
 * User's auto-saved poster project (one per user, Canva-style).
 * Stores full project JSON; images uploaded to Cloudinary.
 */
const posterProjectSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  project: { type: mongoose.Schema.Types.Mixed, required: true },
  cloudinaryPublicIds: { type: [String], default: [] },
  updatedAt: { type: Date, default: Date.now },
});

posterProjectSchema.pre('save', function setUpdated() {
  this.updatedAt = new Date();
});

export default mongoose.models.PosterProject || mongoose.model('PosterProject', posterProjectSchema);

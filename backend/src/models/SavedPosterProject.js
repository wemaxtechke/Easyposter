import mongoose from 'mongoose';

/**
 * A user-owned saved poster project snapshot (private by default).
 * Visible only to its owner unless the user saves it as a template (separate flow).
 */
const savedPosterProjectSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, default: 'Untitled poster' },
    project: { type: mongoose.Schema.Types.Mixed, required: true },
    thumbnail: { type: String }, // data URL or https URL
    cloudinaryPublicIds: { type: [String], default: [] },
  },
  { timestamps: true }
);

export default mongoose.models.SavedPosterProject ||
  mongoose.model('SavedPosterProject', savedPosterProjectSchema);


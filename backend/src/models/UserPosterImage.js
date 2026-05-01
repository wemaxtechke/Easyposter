import mongoose from 'mongoose';

const userPosterImageSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    originalName: { type: String, default: '' },
    /** When set, library pick can insert `3d-text` with this 3D editor state (from a 3D export). */
    poster3dConfig: { type: mongoose.Schema.Types.Mixed, default: undefined },
  },
  { timestamps: true }
);

export default mongoose.models.UserPosterImage ||
  mongoose.model('UserPosterImage', userPosterImageSchema);

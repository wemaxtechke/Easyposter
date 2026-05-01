import mongoose from 'mongoose';

const userPosterImageSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    originalName: { type: String, default: '' },
  },
  { timestamps: true }
);

export default mongoose.models.UserPosterImage ||
  mongoose.model('UserPosterImage', userPosterImageSchema);

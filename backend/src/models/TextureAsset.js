import mongoose from 'mongoose';

const textureSchema = new mongoose.Schema({
  label: { type: String, required: true },
  mapUrl: { type: String, required: true },
  mapPublicId: String,
  roughnessUrl: String,
  roughnessPublicId: String,
  normalUrl: String,
  normalPublicId: String,
  metalnessUrl: String,
  metalnessPublicId: String,
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.TextureAsset || mongoose.model('TextureAsset', textureSchema);

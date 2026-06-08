import mongoose from 'mongoose';

const hdrAssetSchema = new mongoose.Schema({
  label: { type: String, required: true },
  hdrUrl: { type: String, required: true },
  hdrPublicId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.HdrAsset || mongoose.model('HdrAsset', hdrAssetSchema);

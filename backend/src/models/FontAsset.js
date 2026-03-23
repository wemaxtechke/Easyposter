import mongoose from 'mongoose';

const fontSchema = new mongoose.Schema({
  label: { type: String, required: true },
  fontUrl: { type: String, required: true },
  publicId: { type: String, required: true },
  fileName: String,
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.FontAsset || mongoose.model('FontAsset', fontSchema);

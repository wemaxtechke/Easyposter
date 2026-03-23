import mongoose from 'mongoose';

const customElementSchema = new mongoose.Schema({
  label: { type: String, required: true },
  category: {
    type: String,
    required: true,
    enum: ['icons', 'social', 'decorative', 'shapes-badges', 'business-events'],
  },
  url: { type: String, required: true },
  publicId: { type: String, required: true },
  format: { type: String, required: true, enum: ['png', 'svg', 'jpg', 'jpeg', 'webp'] },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.CustomElementAsset ||
  mongoose.model('CustomElementAsset', customElementSchema);

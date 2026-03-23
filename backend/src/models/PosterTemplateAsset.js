import mongoose from 'mongoose';

const posterTemplateSchema = new mongoose.Schema({
  /** Stable client-facing id (unique). */
  templateId: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  category: { type: String, required: true },
  description: { type: String },
  fields: { type: [mongoose.Schema.Types.Mixed], default: [] },
  /** Full poster project JSON (canvas + elements). */
  project: { type: mongoose.Schema.Types.Mixed, required: true },
  /** Cloudinary URL for the template thumbnail preview image. */
  thumbnail: { type: String },
  /** Cloudinary public_ids for images uploaded for this template (cleanup on delete). */
  cloudinaryPublicIds: { type: [String], default: [] },
  /** User who created this template (ObjectId ref). Optional for backward compatibility. */
  creatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

posterTemplateSchema.pre('save', function setUpdated() {
  this.updatedAt = new Date();
});

export default mongoose.models.PosterTemplateAsset || mongoose.model('PosterTemplateAsset', posterTemplateSchema);

import mongoose from 'mongoose';

const modelQuotaSchema = new mongoose.Schema({
  model: { type: String, required: true, index: true },
  window: { type: String, enum: ['day', 'minute'], required: true, index: true },
  key: { type: String, required: true, index: true },
  count: { type: Number, default: 0 },
  exhaustedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 7 },
}, { timestamps: false });

modelQuotaSchema.index({ model: 1, window: 1, key: 1 }, { unique: true });

export default mongoose.model('ModelQuota', modelQuotaSchema);

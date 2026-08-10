import mongoose from 'mongoose';

const translatedFieldsSchema = new mongoose.Schema({
  title: { type: String, default: '' },
  summary: { type: String, default: '' },
  content: { type: String, default: '' },
  description: { type: String, default: '' },
  tags: { type: [String], default: [] },
}, { _id: false });

const translationSchema = new mongoose.Schema({
  refType: { type: String, enum: ['BlogPost', 'GameArticle', 'Game'], required: true, index: true },
  refId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  locale: { type: String, enum: ['en'], required: true, index: true },
  fields: { type: translatedFieldsSchema, default: () => ({}) },
  sourceHash: { type: String, default: '' },
  promptVersion: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'translating', 'ready', 'failed', 'stale'], default: 'pending', index: true },
  origin: { type: String, enum: ['machine', 'human'], default: 'machine' },
  noindex: { type: Boolean, default: false },
  model: { type: String, default: '' },
  attempts: { type: Number, default: 0 },
  lastError: { type: String, default: '' },
  nextAttemptAt: { type: Date, default: () => new Date(), index: true },
  lockedAt: { type: Date, default: null },
  lockedBy: { type: String, default: '' },
  translatedAt: { type: Date, default: null },
  reviewedAt: { type: Date, default: null },
  priority: { type: Number, default: 0, index: true },
}, { timestamps: true });

translationSchema.index({ refType: 1, refId: 1, locale: 1 }, { unique: true });
translationSchema.index({ status: 1, nextAttemptAt: 1, priority: -1 });
translationSchema.index({ refType: 1, locale: 1, status: 1 });

export default mongoose.model('Translation', translationSchema);

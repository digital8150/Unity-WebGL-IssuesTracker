import mongoose from 'mongoose';

const modelChainEntrySchema = new mongoose.Schema({
  model: { type: String, required: true, trim: true },
  rpd: { type: Number, min: 0, default: 0 },
  rpm: { type: Number, min: 0, default: 0 },
  enabled: { type: Boolean, default: true },
}, { _id: false });

const siteSettingsSchema = new mongoose.Schema({
  _id: { type: String, default: 'site' },
  geminiApiKey: { type: String, select: false, default: '' },
  geminiKeyLast4: { type: String, default: '' },
  translation: {
    enabled: { type: Boolean, default: false },
    publishEnabled: { type: Boolean, default: false },
    modelChain: { type: [modelChainEntrySchema], default: [] },
    targetLocales: { type: [String], default: ['en'] },
    promptVersion: { type: String, default: 'v1' },
    maxChunkChars: { type: Number, default: 4000 },
    dailyRequestCap: { type: Number, default: 0 },
  },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

export default mongoose.model('SiteSettings', siteSettingsSchema);

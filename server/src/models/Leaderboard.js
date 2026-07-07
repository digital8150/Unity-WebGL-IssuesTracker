import mongoose from 'mongoose';

const entrySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 32 },
    score: { type: Number, required: true },
    meta: { type: mongoose.Schema.Types.Mixed, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const leaderboardSchema = new mongoose.Schema(
  {
    gameId: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', required: true, index: true },
    key: { type: String, required: true, maxlength: 40, match: /^[a-z0-9][a-z0-9_-]*$/ },
    label: { type: String, default: '', maxlength: 60 },
    sort: { type: String, enum: ['desc', 'asc'], default: 'desc' },
    maxEntries: { type: Number, default: 10, min: 1, max: 100 },
    scoreMin: { type: Number, default: null },
    scoreMax: { type: Number, default: null },
    enabled: { type: Boolean, default: true },
    entries: { type: [entrySchema], default: [] },
  },
  { timestamps: true },
);

leaderboardSchema.index({ gameId: 1, key: 1 }, { unique: true });

export default mongoose.model('Leaderboard', leaderboardSchema);

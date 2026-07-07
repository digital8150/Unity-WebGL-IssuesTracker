import mongoose from 'mongoose';

const gameConfigSchema = new mongoose.Schema(
  {
    gameId: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', required: true, index: true },
    key: { type: String, required: true, maxlength: 60, match: /^[a-z0-9][a-z0-9_.-]*$/ },
    value: { type: String, required: true, maxlength: 8192 },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);

gameConfigSchema.index({ gameId: 1, key: 1 }, { unique: true });

export default mongoose.model('GameConfig', gameConfigSchema);

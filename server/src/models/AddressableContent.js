import mongoose from 'mongoose';

const addressableContentSchema = new mongoose.Schema(
  {
    // No standalone gameId index — the compound index below already covers
    // gameId-prefixed queries.
    gameId: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', required: true },
    channel: { type: String, required: true, default: 'live', match: /^[a-z0-9][a-z0-9-]{0,31}$/ },
    fileCount: { type: Number, default: 0 },
    storageBytes: { type: Number, default: 0 },
    lastUploadAt: { type: Date, default: null },
  },
  { timestamps: true },
);

addressableContentSchema.index({ gameId: 1, channel: 1 }, { unique: true });

export default mongoose.model('AddressableContent', addressableContentSchema);

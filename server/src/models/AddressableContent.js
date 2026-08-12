import mongoose from 'mongoose';

const addressableContentSchema = new mongoose.Schema(
  {
    gameId: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', required: true, index: true },
    channel: { type: String, required: true, default: 'live' },
    fileCount: { type: Number, default: 0 },
    storageBytes: { type: Number, default: 0 },
    lastUploadAt: { type: Date, default: null },
  },
  { timestamps: true },
);

addressableContentSchema.index({ gameId: 1, channel: 1 }, { unique: true });

export default mongoose.model('AddressableContent', addressableContentSchema);

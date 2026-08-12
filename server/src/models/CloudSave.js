import mongoose from 'mongoose';

const cloudSaveSchema = new mongoose.Schema(
  {
    gameId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Game',
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    slot: {
      type: String,
      required: true,
      trim: true,
      maxlength: 32,
      match: /^[a-z0-9][a-z0-9_-]*$/,
    },
    data: { type: String, required: true },
    size: { type: Number, required: true, min: 0 },
    rev: { type: Number, required: true, default: 1, min: 1 },
    isDev: { type: Boolean, default: false },
  },
  { timestamps: true },
);

cloudSaveSchema.index({ gameId: 1, userId: 1, slot: 1, isDev: 1 }, { unique: true });

export { cloudSaveSchema };
export default mongoose.model('CloudSave', cloudSaveSchema);

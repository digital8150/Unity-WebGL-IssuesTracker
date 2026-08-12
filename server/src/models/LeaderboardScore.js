import mongoose from 'mongoose';

const leaderboardScoreSchema = new mongoose.Schema(
  {
    leaderboardId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Leaderboard',
      required: true,
    },
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
    displayName: { type: String, required: true, trim: true, maxlength: 100 },
    score: { type: Number, required: true },
    meta: { type: mongoose.Schema.Types.Mixed, default: null },
    playCount: { type: Number, default: 0, min: 0 },
    bestAt: { type: Date, default: Date.now },
    isDev: { type: Boolean, default: false },
  },
  { timestamps: true },
);

leaderboardScoreSchema.index({ leaderboardId: 1, userId: 1 }, { unique: true });
leaderboardScoreSchema.index({ leaderboardId: 1, score: -1, bestAt: 1 });
leaderboardScoreSchema.index({ leaderboardId: 1, score: 1, bestAt: 1 });

export { leaderboardScoreSchema };
export default mongoose.model('LeaderboardScore', leaderboardScoreSchema);

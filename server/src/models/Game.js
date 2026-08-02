import mongoose from 'mongoose';

function toSlug(str) {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const gameSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    slug: { type: String, required: true, unique: true, lowercase: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    collaborators: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [] },
    discordWebhookUrl: { type: String, default: '' },

    // ── Arcade gallery ───────────────────────────────────────────────────────
    visibility: {
      type: String,
      enum: ['private', 'public'],
      default: 'private',
      index: true,
    },
    description: { type: String, default: '', maxlength: 500 },
    thumbnailUrl: { type: String, default: '' },

    // ── Game review / rating information ────────────────────────────────────
    reviewInfo: {
      enabled: { type: Boolean, default: false },
      rating: { type: String, trim: true, maxlength: 50, default: '' },
      certificateNumber: { type: String, trim: true, maxlength: 100, default: '' },
      authority: { type: String, trim: true, maxlength: 100, default: '' },
      reviewedAt: { type: Date, default: null },
      note: { type: String, trim: true, maxlength: 300, default: '' },
    },

    // ── Per-game server backend (leaderboards / dynamic config) ───────────────
    serverBackend: {
      leaderboardEnabled: { type: Boolean, default: false },
      configEnabled: { type: Boolean, default: false },
      secret: { type: String, default: '' },
      secretRotatedAt: { type: Date, default: null },
    },
  },
  { timestamps: true },
);

gameSchema.statics.generateSlug = async function (name) {
  const base = toSlug(name) || 'game';
  let slug = base;
  let n = 0;
  while (await this.findOne({ slug })) {
    slug = `${base}-${++n}`;
  }
  return slug;
};

export default mongoose.model('Game', gameSchema);

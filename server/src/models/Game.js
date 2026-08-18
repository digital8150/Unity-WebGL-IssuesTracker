import mongoose from 'mongoose';

export const GAME_RATING_KEYS = ['all', 'over12', 'over15', 'over18'];
export const GAME_CONTENT_DESCRIPTOR_KEYS = [
  'sexuality',
  'violence',
  'fear',
  'language',
  'drugs',
  'crime',
  'gambling',
];

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
    // Extra browser origins allowed to fetch this game's Addressables content
    // cross-origin (e.g. a WebGL player hosted on GitHub Pages that points its
    // RemoteLoadPath at this server). Same-origin requests never need this —
    // see server/src/routes/gameContent.js's `contentCors`. Normalized
    // lowercase `scheme://host[:port]`, no path, no trailing slash.
    allowedOrigins: { type: [String], default: [] },

    // ── Arcade gallery ───────────────────────────────────────────────────────
    visibility: {
      type: String,
      enum: ['private', 'public'],
      default: 'private',
      index: true,
    },
    description: { type: String, default: '', maxlength: 500 },
    longDescription: { type: String, default: '', maxlength: 20000 },
    thumbnailUrl: { type: String, default: '' },

    // ── Game review / rating information ────────────────────────────────────
    reviewInfo: {
      enabled: { type: Boolean, default: false },
      title: { type: String, trim: true, maxlength: 200, default: '' },
      businessName: { type: String, trim: true, maxlength: 200, default: '' },
      rating: { type: String, enum: ['', ...GAME_RATING_KEYS], default: '' },
      classificationNumber: { type: String, trim: true, maxlength: 100, default: '' },
      classificationDate: { type: Date, default: null },
      developerReportNumber: { type: String, trim: true, maxlength: 100, default: '' },
      contentDescriptors: {
        type: [{ type: String, enum: GAME_CONTENT_DESCRIPTOR_KEYS }],
        default: [],
      },
    },

    // ── Per-game server backend (leaderboards / dynamic config) ───────────────
    serverBackend: {
      leaderboardEnabled: { type: Boolean, default: false },
      configEnabled: { type: Boolean, default: false },
      secret: { type: String, default: '' },
      secretRotatedAt: { type: Date, default: null },
      // Explicit LiveOps controls. They intentionally have no defaults so
      // older documents can still be recognized from their existing flags.
      liveOpsEnabled: { type: Boolean },
      liveOpsMode: { type: String, enum: ['legacy', 'v2'] },
      v2Enabled: { type: Boolean, default: false },
      cloudSaveEnabled: { type: Boolean, default: false },
      v2DevTokenIssuedAt: { type: Date, default: null },
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

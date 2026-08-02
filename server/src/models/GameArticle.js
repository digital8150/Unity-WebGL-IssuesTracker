import mongoose from 'mongoose';

function slugify(str) {
  return String(str ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const MAX_GAME_ARTICLE_COMMENTS = 500;

const commentSchema = new mongoose.Schema({
  body: { type: String, required: true, trim: true, maxlength: 2000 },
  authorName: { type: String, trim: true, maxlength: 100, default: 'Anonymous' },
  createdAt: { type: Date, default: () => new Date() },
});

const gameArticleSchema = new mongoose.Schema(
  {
    gameId: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, required: true, lowercase: true, trim: true, maxlength: 160 },
    summary: { type: String, trim: true, maxlength: 400, default: '' },
    content: { type: String, required: true, default: '' }, // raw markdown
    coverImageUrl: { type: String, default: '' },
    tags: [{ type: String, trim: true, maxlength: 50 }],
    published: { type: Boolean, default: false, index: true },
    publishedAt: { type: Date, default: null },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    comments: {
      type: [commentSchema],
      default: [],
      validate: {
        validator: (comments) => (comments?.length ?? 0) <= MAX_GAME_ARTICLE_COMMENTS,
        message: `Comments cannot exceed ${MAX_GAME_ARTICLE_COMMENTS}`,
      },
    },
  },
  { timestamps: true },
);

gameArticleSchema.index({ gameId: 1, slug: 1 }, { unique: true });

gameArticleSchema.pre('validate', function (next) {
  if (!this.slug && this.title) this.slug = slugify(this.title) || `article-${Date.now()}`;
  next();
});

export { slugify };
export default mongoose.model('GameArticle', gameArticleSchema);

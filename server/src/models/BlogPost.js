import mongoose from 'mongoose';

function slugify(str) {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const blogPostSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    summary: { type: String, trim: true, maxlength: 400, default: '' },
    content: { type: String, required: true, default: '' }, // raw markdown
    coverImageUrl: { type: String, default: '' },
    tags: [{ type: String, trim: true, maxlength: 50 }],
    published: { type: Boolean, default: false, index: true },
    publishedAt: { type: Date, default: null },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    comments: [
      {
        body:       { type: String, required: true, trim: true, maxlength: 2000 },
        authorName: { type: String, trim: true, maxlength: 100, default: 'Anonymous' },
        createdAt:  { type: Date, default: () => new Date() },
      },
    ],
  },
  { timestamps: true },
);

// Auto-generate slug from title if not provided
blogPostSchema.pre('validate', function (next) {
  if (!this.slug && this.title) {
    this.slug = slugify(this.title);
  }
  next();
});

export default mongoose.model('BlogPost', blogPostSchema);

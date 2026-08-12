import mongoose from 'mongoose';

const { Schema } = mongoose;

const LogEntrySchema = new Schema(
  {
    type: String,
    timestampUtc: String,
    message: String,
    stackTrace: String,
  },
  { _id: false },
);

const BrowserSchema = new Schema(
  {
    userAgent: String,
    platform: String,
    language: String,
    screen: Schema.Types.Mixed,
    viewport: Schema.Types.Mixed,
    url: String,
    timestampUtc: String,
    webgl: Schema.Types.Mixed,
  },
  { _id: false },
);

const CommentSchema = new Schema(
  {
    body: { type: String, required: true, maxlength: 5000 },
    authorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    authorName: { type: String, default: '' },
  },
  { timestamps: true },
);

const IssueSchema = new Schema(
  {
    gameId: { type: Schema.Types.ObjectId, ref: 'Game', index: true },
    buildId: { type: Schema.Types.ObjectId, ref: 'Build', index: true },
    title: { type: String, required: true, maxlength: 300 },
    description: { type: String, default: '' },
    unityVersion: String,
    platform: String,
    productName: String,
    version: String,
    timestampUtc: String,
    // Game state schema varies per project — keep it flexible.
    customState: { type: Schema.Types.Mixed, default: null },
    logs: { type: [LogEntrySchema], default: [] },
    browser: { type: BrowserSchema, default: {} },
    // Upvotes — stores voter IDs; voteCount is computed from length
    votes: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], default: [] },
    // Triage fields
    status: {
      type: String,
      enum: ['open', 'in-progress', 'resolved', 'closed'],
      default: 'open',
      index: true,
    },
    priority: {
      type: String,
      enum: ['none', 'low', 'medium', 'high'],
      default: 'none',
      index: true,
    },
    tags: { type: [String], default: [] },
    comments: { type: [CommentSchema], default: [] },
  },
  { timestamps: true },
);

IssueSchema.index({ createdAt: -1 });

export const Issue = mongoose.model('Issue', IssueSchema);

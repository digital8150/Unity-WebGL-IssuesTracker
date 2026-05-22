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
  },
  { timestamps: true },
);

IssueSchema.index({ createdAt: -1 });

export const Issue = mongoose.model('Issue', IssueSchema);

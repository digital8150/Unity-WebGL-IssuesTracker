import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String },
    githubId: { type: String, sparse: true, unique: true },
    discordId: { type: String, sparse: true, unique: true },
    storageQuota: { type: Number, default: 500 * 1024 * 1024 },
    role: { type: String, enum: ['user', 'admin'], default: 'user', index: true },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
  },
  { timestamps: true },
);

export default mongoose.model('User', userSchema);

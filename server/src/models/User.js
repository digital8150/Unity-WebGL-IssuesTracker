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
  },
  { timestamps: true },
);

export default mongoose.model('User', userSchema);

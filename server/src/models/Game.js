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
    discordWebhookUrl: { type: String, default: '' },
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

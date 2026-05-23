import mongoose from 'mongoose';

// files maps role → original filename stored on disk
// roles: loader | data | framework | wasm | other[]
const buildSchema = new mongoose.Schema(
  {
    gameId: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', required: true, index: true },
    version: { type: String, default: '', trim: true },
    files: {
      loader: String,
      data: String,
      framework: String,
      wasm: String,
      other: { type: [String], default: [] },
    },
    isActive: { type: Boolean, default: false, index: true },
    canvasWidth:  { type: Number, default: 1920 },
    canvasHeight: { type: Number, default: 1080 },
    storageBytes: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export function detectRole(filename) {
  const f = filename.replace(/\.(br|gz)$/, '');
  if (f.endsWith('.loader.js')) return 'loader';
  if (f.endsWith('.wasm')) return 'wasm';
  if (f.endsWith('.data')) return 'data';
  if (f.endsWith('.framework.js')) return 'framework';
  return 'other';
}

export default mongoose.model('Build', buildSchema);

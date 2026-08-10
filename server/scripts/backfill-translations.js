import 'dotenv/config';
import mongoose from 'mongoose';
import { enqueueBackfill } from '../src/services/translation/queue.js';

const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/issue_tracker';
const requested = process.argv.slice(2).filter(Boolean);
const refTypes = requested.length ? requested : ['BlogPost', 'GameArticle', 'Game'];

await mongoose.connect(mongoUri);
try {
  for (const refType of refTypes) {
    const result = await enqueueBackfill({ refType, locale: 'en', force: process.argv.includes('--force') });
    console.log(`${refType}: queued ${result.count}`);
  }
} finally {
  await mongoose.disconnect();
}

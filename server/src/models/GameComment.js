import mongoose from 'mongoose';

export const MAX_GAME_COMMENTS = 500;

/**
 * Play-page comments live in their own collection rather than as a subdocument
 * array on Game, unlike BlogPost/GameArticle comments.
 *
 * Game is the hottest document in the app — the arcade list, play metadata,
 * SSR bootstrap, the dashboard, and the translation source all read it, and
 * several of those call `game.toObject()`. An embedded array would ride along
 * with every one of them. It would also share a document with the settings
 * form, so a `game.save()` could clobber comments posted while the form was
 * open.
 */
const gameCommentSchema = new mongoose.Schema({
  gameId: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', required: true, index: true },
  body: { type: String, required: true, trim: true, maxlength: 2000 },
  authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  authorName: { type: String, trim: true, maxlength: 100, default: 'Anonymous' },
  createdAt: { type: Date, default: () => new Date() },
});

gameCommentSchema.index({ gameId: 1, createdAt: -1 });

export default mongoose.model('GameComment', gameCommentSchema);

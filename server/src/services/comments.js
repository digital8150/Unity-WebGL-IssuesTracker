import User from '../models/User.js';

export function sameId(left, right) {
  const leftId = left?._id ?? left?.id ?? left;
  const rightId = right?._id ?? right?.id ?? right;
  return leftId !== null && leftId !== undefined
    && rightId !== null && rightId !== undefined
    && String(leftId) === String(rightId);
}

export async function isAdminUser(req) {
  if (req.user?.role !== undefined) return req.user.role === 'admin';
  if (!req.user?.sub || User.db.readyState !== 1) return false;
  try {
    const user = await User.findById(req.user.sub).select('role').lean();
    return user?.role === 'admin';
  } catch {
    return false;
  }
}

export function serializeComment(comment, fallbackAuthorName = '') {
  if (!comment) return comment;
  const value = comment?.toObject ? comment.toObject() : { ...comment };
  const populatedName = value.authorId && typeof value.authorId === 'object'
    ? String(value.authorId.name ?? '').trim()
    : '';
  const storedName = String(value.authorName ?? '').trim();
  const currentName = value.authorId && String(fallbackAuthorName ?? '').trim();
  const { authorId, ...serialized } = value;
  const publicAuthorId = authorId?._id ?? authorId;
  return {
    ...serialized,
    ...(publicAuthorId ? { authorId: String(publicAuthorId) } : {}),
    authorName: populatedName || currentName || storedName || 'Anonymous',
  };
}

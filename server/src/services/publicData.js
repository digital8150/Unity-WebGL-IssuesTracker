function publicAuthor(author) {
  return author?.name ? { name: String(author.name) } : null;
}

function publicComment(comment) {
  return {
    _id: comment?._id,
    body: String(comment?.body ?? ''),
    authorName: String(comment?.authorName ?? 'Anonymous'),
    createdAt: comment?.createdAt ?? null,
  };
}

/** Keep the public blog payload separate from the full Mongoose document. */
export function toPublicBlogPost(post) {
  if (!post) return null;
  return {
    _id: post._id,
    title: String(post.title ?? ''),
    slug: String(post.slug ?? ''),
    summary: String(post.summary ?? ''),
    content: String(post.content ?? ''),
    coverImageUrl: String(post.coverImageUrl ?? ''),
    tags: Array.isArray(post.tags) ? post.tags.map((tag) => String(tag)) : [],
    publishedAt: post.publishedAt ?? null,
    createdAt: post.createdAt ?? null,
    updatedAt: post.updatedAt ?? null,
    author: publicAuthor(post.author),
    comments: Array.isArray(post.comments) ? post.comments.map(publicComment) : [],
  };
}


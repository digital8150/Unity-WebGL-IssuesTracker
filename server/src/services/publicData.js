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

function publicId(value) {
  const id = value?._id ?? value?.id ?? value;
  return id === undefined || id === null ? null : String(id);
}

function publicTags(tags) {
  return Array.isArray(tags) ? tags.map((tag) => String(tag)) : [];
}

function publicReviewInfo(reviewInfo) {
  if (!reviewInfo?.enabled) return null;
  return {
    title: String(reviewInfo.title ?? ''),
    businessName: String(reviewInfo.businessName ?? ''),
    rating: String(reviewInfo.rating ?? ''),
    classificationNumber: String(reviewInfo.classificationNumber ?? ''),
    classificationDate: reviewInfo.classificationDate ?? null,
    developerReportNumber: String(reviewInfo.developerReportNumber ?? ''),
    contentDescriptors: publicTags(reviewInfo.contentDescriptors),
  };
}

function publicGameFields(game) {
  return {
    id: publicId(game),
    name: String(game?.name ?? ''),
    slug: String(game?.slug ?? ''),
    description: String(game?.description ?? ''),
    thumbnailUrl: String(game?.thumbnailUrl ?? ''),
  };
}

function publicArticleFields(article) {
  return {
    _id: article?._id,
    title: String(article?.title ?? ''),
    slug: String(article?.slug ?? ''),
    summary: String(article?.summary ?? ''),
    coverImageUrl: String(article?.coverImageUrl ?? ''),
    tags: publicTags(article?.tags),
    publishedAt: article?.publishedAt ?? null,
    createdAt: article?.createdAt ?? null,
    updatedAt: article?.updatedAt ?? null,
    author: publicAuthor(article?.author),
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
    tags: publicTags(post.tags),
    publishedAt: post.publishedAt ?? null,
    createdAt: post.createdAt ?? null,
    updatedAt: post.updatedAt ?? null,
    author: publicAuthor(post.author),
    comments: Array.isArray(post.comments) ? post.comments.map(publicComment) : [],
  };
}

export function toPublicBlogSummary(post) {
  if (!post) return null;
  return {
    _id: post._id,
    title: String(post.title ?? ''),
    slug: String(post.slug ?? ''),
    summary: String(post.summary ?? ''),
    coverImageUrl: String(post.coverImageUrl ?? ''),
    tags: publicTags(post.tags),
    publishedAt: post.publishedAt ?? null,
    createdAt: post.createdAt ?? null,
    updatedAt: post.updatedAt ?? null,
    author: publicAuthor(post.author),
  };
}

export function toPublicArcadeGame(game) {
  if (!game) return null;
  return {
    ...publicGameFields(game),
    developerName: game.developerName ?? game.ownerId?.name ?? null,
    updatedAt: game.updatedAt ?? null,
    latestBuildVersion: game.latestBuildVersion || null,
  };
}

export function toPublicGame(game) {
  if (!game) return null;
  return {
    ...publicGameFields(game),
    visibility: game.visibility || undefined,
    developerName: game.developerName ?? game.ownerId?.name ?? null,
  };
}

export function toPublicGameArticleSummary(article) {
  return article ? publicArticleFields(article) : null;
}

export function toPublicGameArticle(article) {
  if (!article) return null;
  return {
    ...publicArticleFields(article),
    content: String(article.content ?? ''),
    comments: Array.isArray(article.comments) ? article.comments.map(publicComment) : [],
  };
}

function publicBuildUrls(build) {
  const buildId = publicId(build);
  const files = build?.files ?? {};
  const base = `/builds/${buildId}`;
  return {
    loader: files.loader ? `${base}/${files.loader}` : null,
    data: files.data ? `${base}/${files.data}` : null,
    framework: files.framework ? `${base}/${files.framework}` : null,
    wasm: files.wasm ? `${base}/${files.wasm}` : null,
    streamingAssets: files.other?.some((file) => file.startsWith('StreamingAssets/'))
      ? `${base}/StreamingAssets`
      : null,
  };
}

export function toPublicPlayGame(game) {
  if (!game) return null;
  return {
    ...publicGameFields(game),
    visibility: game.visibility || 'private',
    reviewInfo: publicReviewInfo(game.reviewInfo),
    developerName: game.developerName ?? game.ownerId?.name ?? null,
  };
}

export function toPublicBuild(build) {
  if (!build) return null;
  return {
    id: publicId(build),
    version: build.version || null,
    canvasWidth: build.canvasWidth ?? 1920,
    canvasHeight: build.canvasHeight ?? 1080,
    urls: publicBuildUrls(build),
  };
}

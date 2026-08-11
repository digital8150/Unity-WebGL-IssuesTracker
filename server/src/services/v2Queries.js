// Pure query builders for the account-backed (v2) leaderboard and save APIs.
// Keeping the MongoDB shapes here makes the route decisions easy to exercise
// without a database connection.

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object ?? {}, key);
}

function asObject(value) {
  if (!value) return null;
  return typeof value.toObject === 'function' ? value.toObject() : value;
}

function pickDefined(source, keys) {
  return Object.fromEntries(keys.filter((key) => source?.[key] !== undefined).map((key) => [key, source[key]]));
}

function normalizeScoreArgs(input = {}) {
  const params = input && typeof input === 'object' ? input : {};
  const leaderboard = params.lb ?? params.leaderboard ?? {};

  return {
    leaderboardId: params.leaderboardId ?? leaderboard._id ?? leaderboard.id,
    gameId: params.gameId,
    userId: params.userId,
    displayName: typeof params.displayName === 'string' ? params.displayName.trim() : params.displayName,
    score: params.score,
    meta: params.meta ?? null,
    bestAt: params.bestAt ?? params.now ?? new Date(),
    sort: params.sort ?? leaderboard.sort ?? 'desc',
    isDev: params.isDev,
  };
}

/**
 * Build the two writes used for a best-score submission.
 *
 * The first operation guarantees a row and increments playCount. The second
 * operation is deliberately conditional on the submitted score being better;
 * it is a no-op for a lower/equal score and for a row just inserted by the
 * first operation. The return value is directly consumable by
 * `LeaderboardScore.bulkWrite()`.
 */
export function buildBestScoreOps(input = {}) {
  const {
    leaderboardId,
    gameId,
    userId,
    displayName,
    score,
    meta,
    bestAt,
    sort,
    isDev,
  } = normalizeScoreArgs(input);

  const insertFields = {
    ...pickDefined({ gameId, score, meta, bestAt }, ['gameId', 'score', 'meta', 'bestAt']),
    ...(isDev === undefined ? {} : { isDev }),
  };
  const scoreFields = {
    score,
    meta,
    bestAt,
    ...(isDev === undefined ? {} : { isDev }),
  };
  const identity = { leaderboardId, userId };
  // The filter describes the stored score that may be replaced. An ascending
  // board replaces a larger stored value; a descending board replaces a
  // smaller one.
  const replaceable = sort === 'asc' ? { $gt: score } : { $lt: score };

  return [
    {
      updateOne: {
        filter: identity,
        update: {
          $setOnInsert: insertFields,
          $set: { displayName },
          $inc: { playCount: 1 },
        },
        upsert: true,
        options: { upsert: true },
      },
    },
    {
      updateOne: {
        filter: { ...identity, score: replaceable },
        update: { $set: scoreFields },
      },
    },
  ];
}

/**
 * Return the relative query for rows that appear before `me` on a board.
 * The route adds its leaderboard (and, where needed, dev-record) scope before
 * passing this query to `countDocuments`.
 */
export function buildRankQuery(lb = {}, me = {}) {
  const betterThanMine = lb.sort === 'asc' ? { $lt: me.score } : { $gt: me.score };

  return {
    $or: [
      { score: betterThanMine },
      { score: me.score, bestAt: { $lt: me.bestAt } },
    ],
  };
}

function saveIdentity(body, existing) {
  return pickDefined(
    {
      gameId: body.gameId ?? existing?.gameId,
      userId: body.userId ?? existing?.userId,
      slot: body.slot ?? existing?.slot,
    },
    ['gameId', 'userId', 'slot'],
  );
}

function saveFields(body) {
  return pickDefined(body, ['data', 'size', 'isDev']);
}

function conflictResult({ filter, existing }) {
  const current = existing
    ? {
        rev: existing.rev,
        data: existing.data,
        size: existing.size,
      }
    : null;

  return {
    mode: 'conflict',
    conflict: true,
    status: 409,
    filter,
    current,
    response: {
      error: 'Save conflict',
      code: 'save_conflict',
      rev: current?.rev ?? null,
      data: current?.data ?? null,
    },
  };
}

/**
 * Resolve a cloud-save write without touching MongoDB.
 *
 * `body.rev` is intentionally distinguished by presence: omitted means
 * last-writer-wins, zero means create-only, and a positive revision means a
 * compare-and-swap update. For the CAS branch, the returned filter includes
 * the expected revision so a route can turn a zero matchedCount into the same
 * save-conflict response (including the server's current state).
 */
export function resolveSaveWrite({ existing: rawExisting = null, body: rawBody = {} } = {}) {
  const existing = asObject(rawExisting);
  const body = rawBody && typeof rawBody === 'object' ? rawBody : {};
  const filter = saveIdentity(body, existing);
  const fields = saveFields(body);
  const hasRevision = hasOwn(body, 'rev') && body.rev !== undefined;
  const revision = body.rev;

  if (hasRevision && (!Number.isInteger(revision) || revision < 0)) {
    throw new TypeError('rev must be a non-negative integer');
  }

  if (!hasRevision) {
    if (!existing) {
      return {
        mode: 'force',
        filter,
        update: {
          $set: fields,
          $setOnInsert: { ...filter, rev: 1 },
        },
        options: { new: true, upsert: true },
        nextRev: 1,
      };
    }

    return {
      mode: 'force',
      filter,
      update: { $set: fields, $inc: { rev: 1 } },
      options: { new: true },
      nextRev: Number(existing.rev) + 1,
    };
  }

  if (revision === 0) {
    if (existing) return conflictResult({ filter, existing });

    return {
      mode: 'create',
      filter,
      update: { $setOnInsert: { ...filter, ...fields, rev: 1 } },
      options: { new: true, upsert: true },
      nextRev: 1,
    };
  }

  if (!existing || Number(existing.rev) !== revision) {
    return conflictResult({ filter, existing });
  }

  return {
    mode: 'cas',
    filter: { ...filter, rev: revision },
    update: { $set: fields, $inc: { rev: 1 } },
    options: { new: true },
    nextRev: revision + 1,
  };
}

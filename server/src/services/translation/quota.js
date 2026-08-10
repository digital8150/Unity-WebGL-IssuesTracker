function localParts(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
}

function pacificMidnightUtc(year, month, day) {
  let guess = Date.UTC(year, month - 1, day, 8, 0, 0);
  for (let i = 0; i < 4; i += 1) {
    const parts = localParts(new Date(guess));
    const actual = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const wanted = Date.UTC(year, month - 1, day, 0, 0, 0);
    guess += wanted - actual;
  }
  return new Date(guess);
}

export function pacificDayKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(date);
}

export function minuteKey(date = new Date()) {
  return new Date(date).toISOString().slice(0, 16);
}

export function nextPacificMidnight(date = new Date()) {
  const parts = localParts(new Date(date));
  return pacificMidnightUtc(parts.year, parts.month, parts.day + 1);
}

function usageValue(usage, model, window, key) {
  if (!usage) return 0;
  const direct = typeof usage.get === 'function'
    ? usage.get(`${model}:${window}:${key}`) ?? usage.get(model)
    : usage[`${model}:${window}:${key}`] ?? usage[model];
  if (typeof direct === 'number') return direct;
  if (direct && typeof direct === 'object') return Number(direct.count ?? direct[window] ?? direct[`${window}Count`] ?? 0) || 0;
  return 0;
}

function usageRecord(usage, model, window, key) {
  if (!usage) return null;
  const direct = typeof usage.get === 'function'
    ? usage.get(`${model}:${window}:${key}`)
    : usage[`${model}:${window}:${key}`];
  return direct && typeof direct === 'object' ? direct : null;
}

export function pickModel(chain = [], usage = {}, now = new Date()) {
  const day = pacificDayKey(now);
  const minute = minuteKey(now);
  return chain.find((entry) => {
    if (!entry || entry.enabled === false || !entry.model) return false;
    const dayRecord = usageRecord(usage, entry.model, 'day', day);
    const minuteRecord = usageRecord(usage, entry.model, 'minute', minute);
    if (dayRecord?.exhaustedAt || minuteRecord?.exhaustedAt) return false;
    const dayCount = usageValue(usage, entry.model, 'day', day);
    const minuteCount = usageValue(usage, entry.model, 'minute', minute);
    return (entry.rpd == null || entry.rpd <= 0 || dayCount < entry.rpd)
      && (entry.rpm == null || entry.rpm <= 0 || minuteCount < entry.rpm);
  }) || null;
}

export async function markQuotaExhausted({ model, window, now = new Date(), quotaModel } = {}) {
  if (!quotaModel || !model || !['day', 'minute'].includes(window)) return null;
  const key = window === 'day' ? pacificDayKey(now) : minuteKey(now);
  return quotaModel.findOneAndUpdate(
    { model, window, key },
    { $set: { exhaustedAt: now }, $setOnInsert: { count: 0 } },
    { upsert: true, new: true },
  );
}

export function computeBackoff(attempt = 0) {
  const n = Math.max(0, Number(attempt) || 0);
  const base = Math.min(30_000, 2 ** n * 1000);
  // A small monotone jitter keeps retry schedules from synchronising while
  // retaining a deterministic lower/upper bound for queue tests and ops UI.
  const jitter = Math.min(1000, n * 100);
  return base + jitter;
}

export async function reserveQuota({ model, entry, now = new Date(), quotaModel }) {
  if (!quotaModel || !model) return { day: true, minute: true };
  const dayRow = await quotaModel.findOneAndUpdate(
    { model, window: 'day', key: pacificDayKey(now) },
    { $inc: { count: 1 } },
    { upsert: true, new: true },
  );
  if (entry?.rpd > 0 && dayRow.count > entry.rpd) {
    await quotaModel.updateOne({ _id: dayRow._id }, { $set: { exhaustedAt: now } });
    return { day: false, minute: false, reason: 'day' };
  }
  const minuteRow = await quotaModel.findOneAndUpdate(
    { model, window: 'minute', key: minuteKey(now) },
    { $inc: { count: 1 } },
    { upsert: true, new: true },
  );
  if (entry?.rpm > 0 && minuteRow.count > entry.rpm) {
    await quotaModel.updateOne({ _id: minuteRow._id }, { $set: { exhaustedAt: now } });
    return { day: true, minute: false, reason: 'minute' };
  }
  return { day: true, minute: true };
}

// ─────────────────────────────────────────────────────────────
//  بريد — Article Accumulator (Redis-backed)
//
//  Uses Upstash Redis to persist:
//    seen:{channelId}:{date}  → Set of article IDs seen today
//    count:{channelId}:{date} → Integer count of new articles today
//
//  On first call for a channel today: seeds the seen-set without
//  counting (so server restarts don't inflate numbers).
//  Every subsequent call: counts only truly new article IDs.
// ─────────────────────────────────────────────────────────────

const { Redis } = require('@upstash/redis');

const redisAvailable = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
const redis = redisAvailable ? new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
}) : null;

// In-memory fallback when Redis is not configured
const _mem = { seen: {}, counts: {} };

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function articleId(a) {
  return (a.link && a.link.length > 10) ? a.link : a.title.slice(0, 80);
}

// ── Main entry point ──────────────────────────────────────────
async function trackArticles(channelId, articles) {
  const ids = articles.map(articleId).filter(Boolean);
  if (ids.length === 0) return { totalToday: 0, seeding: false };

  if (!redisAvailable) return _trackInMemory(channelId, ids);

  try {
    const today    = todayStr();
    const seenKey  = `seen:${channelId}:${today}`;
    const countKey = `count:${channelId}:${today}`;

    const seenExists = await redis.exists(seenKey);

    if (!seenExists) {
      await redis.sadd(seenKey, ...ids);
      await redis.expire(seenKey, 60 * 60 * 48);
      return { totalToday: 0, seeding: true };
    }

    const seenList = await redis.smembers(seenKey);
    const seenSet  = new Set(seenList);
    const newIds   = ids.filter(id => !seenSet.has(id));

    if (newIds.length > 0) {
      await redis.sadd(seenKey, ...newIds);
      await redis.incrby(countKey, newIds.length);
      await redis.expire(countKey, 60 * 60 * 48);
    }

    const total = parseInt(await redis.get(countKey) || '0');
    return { totalToday: total, newCount: newIds.length, seeding: false };
  } catch (err) {
    console.error('[counters] Redis error, falling back to memory:', err.message);
    return _trackInMemory(channelId, ids);
  }
}

function _trackInMemory(channelId, ids) {
  const today = todayStr();
  if (!_mem.seen[channelId] || _mem.seen[channelId].date !== today) {
    _mem.seen[channelId]   = { date: today, ids: new Set(ids) };
    _mem.counts[channelId] = { date: today, count: 0 };
    return { totalToday: 0, seeding: true };
  }
  let newCount = 0;
  ids.forEach(id => { if (!_mem.seen[channelId].ids.has(id)) { _mem.seen[channelId].ids.add(id); newCount++; } });
  _mem.counts[channelId].count += newCount;
  return { totalToday: _mem.counts[channelId].count, newCount, seeding: false };
}

module.exports = { trackArticles };

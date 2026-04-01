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

const redis = new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function articleId(a) {
  return (a.link && a.link.length > 10) ? a.link : a.title.slice(0, 80);
}

// ── Main entry point ──────────────────────────────────────────
async function trackArticles(channelId, articles) {
  const today    = todayStr();
  const seenKey  = `seen:${channelId}:${today}`;
  const countKey = `count:${channelId}:${today}`;

  const ids = articles.map(articleId).filter(Boolean);
  if (ids.length === 0) return { totalToday: 0, seeding: false };

  // Check if we've seen this channel today yet
  const seenExists = await redis.exists(seenKey);

  if (!seenExists) {
    // First call today — seed the seen-set, don't count
    await redis.sadd(seenKey, ...ids);
    await redis.expire(seenKey, 60 * 60 * 48);  // 48h TTL
    return { totalToday: 0, seeding: true };
  }

  // Get all IDs seen today, find new ones
  const seenList = await redis.smembers(seenKey);
  const seenSet  = new Set(seenList);
  const newIds   = ids.filter(id => !seenSet.has(id));

  if (newIds.length > 0) {
    await redis.sadd(seenKey, ...newIds);
    await redis.incrby(countKey, newIds.length);
    await redis.expire(countKey,  60 * 60 * 48);
  }

  const total = parseInt(await redis.get(countKey) || '0');
  return { totalToday: total, newCount: newIds.length, seeding: false };
}

module.exports = { trackArticles };

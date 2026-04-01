// ─────────────────────────────────────────────────────────────
//  بريد — Daily History (Redis-backed)
//
//  Keys:
//    history:{channelId}:{YYYY-MM-DD} → integer (max articles seen that day)
//
//  Survives server restarts and Render deploys.
// ─────────────────────────────────────────────────────────────

const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function last7Days() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return d.toISOString().slice(0, 10);
  });
}

// Save today's count — only updates if new count is higher
async function recordToday(channelId, count) {
  if (!count || count <= 0) return;
  const key      = `history:${channelId}:${todayStr()}`;
  const existing = parseInt(await redis.get(key) || '0');
  if (count > existing) {
    await redis.set(key, count, { ex: 60 * 60 * 24 * 30 }); // 30-day TTL
  }
}

// Sum last 7 days from Redis; falls back to liveTotal if no data yet
async function getWeekTotal(channelId, liveTotal) {
  const days = last7Days();
  const keys  = days.map(d => `history:${channelId}:${d}`);
  const vals  = await redis.mget(...keys);
  const total = vals.reduce((sum, v) => sum + parseInt(v || '0'), 0);
  return total > 0 ? total : liveTotal;
}

// Returns last 7 days as [{ date, count }] oldest→newest
async function getWeekBreakdown(channelId) {
  const days = last7Days().reverse(); // oldest first
  const keys  = days.map(d => `history:${channelId}:${d}`);
  const vals  = await redis.mget(...keys);
  return days.map((date, i) => ({ date, count: parseInt(vals[i] || '0') }));
}

module.exports = { recordToday, getWeekTotal, getWeekBreakdown };

// ─────────────────────────────────────────────────────────────
//  بريد — Daily History (Redis-backed)
//
//  Keys:
//    history:{channelId}:{YYYY-MM-DD} → integer (max articles seen that day)
//
//  Survives server restarts and Render deploys.
// ─────────────────────────────────────────────────────────────

const { Redis } = require('@upstash/redis');

const redisAvailable = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
const redis = redisAvailable ? new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
}) : null;

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

async function recordToday(channelId, count) {
  if (!count || count <= 0 || !redisAvailable) return;
  try {
    const key      = `history:${channelId}:${todayStr()}`;
    const existing = parseInt(await redis.get(key) || '0');
    if (count > existing) await redis.set(key, count, { ex: 60 * 60 * 24 * 30 });
  } catch (err) { console.error('[history] recordToday error:', err.message); }
}

async function getWeekTotal(channelId, liveTotal) {
  if (!redisAvailable) return liveTotal;
  try {
    const keys  = last7Days().map(d => `history:${channelId}:${d}`);
    const vals  = await redis.mget(...keys);
    const total = vals.reduce((sum, v) => sum + parseInt(v || '0'), 0);
    return total > 0 ? total : liveTotal;
  } catch (err) { console.error('[history] getWeekTotal error:', err.message); return liveTotal; }
}

async function getWeekBreakdown(channelId) {
  const days = last7Days().reverse();
  if (!redisAvailable) return days.map(date => ({ date, count: 0 }));
  try {
    const keys = days.map(d => `history:${channelId}:${d}`);
    const vals = await redis.mget(...keys);
    return days.map((date, i) => ({ date, count: parseInt(vals[i] || '0') }));
  } catch (err) { console.error('[history] getWeekBreakdown error:', err.message); return days.map(date => ({ date, count: 0 })); }
}

module.exports = { recordToday, getWeekTotal, getWeekBreakdown };

// ─────────────────────────────────────────────────────────────
//  بريد — Article Accumulator & Forecast Engine
//
//  Unlike the RSS-snapshot approach, this module:
//  1. Tracks every unique article ID seen since server start
//  2. Counts only truly NEW articles (never double-counts)
//  3. Forecasts end-of-day total based on articles-per-hour rate
//
//  State is in-memory. On first call per channel, we seed the
//  seen-set without counting (baseline) so restarts don't
//  inflate the count with old articles.
// ─────────────────────────────────────────────────────────────

const seen   = {}; // channelId → Set<articleId>
const counts = {}; // channelId → { date, count, startedAt }

function todayStr() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function midnightTs() {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime();
}

function articleId(a) {
  // Prefer link as stable ID; fall back to first 80 chars of title
  return (a.link && a.link.length > 10) ? a.link : a.title.slice(0, 80);
}

// ── Main entry point ──────────────────────────────────────────
// Call after every fresh fetch. Returns tracking stats.

function trackArticles(channelId, articles) {
  const today = todayStr();
  const now   = Date.now();

  // Reset at midnight (new day)
  if (counts[channelId] && counts[channelId].date !== today) {
    delete seen[channelId];
    delete counts[channelId];
  }

  // First call for this channel today: seed seen-set, don't count
  if (!seen[channelId]) {
    seen[channelId]   = new Set(articles.map(articleId).filter(Boolean));
    counts[channelId] = { date: today, count: 0, startedAt: now };
    return { totalToday: 0, forecast: null, rate: null, seeding: true };
  }

  // Find genuinely new articles
  let newCount = 0;
  articles.forEach(a => {
    const id = articleId(a);
    if (id && !seen[channelId].has(id)) {
      seen[channelId].add(id);
      newCount++;
    }
  });

  counts[channelId].count += newCount;

  const total   = counts[channelId].count;
  const elapsed = (now - counts[channelId].startedAt) / 3600000; // hours tracked

  // Forecast: need at least 30 min of data and at least 1 article counted
  let forecast = null;
  let rate     = null;

  if (elapsed >= 0.5 && total >= 1) {
    rate = total / elapsed; // articles per hour

    // How many hours remain until midnight?
    const hoursIntoDay = (now - midnightTs()) / 3600000;
    const hoursLeft    = Math.max(0, 24 - hoursIntoDay);

    forecast = Math.round(total + rate * hoursLeft);
    rate     = Math.round(rate * 10) / 10; // 1 decimal place
  }

  return { totalToday: total, newCount, forecast, rate };
}

function getTracked(channelId) {
  const today = todayStr();
  if (!counts[channelId] || counts[channelId].date !== today) return null;
  return counts[channelId];
}

module.exports = { trackArticles, getTracked };

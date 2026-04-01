// ─────────────────────────────────────────────────────────────
//  بريد — Backend Server
//  Express API that fetches, merges, and analyzes news sources
//
//  Routes:
//    GET /api/channels          → list all channels + status
//    GET /api/channel/:id       → full analysis for one channel
//    GET /api/channel/:id/live  → SSE stream (push updates)
//    GET /health                → server health check
// ─────────────────────────────────────────────────────────────

require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const NodeCache  = require('node-cache');
const CHANNELS   = require('./channels');
const { fetchRSS, fetchUserTweets } = require('./fetcher');
const { analyzeChannel }            = require('./analyzer');
const { generateLongSummary }       = require('./classifier');
const { recordToday, getWeekTotal, getWeekBreakdown } = require('./history');
const { trackArticles } = require('./counters');

const app   = express();
const PORT  = process.env.PORT || 3000;
// Decode in case the token was URL-encoded when pasted into Render dashboard
const BEARER = process.env.X_BEARER_TOKEN
  ? (() => { try { return decodeURIComponent(process.env.X_BEARER_TOKEN).trim(); } catch { return process.env.X_BEARER_TOKEN.trim(); } })()
  : '';

// ── CACHE ─────────────────────────────────────────────────────
// Two separate caches so RSS and Twitter TTLs can differ
const rssCache = new NodeCache({ stdTTL: parseInt(process.env.RSS_CACHE_TTL)  || 120  });
const xCache   = new NodeCache({ stdTTL: parseInt(process.env.X_CACHE_TTL)    || 900  });
const resultCache = new NodeCache({ stdTTL: 120 }); // 2-min cache for computed results

// ── MIDDLEWARE ────────────────────────────────────────────────
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
  methods: ['GET'],
}));
app.use(express.json());

// Serve the frontend app from /public
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── LOGGING ───────────────────────────────────────────────────
function log(level, msg, data = '') {
  const time = new Date().toISOString().slice(11,19);
  const icons = { info: '📬', warn: '⚠️ ', error: '❌', ok: '✅' };
  console.log(`[${time}] ${icons[level] || '·'} ${msg}`, data || '');
}

// ── DATA FETCHING ─────────────────────────────────────────────

async function getRSSArticles(channel) {
  const cacheKey = `rss:${channel.id}`;
  const cached   = rssCache.get(cacheKey);
  if (cached) {
    log('info', `RSS cache hit: ${channel.id}`);
    return cached;
  }

  log('info', `Fetching RSS: ${channel.id} → ${channel.rss}`);
  try {
    const articles = await fetchRSS(channel.rss, channel.rssFallback, channel.rssLang);
    rssCache.set(cacheKey, articles);
    log('ok', `RSS fetched: ${channel.id} — ${articles.length} articles`);
    return articles;
  } catch (err) {
    log('error', `RSS failed: ${channel.id} — ${err.message}`);
    return []; // Don't crash — return empty, Twitter data may still work
  }
}

async function getTwitterArticles(channel) {
  if (!BEARER || BEARER === 'your_x_bearer_token_here') {
    return { tweets: [], xEnabled: false };
  }

  const cacheKey = `twitter:${channel.id}`;
  const cached   = xCache.get(cacheKey);
  if (cached) {
    log('info', `Twitter cache hit: ${channel.id}`);
    return { tweets: cached, xEnabled: true };
  }

  log('info', `Fetching Twitter: @${channel.xHandle} (${channel.xUserId})`);
  try {
    const tweets = await fetchUserTweets(channel.xUserId, BEARER);
    xCache.set(cacheKey, tweets);
    log('ok', `Twitter fetched: ${channel.id} — ${tweets.length} tweets`);
    return { tweets, xEnabled: true };
  } catch (err) {
    log('warn', `Twitter failed: ${channel.id} — ${err.message}`);
    // Return empty but don't crash — RSS data will still be used
    return { tweets: [], xEnabled: true, xError: err.message };
  }
}

// ── CHANNEL ANALYSIS ─────────────────────────────────────────

async function buildChannelData(channel) {
  const cacheKey = `result:${channel.id}`;
  const cached   = resultCache.get(cacheKey);
  if (cached) return cached;

  // Fetch both sources concurrently
  const [rssArticles, { tweets, xEnabled, xError }] = await Promise.all([
    getRSSArticles(channel),
    getTwitterArticles(channel),
  ]);

  // Merge: RSS articles first (more detailed), then tweets
  const allArticles = [...rssArticles, ...tweets];

  if (allArticles.length === 0) {
    return {
      channel: { id: channel.id, nameAr: channel.nameAr, label: channel.label },
      error: 'no_data',
      xEnabled,
    };
  }

  const analysis = await analyzeChannel(allArticles, channel.nameAr);

  // Accumulate truly new articles (bypasses RSS feed size limitation)
  const tracking = await trackArticles(channel.id, allArticles);

  // Save today's count to history: always use at least the RSS snapshot so history
  // is never zero when articles exist (tracked=0 only means "no new since baseline")
  const countForHistory = Math.max(
    tracking.seeding ? analysis.totalToday : tracking.totalToday,
    analysis.totalToday
  );
  await recordToday(channel.id, countForHistory);
  const [realWeekTotal, weekBreakdown] = await Promise.all([
    getWeekTotal(channel.id, analysis.totalWeek),
    getWeekBreakdown(channel.id),
  ]);

  const result = {
    channel: {
      id:      channel.id,
      nameAr:  channel.nameAr,
      label:   channel.label,
    },
    xEnabled,
    xError: xError || null,
    ...analysis,
    totalWeek:     realWeekTotal,
    weekBreakdown,
    tracked:       tracking.totalToday,   // accumulated count (only goes up)
    seeding:       tracking.seeding || false,
  };

  result.updatedAt  = Date.now();
  result.updatedAgo = 'الآن';
  resultCache.set(cacheKey, result);
  return result;
}

// ── ROUTES ────────────────────────────────────────────────────

// Health check
app.get('/health', (req, res) => {
  const rawToken = process.env.X_BEARER_TOKEN || '';
  res.json({
    status: 'ok',
    channels: CHANNELS.length,
    xConfigured: !!(BEARER && BEARER !== 'your_x_bearer_token_here'),
    xDebug: {
      envVarSet: rawToken.length > 0,
      envVarLength: rawToken.length,
      bearerLength: BEARER.length,
      bearerPreview: BEARER ? BEARER.substring(0, 8) + '...' : '(empty)',
    },
    uptime: Math.round(process.uptime()),
    time: new Date().toISOString(),
  });
});

// All channels — light metadata only
app.get('/api/channels', (req, res) => {
  res.json({
    channels: CHANNELS.map(ch => ({
      id:      ch.id,
      nameAr:  ch.nameAr,
      label:   ch.label,
      xHandle: ch.xHandle,
    })),
    xConfigured: !!(BEARER && BEARER !== 'your_x_bearer_token_here'),
  });
});

// Full analysis for a single channel
app.get('/api/channel/:id', async (req, res) => {
  const channel = CHANNELS.find(c => c.id === req.params.id);
  if (!channel) return res.status(404).json({ error: 'channel_not_found' });

  try {
    const data = await buildChannelData(channel);
    res.json(data);
  } catch (err) {
    log('error', `Channel API error: ${req.params.id}`, err.message);
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// SSE: push live updates to the app
// Client connects once, server pushes whenever data refreshes
app.get('/api/channel/:id/live', async (req, res) => {
  const channel = CHANNELS.find(c => c.id === req.params.id);
  if (!channel) return res.status(404).end();

  // Set SSE headers
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.flushHeaders();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  // Send initial data immediately
  try {
    const data = await buildChannelData(channel);
    send(data);
  } catch (err) {
    send({ error: err.message });
  }

  // Push fresh data every 2 minutes — clear RSS + result cache, keep Twitter cache
  const PUSH_MS = (parseInt(process.env.RSS_CACHE_TTL) || 120) * 1000;
  const interval = setInterval(async () => {
    rssCache.del(`rss:${channel.id}`);
    resultCache.del(`result:${channel.id}`);
    try {
      const data = await buildChannelData(channel);
      send(data);
    } catch (err) {
      send({ error: err.message });
    }
  }, PUSH_MS);

  // Clean up when client disconnects
  req.on('close', () => {
    clearInterval(interval);
    log('info', `SSE closed: ${channel.id}`);
  });
});

// Invalidate cache for a channel (manual refresh trigger)
app.get('/api/channel/:id/refresh', (req, res) => {
  const id = req.params.id;
  rssCache.del(`rss:${id}`);
  xCache.del(`twitter:${id}`);
  resultCache.del(`result:${id}`);
  log('info', `Cache cleared: ${id}`);
  res.json({ ok: true, message: `Cache cleared for ${id}` });
});

// Aggregate view — combine all channels into one summary
app.get('/api/aggregate', async (req, res) => {
  try {
    // Fetch all channels concurrently (mostly from cache)
    const results = await Promise.allSettled(CHANNELS.map(ch => buildChannelData(ch)));

    const successful = results
      .filter(r => r.status === 'fulfilled' && !r.value.error)
      .map(r => r.value);

    if (successful.length === 0) return res.json({ error: 'no_data' });

    // Aggregate counts
    const totalToday = successful.reduce((s, d) => s + (d.totalToday || 0), 0);
    const totalWeek  = successful.reduce((s, d) => s + (d.totalWeek  || 0), 0);

    // Aggregate topic distribution weighted by each channel's totalToday
    const topicMap = {};
    successful.forEach(d => {
      const weight = d.totalToday || 1;
      (d.topics || []).forEach(t => {
        if (!topicMap[t.id]) topicMap[t.id] = { id: t.id, nameAr: t.nameAr, direction: t.direction, score: 0 };
        topicMap[t.id].score += (t.pct / 100) * weight;
      });
    });
    const totalScore = Object.values(topicMap).reduce((s, t) => s + t.score, 0) || 1;
    const topics = Object.values(topicMap)
      .map(t => ({ ...t, pct: Math.round((t.score / totalScore) * 100) }))
      .filter(t => t.pct > 0)
      .sort((a, b) => b.pct - a.pct);
    if (topics.length) {
      const rest = topics.slice(1).reduce((s, t) => s + t.pct, 0);
      topics[0] = { ...topics[0], pct: 100 - rest };
    }

    // Collect top stories from all channels (deduplicated by title prefix)
    const seen = new Set();
    const allStories = successful.flatMap(d =>
      (d.topStories || []).map(s => ({ ...s, channelNameAr: d.channel.nameAr, channelId: d.channel.id }))
    ).filter(s => {
      const key = s.title.substring(0, 35).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 60);

    // Generate cross-channel AI summary (one Claude call)
    let longSummary = null;
    try {
      longSummary = await generateLongSummary('جميع القنوات العربية', allStories);
    } catch (err) {
      log('warn', 'Aggregate summary failed:', err.message);
    }

    // Per-channel breakdown
    const channelBreakdown = successful.map(d => ({
      id:         d.channel.id,
      nameAr:     d.channel.nameAr,
      label:      d.channel.label,
      totalToday: d.totalToday || 0,
      topTopic:   d.topics?.[0]?.nameAr || '',
      summary:    d.summary || '',
    })).sort((a, b) => b.totalToday - a.totalToday);

    res.json({
      channel:          { id: 'barid', nameAr: 'بريد', label: 'بريد' },
      totalToday,
      totalWeek,
      topics,
      longSummary,
      topStories:       allStories.slice(0, 10),
      channelBreakdown,
      updatedAt:        Date.now(),
    });
  } catch (err) {
    log('error', 'Aggregate API error', err.message);
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// ── STATIC FALLBACK ───────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ── START ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  log('ok', `بريد server running on http://localhost:${PORT}`);
  log('info', `X API: ${BEARER && BEARER !== 'your_x_bearer_token_here' ? '✅ configured' : '⚠️  no token — RSS only'}`);
  log('info', `Channels: ${CHANNELS.map(c => c.id).join(', ')}`);
  log('info', `Cache TTL: RSS=${process.env.RSS_CACHE_TTL || 600}s  X=${process.env.X_CACHE_TTL || 900}s`);

  // Pre-warm cache for all channels in the background
  log('info', 'Pre-warming cache for all channels...');
  CHANNELS.forEach(ch => {
    buildChannelData(ch).catch(err =>
      log('warn', `Pre-warm failed: ${ch.id}`, err.message)
    );
  });
});

module.exports = app;

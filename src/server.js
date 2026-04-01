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
const { recordToday, getWeekTotal, getWeekBreakdown } = require('./history');
const { trackArticles } = require('./counters');

const app   = express();
const PORT  = process.env.PORT || 3000;
const BEARER = process.env.X_BEARER_TOKEN || '';

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
  const tracking = trackArticles(channel.id, allArticles);

  // Save today's count to history, then replace totalWeek with real historical sum
  const countForHistory = tracking.seeding ? analysis.totalToday : tracking.totalToday;
  recordToday(channel.id, countForHistory);
  const realWeekTotal = getWeekTotal(channel.id, analysis.totalWeek);
  const weekBreakdown = getWeekBreakdown(channel.id);

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
    forecast:      tracking.forecast,     // predicted end-of-day total
    rate:          tracking.rate,         // articles per hour
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
  res.json({
    status: 'ok',
    channels: CHANNELS.length,
    xConfigured: !!(BEARER && BEARER !== 'your_x_bearer_token_here'),
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

// ─────────────────────────────────────────────────────────────
//  بريد — Data Fetcher
//  Handles RSS parsing and Twitter/X API v2 calls
// ─────────────────────────────────────────────────────────────

const fetch   = require('node-fetch');
const xml2js  = require('xml2js');

const X_API_BASE = 'https://api.twitter.com/2';

// ── RSS ───────────────────────────────────────────────────────

async function fetchRSS(url, fallbackUrl, langCheck) {
  try {
    const articles = await _fetchRSS(url);
    if (langCheck === 'ar' && articles.length > 0) {
      // Check if first 3 titles contain Arabic characters
      const sample = articles.slice(0, 3).map(a => a.title).join(' ');
      const hasArabic = /[\u0600-\u06FF]/.test(sample);
      if (!hasArabic) throw new Error('Feed returned non-Arabic content');
    }
    return articles;
  } catch (err) {
    if (fallbackUrl) {
      console.warn(`[RSS] Primary failed (${err.message}), trying fallback: ${fallbackUrl}`);
      const articles = await _fetchRSS(fallbackUrl);
      if (langCheck === 'ar' && articles.length > 0) {
        const sample = articles.slice(0, 3).map(a => a.title).join(' ');
        const hasArabic = /[\u0600-\u06FF]/.test(sample);
        if (!hasArabic) throw new Error('Fallback also returned non-Arabic content');
      }
      return articles;
    }
    throw err;
  }
}

async function _fetchRSS(url) {
  const res = await fetch(url, {
    timeout: 10000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Barid/1.0; +https://barid.app)',
      'Accept':     'application/rss+xml, application/xml, text/xml, */*',
    },
  });

  if (!res.ok) throw new Error(`RSS fetch failed: HTTP ${res.status} for ${url}`);

  let xml = await res.text();

  // Aggressive XML sanitization:
  // Step 1: Replace all & not followed by a valid XML entity with &amp;
  // This covers Sky News Arabia's bare & in attribute values and text content
  xml = xml.replace(/&(?!(amp|lt|gt|quot|apos|#[0-9]+|#x[0-9a-fA-F]+);)/g, '&amp;');

  // Step 2: Remove any control characters that break XML parsing
  xml = xml.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

  const parsed = await xml2js.parseStringPromise(xml, {
    explicitArray:    false,
    ignoreAttrs:      false,
    mergeAttrs:       true,
    explicitCharkey:  false,
    trim:             true,
  });

  const channel = parsed?.rss?.channel || parsed?.feed;
  if (!channel) throw new Error(`No channel found in RSS from ${url}`);

  // Support both RSS 2.0 <item> and Atom <entry>
  const rawItems = channel.item || channel.entry || [];
  const items = Array.isArray(rawItems) ? rawItems : [rawItems];

  const now = Date.now();

  return items.map(item => {
    // Title — handle CDATA objects from xml2js
    const title = extractText(item.title) || '';

    // Description / summary
    const desc = extractText(item.description)
      || extractText(item.summary)
      || extractText(item['content:encoded'])
      || '';

    // Link
    const link = extractText(item.link)
      || (typeof item.link === 'object' ? item.link?.href || '' : '')
      || '';

    // Pub date
    const dateStr = extractText(item.pubDate)
      || extractText(item.published)
      || extractText(item.updated)
      || '';
    const pubDate = dateStr ? new Date(dateStr).getTime() : now;

    // Strip HTML from desc
    const cleanDesc = desc.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    return {
      title:   title.trim(),
      desc:    cleanDesc.substring(0, 300),
      link:    link.trim(),
      pubDate,
      source:  'rss',
    };
  }).filter(a => a.title && !isNaN(a.pubDate));
}

function extractText(val) {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'object') {
    // xml2js CDATA: { _: 'text' }
    if (val._) return val._;
    // Atom link: { href: '...' }
    if (val.href) return val.href;
  }
  return String(val);
}


// ── TWITTER / X API v2 ────────────────────────────────────────

/**
 * Fetch recent tweets from a user by their numeric ID.
 * Uses timeline endpoint — 100 tweets max per call on Basic tier.
 * Free tier: 1 app-only token, 500k tweet reads/month, 15 req/15min.
 *
 * Docs: https://developer.twitter.com/en/docs/twitter-api/tweets/timelines/api-reference/get-users-id-tweets
 */
async function fetchUserTweets(userId, bearerToken, maxResults = 100) {
  if (!bearerToken || bearerToken === 'your_x_bearer_token_here') {
    throw new Error('X_BEARER_TOKEN not configured');
  }

  const params = new URLSearchParams({
    max_results:  String(Math.min(maxResults, 100)),
    // Exclude retweets and replies — we want original posts only
    exclude:      'retweets,replies',
    // Request extra fields
    'tweet.fields': 'created_at,text,public_metrics,entities',
    // Time window: last 24 hours
    start_time: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  });

  const url = `${X_API_BASE}/users/${userId}/tweets?${params}`;

  const res = await fetch(url, {
    timeout: 10000,
    headers: {
      Authorization:  `Bearer ${bearerToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (res.status === 401) throw new Error('X API: Invalid bearer token');
  if (res.status === 403) throw new Error('X API: Insufficient permissions (need Basic tier for user timeline)');
  if (res.status === 429) throw new Error('X API: Rate limit reached — try again in 15 minutes');
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`X API: HTTP ${res.status} — ${body.substring(0, 200)}`);
  }

  const json = await res.json();

  if (!json.data || json.data.length === 0) {
    return []; // no tweets in window
  }

  return json.data.map(tweet => ({
    title:   tweet.text.replace(/https?:\/\/\S+/g, '').trim(), // strip URLs from text
    desc:    '',
    link:    `https://twitter.com/i/web/status/${tweet.id}`,
    pubDate: new Date(tweet.created_at).getTime(),
    source:  'twitter',
    metrics: tweet.public_metrics, // { retweet_count, like_count, reply_count, impression_count }
  }));
}

/**
 * Resolve @handle → numeric user ID.
 * Called once at startup and cached — avoids repeated lookups.
 */
async function resolveUserId(handle, bearerToken) {
  const url = `${X_API_BASE}/users/by/username/${handle}`;
  const res = await fetch(url, {
    timeout: 8000,
    headers: { Authorization: `Bearer ${bearerToken}` },
  });
  if (!res.ok) throw new Error(`Could not resolve @${handle}: HTTP ${res.status}`);
  const json = await res.json();
  return json?.data?.id;
}


module.exports = { fetchRSS, fetchUserTweets, resolveUserId };

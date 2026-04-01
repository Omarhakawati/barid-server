// ─────────────────────────────────────────────────────────────
//  بريد — Analysis Engine
//  Input:  raw articles + tweets (merged)
//  Output: topic distribution, direction, trends, AI summary
// ─────────────────────────────────────────────────────────────

const { TOPICS, DIRECTIONS } = require('./topics');

// ── MAIN ENTRY POINT ──────────────────────────────────────────

function analyzeChannel(articles) {
  if (!articles || articles.length === 0) {
    return { error: 'no_articles' };
  }

  const now      = Date.now();
  const DAY_MS   = 24 * 60 * 60 * 1000;
  const WEEK_MS  = 7 * DAY_MS;

  const todayArticles = articles.filter(a => now - a.pubDate < DAY_MS);
  const weekArticles  = articles.filter(a => now - a.pubDate < WEEK_MS);

  // Use today's if we have enough, else fall back to all available
  const working = todayArticles.length >= 3 ? todayArticles : articles.slice(0, 40);

  // ── Topic scoring ──
  const topicScores = scoreTopics(working);
  const topicDist   = toDistribution(topicScores);

  // ── Direction ──
  const direction = topicDist[0]?.direction || 'neutral';
  const dirMeta   = DIRECTIONS[direction] || DIRECTIONS.neutral;

  // ── Week trends ──
  const trends = computeTrends(weekArticles);

  // ── Behavioral summary ──
  const summary = generateSummary(topicDist, working.length, direction, articles[0]?.source);

  // ── Top stories (deduplicated, sorted by recency + importance) ──
  const topStories = selectTopStories(working);

  // ── Source breakdown ──
  const rssCount     = articles.filter(a => a.source === 'rss').length;
  const twitterCount = articles.filter(a => a.source === 'twitter').length;

  return {
    totalToday:   working.length,
    totalWeek:    weekArticles.length,
    topics:       topicDist,
    direction,
    dirMeta,
    trends,
    summary,
    topStories,
    sources:      { rss: rssCount, twitter: twitterCount },
    updatedAt:    new Date().toISOString(),
  };
}

// ── TOPIC SCORING ─────────────────────────────────────────────

function scoreTopics(articles) {
  const scores = {};
  TOPICS.forEach(t => { scores[t.id] = 0; });

  articles.forEach(art => {
    const text = `${art.title} ${art.desc}`.toLowerCase();

    TOPICS.forEach(topic => {
      let hits = 0;
      topic.keywords.forEach(kw => {
        if (text.includes(kw.toLowerCase())) hits++;
      });
      if (hits > 0) {
        // Twitter posts get 1.5× weight — they're direct editorial signals
        const sourceMult = art.source === 'twitter' ? 1.5 : 1.0;
        scores[topic.id] += hits * topic.weight * sourceMult;
      }
    });
  });

  return scores;
}

function toDistribution(scores) {
  const total = Object.values(scores).reduce((s, n) => s + n, 0);
  if (total === 0) return [];

  return TOPICS
    .map(t => ({
      ...t,
      score: scores[t.id],
      pct:   Math.round((scores[t.id] / total) * 100),
    }))
    .filter(t => t.pct > 0)
    .sort((a, b) => b.score - a.score)
    // Fix rounding so percentages sum to exactly 100
    .map((t, i, arr) => {
      if (i === 0) {
        const rest = arr.slice(1).reduce((s, x) => s + x.pct, 0);
        return { ...t, pct: 100 - rest };
      }
      return t;
    });
}

// ── TREND DETECTION ───────────────────────────────────────────

function computeTrends(articles) {
  if (articles.length < 6) return [];

  // Split into first half (older) and second half (recent)
  const mid    = Math.floor(articles.length / 2);
  const older  = articles.slice(mid);
  const recent = articles.slice(0, mid);

  const oldScores  = scoreTopics(older);
  const newScores  = scoreTopics(recent);

  const oldTotal = Object.values(oldScores).reduce((s, n) => s + n, 0) || 1;
  const newTotal = Object.values(newScores).reduce((s, n) => s + n, 0) || 1;

  return TOPICS
    .map(topic => {
      const oldPct = Math.round((oldScores[topic.id] / oldTotal) * 100);
      const newPct = Math.round((newScores[topic.id] / newTotal) * 100);
      const delta  = newPct - oldPct;
      return { topic, delta, oldPct, newPct };
    })
    .filter(t => Math.abs(t.delta) >= 3)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 5)
    .map(t => ({
      topicId:   t.topic.id,
      nameAr:    t.topic.nameAr,
      delta:     t.delta,
      oldPct:    t.oldPct,
      newPct:    t.newPct,
      // Classify: big jump = spike, moderate = increase/decrease
      type:      Math.abs(t.delta) >= 12 ? 'spike' : t.delta > 0 ? 'up' : 'down',
    }));
}

// ── TOP STORIES ───────────────────────────────────────────────

function selectTopStories(articles) {
  // Score each article by recency + topic importance + title length (proxy for specificity)
  const now = Date.now();

  return articles
    .filter(a => a.title && a.title.length > 10)
    // Deduplicate similar titles (simple: first 30 chars unique)
    .filter((a, i, arr) => {
      const key = a.title.substring(0, 30).toLowerCase();
      return arr.findIndex(x => x.title.substring(0, 30).toLowerCase() === key) === i;
    })
    .map(a => {
      const ageHours   = (now - a.pubDate) / 3600000;
      const recency    = Math.max(0, 1 - ageHours / 24); // 1.0 = just now, 0 = 24h ago
      const titleLen   = Math.min(a.title.length / 80, 1); // longer = more specific
      const twitterBns = a.source === 'twitter' ? 0.2 : 0;
      const score      = recency * 0.6 + titleLen * 0.2 + twitterBns;
      return { ...a, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

// ── BEHAVIORAL SUMMARY ────────────────────────────────────────

function generateSummary(topicDist, articleCount, direction, primarySource) {
  if (!topicDist.length) return 'لا توجد بيانات كافية للتحليل.';

  const top    = topicDist[0];
  const second = topicDist[1];
  const third  = topicDist[2];

  // Opener based on dominance level
  let opener;
  if (top.pct >= 50) {
    opener = `تهيمن مادة "${top.nameAr}" بشكل واضح على ${top.pct}٪ من التغطية`;
  } else if (top.pct >= 30) {
    opener = `يتصدر "${top.nameAr}" المشهد بنسبة ${top.pct}٪`;
  } else {
    opener = `التغطية متوزعة، يتقدمها "${top.nameAr}" بـ${top.pct}٪`;
  }

  // Editorial frame
  const frames = {
    humanitarian: 'بإطار إنساني يركز على الضحايا والأثر الميداني',
    political:    'بإطار سياسي-دبلوماسي يعكس مواقف الحكومات',
    economic:     'مع تركيز اقتصادي تحليلي على الأسواق والمؤشرات',
    regional:     'مع متابعة إقليمية للتطورات الميدانية',
    global:       'ضمن منظور دولي شامل',
    neutral:      'بتنوع في زوايا التناول',
  };
  const frame = frames[direction] || '';

  // Tail
  let tail = '';
  if (second && second.pct >= 10) {
    tail = `، يليه "${second.nameAr}" بـ${second.pct}٪`;
    if (third && third.pct >= 8) {
      tail += ` و"${third.nameAr}" بـ${third.pct}٪`;
    }
  }

  // Source note
  const srcNote = primarySource === 'twitter'
    ? ' (استناداً إلى تغريدات الحساب الرسمي).'
    : '.';

  return `${opener} ${frame}${tail}${srcNote}`;
}

module.exports = { analyzeChannel };

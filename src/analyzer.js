// ─────────────────────────────────────────────────────────────
//  بريد — Analysis Engine
//  Input:  raw articles + tweets (merged), optional Claude classifications
//  Output: topic distribution, direction, trends, AI summary
// ─────────────────────────────────────────────────────────────

const { TOPICS, DIRECTIONS } = require('./topics');
const { classifyArticles, generateAISummary } = require('./classifier');

// ── MAIN ENTRY POINT ──────────────────────────────────────────

async function analyzeChannel(articles, channelNameAr = '') {
  if (!articles || articles.length === 0) {
    return { error: 'no_articles' };
  }

  const now     = Date.now();
  const DAY_MS  = 24 * 60 * 60 * 1000;
  const WEEK_MS = 7 * DAY_MS;

  const todayArticles = articles.filter(a => now - a.pubDate < DAY_MS);
  const weekArticles  = articles.filter(a => now - a.pubDate < WEEK_MS);

  // Use today's articles if enough, else fall back to most recent 40
  const working = todayArticles.length >= 3 ? todayArticles : articles.slice(0, 40);

  // ── Topic distribution ──
  // Try Claude classification first, fall back to keyword scoring
  let topicDist;
  let classifiedBy = 'keywords';

  try {
    const classifications = await classifyArticles(working);
    if (classifications) {
      topicDist   = buildDistributionFromClassifications(classifications, working);
      classifiedBy = 'claude';
    }
  } catch (err) {
    console.warn('[analyzer] Claude classification failed, using keywords:', err.message);
  }

  if (!topicDist) {
    const scores = scoreTopicsWithExclusions(working);
    topicDist = toDistribution(scores);
  }

  // ── Direction ──
  const direction = topicDist[0]?.direction || 'neutral';
  const dirMeta   = DIRECTIONS[direction] || DIRECTIONS.neutral;

  // ── Week trends ──
  const trends = computeTrends(weekArticles);

  // ── Behavioral summary — try AI first, fall back to template ──
  let summary;
  try {
    summary = await generateAISummary(
      channelNameAr,
      topicDist,
      working.length,
      articles[0]?.source === 'twitter',
      working  // pass actual articles for content-based summary
    );
  } catch (err) {
    console.warn('[analyzer] AI summary failed, using template:', err.message);
  }
  if (!summary) {
    summary = generateSummary(topicDist, working, direction, articles[0]?.source);
  }

  // ── Top stories ──
  const topStories = selectTopStories(working);

  // ── Source breakdown (today only) ──
  const rssCount     = todayArticles.filter(a => a.source === 'rss').length;
  const twitterCount = todayArticles.filter(a => a.source === 'twitter').length;

  return {
    totalToday:   todayArticles.length,
    totalWeek:    weekArticles.length,
    topics:       topicDist,
    direction,
    dirMeta,
    trends,
    summary,
    topStories,
    sources:      { rss: rssCount, twitter: twitterCount },
    classifiedBy,
    updatedAt:    new Date().toISOString(),
  };
}

// ── CLAUDE-BASED DISTRIBUTION ─────────────────────────────────
// Count how many articles were assigned to each topic, then convert to %

function buildDistributionFromClassifications(classifications, articles) {
  const counts = {};
  TOPICS.forEach(t => { counts[t.id] = 0; });

  classifications.forEach((topicId, i) => {
    if (topicId === 'other') return;
    if (counts[topicId] !== undefined) {
      // Twitter articles get 1.5× weight as direct editorial signals
      const weight = articles[i]?.source === 'twitter' ? 1.5 : 1.0;
      counts[topicId] += weight;
    }
  });

  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  if (total === 0) return [];

  return TOPICS
    .map(t => ({
      ...t,
      score: counts[t.id],
      pct:   Math.round((counts[t.id] / total) * 100),
    }))
    .filter(t => t.pct > 0)
    .sort((a, b) => b.score - a.score)
    .map((t, i, arr) => {
      // Fix rounding so percentages sum to exactly 100
      if (i === 0) {
        const rest = arr.slice(1).reduce((s, x) => s + x.pct, 0);
        return { ...t, pct: 100 - rest };
      }
      return t;
    });
}

// ── KEYWORD SCORING (fallback) ────────────────────────────────

function scoreTopicsWithExclusions(articles) {
  const scores = {};
  TOPICS.forEach(t => { scores[t.id] = 0; });

  articles.forEach(art => {
    const text = `${art.title} ${art.desc || ''}`.toLowerCase();
    const sourceMult = art.source === 'twitter' ? 1.5 : 1.0;

    TOPICS.forEach(topic => {
      // Count keyword hits
      let hits = 0;
      topic.keywords.forEach(kw => {
        if (text.includes(kw.toLowerCase())) hits++;
      });
      if (hits === 0) return;

      // Check exclusion context — if exclusion keywords are present
      // and outnumber topic hits, this article likely belongs elsewhere
      if (topic.contextExclude && topic.contextExclude.length > 0) {
        const excludeHits = topic.contextExclude
          .filter(kw => text.includes(kw.toLowerCase())).length;
        if (excludeHits > 0 && excludeHits >= hits) return; // skip this topic
      }

      scores[topic.id] += hits * topic.weight * sourceMult;
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

  const mid    = Math.floor(articles.length / 2);
  const older  = articles.slice(mid);
  const recent = articles.slice(0, mid);

  const oldScores = scoreTopicsWithExclusions(older);
  const newScores = scoreTopicsWithExclusions(recent);

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
      type:      Math.abs(t.delta) >= 12 ? 'spike' : t.delta > 0 ? 'up' : 'down',
    }));
}

// ── TOP STORIES ───────────────────────────────────────────────

function selectTopStories(articles) {
  const now = Date.now();

  return articles
    .filter(a => a.title && a.title.length > 10)
    .filter((a, i, arr) => {
      const key = a.title.substring(0, 30).toLowerCase();
      return arr.findIndex(x => x.title.substring(0, 30).toLowerCase() === key) === i;
    })
    .map(a => {
      const ageHours   = (now - a.pubDate) / 3600000;
      const recency    = Math.max(0, 1 - ageHours / 24);
      const titleLen   = Math.min(a.title.length / 80, 1);
      const twitterBns = a.source === 'twitter' ? 0.2 : 0;
      return { ...a, score: recency * 0.6 + titleLen * 0.2 + twitterBns };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

// ── NARRATIVE SUMMARY (no-AI fallback) ───────────────────────
// Builds a content-based paragraph from actual article titles — no percentages.

function generateSummary(topicDist, articles = [], direction, primarySource) {
  const titles = (Array.isArray(articles) ? articles : [])
    .filter(a => a.title && a.title.length > 18)
    .map(a => a.title.replace(/https?:\/\/\S+/g, '').trim())
    .filter(t => t.length > 15)
    .slice(0, 20);

  if (!titles.length || !topicDist.length) {
    return 'لا توجد بيانات كافية لإعداد الملخص في الوقت الحالي.';
  }

  const t1 = topicDist[0];
  const t2 = topicDist[1];
  const t3 = topicDist[2];

  // Divide titles into three groups for variety
  const g1 = titles.slice(0, Math.ceil(titles.length * 0.4));
  const g2 = titles.slice(Math.ceil(titles.length * 0.4), Math.ceil(titles.length * 0.7));
  const g3 = titles.slice(Math.ceil(titles.length * 0.7));

  const dirPhrases = {
    humanitarian: 'مع تسليط الضوء على الأبعاد الإنسانية وتداعياتها على المدنيين',
    political:    'في سياق متابعة المشهد السياسي والتحركات الدبلوماسية',
    economic:     'مع رصد المتغيرات الاقتصادية وتأثيراتها على المنطقة',
    regional:     'ضمن متابعة شاملة للتطورات الإقليمية المتسارعة',
    global:       'من منظور دولي يرصد تشعبات الأحداث وامتداداتها',
    neutral:      'بتغطية متوازنة توزعت على مجالات متعددة',
  };

  const lines = [];

  // Line 1: opening frame
  if (t1.pct >= 45) {
    lines.push(`شكّل ملف "${t1.nameAr}" المحور الرئيسي للتغطية الإخبارية لهذه القناة خلال اليوم`);
  } else if (t1 && t2) {
    lines.push(`تنوعت اهتمامات القناة الإخبارية اليوم وتوزعت بين ملفات "${t1.nameAr}"${t2 ? ` و"${t2.nameAr}"` : ''}${t3 ? ` و"${t3.nameAr}"` : ''}`);
  } else {
    lines.push(`رصدت القناة اليوم جملةً من التطورات المتسارعة على مختلف الصُّعد`);
  }

  // Lines 2-3: first group of headlines
  if (g1.length >= 2) {
    lines.push(`وتصدّرت المشهد الإخباري قضايا من أبرزها "${g1[0]}"، فضلاً عن تطورات "${g1[1]}" التي احتلت حيزاً واسعاً من الاهتمام`);
  } else if (g1.length === 1) {
    lines.push(`وتصدّرت المشهد قضية "${g1[0]}" التي استأثرت باهتمام المتابعين`);
  }

  // Line 4: second group
  if (g2.length >= 2) {
    lines.push(`كما أولت القناة اهتماماً بارزاً لمستجدات "${g2[0]}"، ورصدت في السياق ذاته تطورات ملف "${g2[1]}"`);
  } else if (g2.length === 1) {
    lines.push(`كما تابعت القناة عن كثب مجريات "${g2[0]}"`);
  }

  // Line 5: third group
  if (g3.length >= 2) {
    lines.push(`ولم تغفل التغطية عن رصد "${g3[0]}" إلى جانب "${g3[1]}" في مشهد إخباري متشعب`);
  } else if (g3.length === 1) {
    lines.push(`ولم تغفل التغطية عن متابعة "${g3[0]}"`);
  }

  // Line 6: second topic context
  if (t2) {
    lines.push(`وعلى صعيد "${t2.nameAr}"، واصلت القناة متابعتها المستمرة للمستجدات في هذا الملف الذي يُلقي بظلاله على المشهد العام`);
  }

  // Line 7: third topic or direction
  if (t3) {
    lines.push(`أما ملف "${t3.nameAr}" فقد حضر بجلاء ضمن أولويات التغطية اليومية`);
  }

  // Line 8: editorial framing
  lines.push(dirPhrases[direction] || dirPhrases.neutral);

  // Line 9: closing synthesis
  const srcNote = primarySource === 'twitter'
    ? 'وقد انعكست هذه الأولويات بوضوح في تغريدات الحساب الرسمي للقناة على منصة X'
    : 'وقد جاءت هذه التغطية انعكاساً لخط تحريري واضح المعالم';
  lines.push(srcNote);

  return lines.join('. ') + '.';
}

module.exports = { analyzeChannel };

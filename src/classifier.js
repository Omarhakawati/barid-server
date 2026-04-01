// ─────────────────────────────────────────────────────────────
//  بريد — AI Article Classifier
//  Uses Claude Haiku to classify articles into topics.
//  Falls back to keyword matching if API key is not set.
// ─────────────────────────────────────────────────────────────

const Anthropic = require('@anthropic-ai/sdk');
const { TOPICS } = require('./topics');

let client = null;

function getClient() {
  if (!client && process.env.ANTHROPIC_API_KEY) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

const VALID_IDS = new Set(TOPICS.map(t => t.id).concat(['other']));

const TOPIC_LIST = TOPICS.map(t => `- ${t.id}: ${t.nameAr}`).join('\n');

// Classify a batch of articles. Returns an array of topic IDs (one per article).
// Returns null if Claude API is unavailable — caller falls back to keyword matching.
async function classifyArticles(articles) {
  const cl = getClient();
  if (!cl || !articles || articles.length === 0) return null;

  // Build numbered list of titles (descriptions help accuracy but keep tokens low)
  const lines = articles.map((a, i) => {
    const text = a.title + (a.desc ? ` — ${a.desc.slice(0, 80)}` : '');
    return `${i + 1}. ${text}`;
  }).join('\n');

  const prompt = `You are a news classifier for Arabic and English news headlines.
Classify each headline into exactly ONE topic ID from this list:
${TOPIC_LIST}
- other: doesn't clearly fit any topic

Rules:
- A sports article mentioning "القدس" (Jerusalem) as a stadium or cup name = sports, NOT palestine
- An article about Trump/Biden policy on Gaza = palestine (not international)
- An article about oil prices in the Gulf = economy (not regional)
- Be specific: prefer the most precise match over a general one

Headlines:
${lines}

Respond with ONLY a valid JSON array of topic IDs, one per headline, in the same order.
Example: ["palestine","economy","sports"]
No markdown, no explanations.`;

  const response = await cl.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: Math.max(64, articles.length * 12), // ~10 chars per ID
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].text.trim();

  // Strip markdown code fences if present
  const clean = text.replace(/^```json?\s*/i, '').replace(/\s*```$/, '');
  const parsed = JSON.parse(clean);

  if (!Array.isArray(parsed) || parsed.length !== articles.length) {
    throw new Error(`Unexpected classifier response length: got ${parsed.length}, expected ${articles.length}`);
  }

  // Sanitize — replace any unknown IDs with 'other'
  return parsed.map(id => VALID_IDS.has(id) ? id : 'other');
}

// Generate an AI behavioral summary for a channel given topic distribution
async function generateAISummary(channelNameAr, topicDist, articleCount, xEnabled) {
  const cl = getClient();
  if (!cl || !topicDist.length) return null;

  const topicsText = topicDist
    .map(t => `- ${t.nameAr}: ${t.pct}٪`)
    .join('\n');

  const prompt = `أنت محلل إعلامي متخصص في رصد السلوك التحريري لوسائل الإعلام العربية.

القناة: ${channelNameAr}
عدد المقالات المحللة: ${articleCount} مقال خلال آخر 24 ساعة
توزيع التغطية:
${topicsText}

اكتب فقرة تحليلية واحدة موجزة (جملتان إلى ثلاث) تصف السلوك التحريري لهذه القناة بناءً على التوزيع أعلاه.
- ركز على التوجه الرئيسي والأنماط اللافتة
- استخدم لغة تحليلية مهنية بالعربية
- لا تذكر الأرقام والنسب حرفياً، بل اعكسها في وصفك
- لا تبدأ بـ "القناة" أو "هذه القناة"`;

  const response = await cl.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 200,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content[0].text.trim();
}

module.exports = { classifyArticles, generateAISummary };

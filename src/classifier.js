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

// Short behavioral summary (2-3 sentences) — shown in the "اليوم" tab
async function generateAISummary(channelNameAr, topicDist, articleCount, xEnabled, articles = []) {
  const cl = getClient();
  if (!cl || !topicDist.length) return null;

  const topicsText = topicDist.map(t => `- ${t.nameAr}: ${t.pct}٪`).join('\n');

  const prompt = `أنت محلل إعلامي متخصص في رصد السلوك التحريري لوسائل الإعلام العربية.

القناة: ${channelNameAr}
توزيع التغطية اليوم:
${topicsText}

اكتب جملتين إلى ثلاث جمل تصف السلوك التحريري لهذه القناة بناءً على هذا التوزيع.
- أسلوب تحليلي مختصر
- لا تذكر الأرقام والنسب حرفياً، بل اعكسها في وصفك
- لا تبدأ بـ "القناة" أو "هذه القناة"`;

  const response = await cl.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 180,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content[0].text.trim();
}

// Deep geopolitical analysis — shown in the "مُلخص" tab
async function generateLongSummary(channelNameAr, articles = []) {
  const cl = getClient();
  if (!cl || !articles.length) return null;

  const sample = articles.slice(0, 60);
  const contentLines = sample.map((a, i) => {
    const prefix = a.source === 'twitter' ? '🐦' : '📰';
    return `${i + 1}. ${prefix} ${a.title}`;
  }).join('\n');

  const prompt = `You are not a summarization tool.
You are a geopolitical and editorial analyst embedded inside a high-level newsroom.

Your task is to read all incoming articles, posts, and news content from the connected account: ${channelNameAr}
Then produce a structured, deep analysis — not a surface summary.
Your analysis must move from "what happened" to "what it means".

Content for today:
${contentLines}

Follow this exact framework:

1. SIGNAL EXTRACTION (ما الذي يحدث فعلاً؟)
- Identify the core signals across the content.
- What are the repeated themes, narratives, or angles?
- Ignore noise. Focus only on meaningful patterns.

2. POWER MAPPING (خريطة القوة)
- Who are the key actors involved (states, institutions, individuals)?
- What does each actor want?
- What are the visible and hidden interests?

3. TRAJECTORY ANALYSIS (إلى أين يتجه الحدث؟)
- Is this escalation, stabilization, or transformation?
- What is the likely short-term and mid-term direction?

4. MEDIA FRAMING (كيف يتم تأطير الخبر؟)
- How is this source framing the story?
- What is being emphasized vs ignored?

5. WHAT IS NOT SAID (ما الذي لم يُقل؟)
- Identify gaps, missing context, or suppressed angles.

6. STRATEGIC INSIGHT (الخلاصة الذكية)
- Give 2–3 sharp insights that redefine understanding.
- Avoid generic conclusions. Each insight must add a new lens.

7. COMPRESSION (تلخيص ذكي جداً)
- Write a 2–3 line synthesis that captures the full meaning.

STRICT RULES:
- Do NOT summarize each article individually.
- Think like a strategist, not a reporter.
- Write in Arabic.
- Tone: intelligent, sharp, minimal, newsroom-level.
- Output should feel like: "A briefing for decision-makers, not content for casual readers."`;

  const response = await cl.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content[0].text.trim();
}

module.exports = { classifyArticles, generateAISummary, generateLongSummary };

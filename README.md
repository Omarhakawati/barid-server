# بريد — Live News Intelligence Server

A Node.js backend that pulls from **RSS feeds** and **Twitter/X accounts** for Arabic news channels, analyzes editorial behavior in real-time, and serves the بريد mobile app.

---

## Quick Start

### 1. Install dependencies
```bash
cd barid-server
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
```

Open `.env` and fill in your X Bearer Token (see below).

### 3. Start the server
```bash
npm start
# or for auto-restart during development:
npm run dev
```

### 4. Open the app
Visit **http://localhost:3000** in your browser (or phone on the same WiFi).

---

## Getting Your X (Twitter) Bearer Token

1. Go to https://developer.twitter.com/en/portal/dashboard
2. Create a new Project + App (free account works)
3. Under **Keys and Tokens** → copy **Bearer Token**
4. Paste it into `.env` as `X_BEARER_TOKEN=...`

> **Free tier limits:** 500,000 tweet reads/month, 15 requests per 15 minutes.
> بريد caches results for 15 minutes so you won't hit the limit.

> **Without a token:** The app still works using RSS feeds only. X tweets add richer,
> more real-time signals but are not required.

---

## Architecture

```
Phone / Browser
      │
      ▼
Express Server (port 3000)
      │
      ├── GET /api/channels          → list all channels
      ├── GET /api/channel/:id       → full analysis (cached)
      ├── GET /api/channel/:id/live  → SSE push updates
      └── GET /health                → status check
      │
      ├── RSS Fetcher   → parses XML feeds (cached 10 min)
      ├── X Fetcher     → Twitter API v2 user timeline (cached 15 min)
      └── Analyzer
            ├── Topic clustering (keyword matching × 7 topics)
            ├── Distribution calculation (%)
            ├── Trend detection (recent vs older split)
            ├── Editorial direction inference
            └── Behavioral summary generation
```

---

## Channels Included

| Channel | RSS | X Account |
|---------|-----|-----------|
| الجزيرة العربية | ✅ | @AJArabic |
| BBC عربي | ✅ | @BBCArabic |
| CNN بالعربية | ✅ | @cnnarabic |
| سكاي نيوز عربية | ✅ | @SkyNewsArabia |
| فرانس ٢٤ | ✅ | @France24_ar |
| DW عربية | ✅ | @dw_arabic |

To add a channel, edit `src/channels.js`.

---

## Deploying to the Internet

### Railway (free tier)
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway init
railway up

# Set environment variable
railway variables set X_BEARER_TOKEN=your_token_here
```

### Render (free tier)
1. Push this folder to a GitHub repo
2. Create a new Web Service on render.com
3. Set build command: `npm install`
4. Set start command: `npm start`
5. Add `X_BEARER_TOKEN` in Environment Variables

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `X_BEARER_TOKEN` | *(required for X)* | Twitter/X API Bearer Token |
| `PORT` | `3000` | Server port |
| `RSS_CACHE_TTL` | `600` | RSS cache lifetime in seconds |
| `X_CACHE_TTL` | `900` | Twitter cache lifetime in seconds |
| `ALLOWED_ORIGIN` | `*` | CORS origin restriction |

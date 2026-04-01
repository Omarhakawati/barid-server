// ─────────────────────────────────────────────────────────────
//  بريد — Daily History Storage
//  Saves per-channel article counts by date so weekly totals
//  are based on real historical data, not just RSS feed window.
//
//  File: data/daily-counts.json
//  Schema:
//  {
//    "ajabreaking": { "2026-03-26": 34, "2026-03-27": 41, ... },
//    "bbc":         { "2026-03-26": 12, ... }
//  }
// ─────────────────────────────────────────────────────────────

const fs   = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'daily-counts.json');

function today() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function load() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('[history] Failed to load:', e.message);
  }
  return {};
}

function save(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('[history] Failed to save:', e.message);
  }
}

// Record today's count for a channel.
// Only updates if the new count is higher (handles multiple fetches per day).
function recordToday(channelId, count) {
  const data = load();
  if (!data[channelId]) data[channelId] = {};

  const key = today();
  const existing = data[channelId][key] || 0;
  if (count > existing) {
    data[channelId][key] = count;
    save(data);
    pruneOldEntries(data, channelId);
  }
}

// Get the true weekly total from stored history (sum of last 7 days).
// Falls back to the live count if no history exists yet.
function getWeekTotal(channelId, liveTotal) {
  const data = load();
  const channelHistory = data[channelId];
  if (!channelHistory || Object.keys(channelHistory).length === 0) {
    return liveTotal; // no history yet, use live RSS count
  }

  const days = last7Days();
  const total = days.reduce((sum, day) => sum + (channelHistory[day] || 0), 0);

  // If history total is 0 (server just started), fall back to live
  return total > 0 ? total : liveTotal;
}

// Returns an array of the last 7 date strings including today.
function last7Days() {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

// Returns last 7 days as { date, count } array for chart/trend use.
function getWeekBreakdown(channelId) {
  const data = load();
  const channelHistory = data[channelId] || {};
  return last7Days()
    .reverse() // oldest first
    .map(date => ({ date, count: channelHistory[date] || 0 }));
}

// Keep only 30 days of data per channel to prevent unbounded growth.
function pruneOldEntries(data, channelId) {
  const history = data[channelId];
  if (!history) return;
  const keys = Object.keys(history).sort();
  if (keys.length > 30) {
    keys.slice(0, keys.length - 30).forEach(k => delete history[k]);
    save(data);
  }
}

module.exports = { recordToday, getWeekTotal, getWeekBreakdown };

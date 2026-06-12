import { BACKEND_URL } from '../config';

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

// In-memory cache: key → { data, fetchedAt }
const _cache = {};

function cacheKey(dateStr) {
  return `cal_${dateStr}`;
}

// Returns events for Maddie, Alex, and Marj on the given date (YYYY-MM-DD).
// Shape: { maddie: [...], alex: [...], marj: [...] }
// Each event: { id, title, startTime, endTime, allDay, color }
export async function fetchCalendarEvents(dateStr) {
  const key = cacheKey(dateStr);
  const cached = _cache[key];
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  const url = `${BACKEND_URL}/api/calendar/events?date=${dateStr}&calendars=maddie,alex,marj`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Calendar fetch failed: ${res.status}`);
  const raw = await res.json();

  // Backend returns { maddie: [...], alex: [...], marj: [...] }
  // Each event has: id, summary/title, start, end, allDay
  const COLORS = { maddie: '#B898A0', alex: '#7AA8A0', marj: '#D4A86A' };
  const data = {};
  for (const person of ['maddie', 'alex', 'marj']) {
    const events = Array.isArray(raw[person]) ? raw[person] : [];
    data[person] = events.map(ev => ({
      id: ev.id,
      title: ev.summary || ev.title || '(No title)',
      startTime: ev.start || '',
      endTime: ev.end || '',
      allDay: !!ev.allDay,
      color: COLORS[person],
    }));
  }

  _cache[key] = { data, fetchedAt: Date.now() };
  return data;
}

export function invalidateCalendarCache() {
  Object.keys(_cache).forEach(k => delete _cache[k]);
}

import { BACKEND_URL } from '../config';

const CACHE_TTL_MS = 15 * 60 * 1000;
const _cache = {};

function cacheKey(start, end) {
  return `cal_${start}_${end}`;
}

// Returns flat events array for a date range.
// Each event: { id, person (lowercase key), title, startTime, endTime, allDay, color, description, location }
// person values: 'maddie' | 'alex' | 'marj' | 'mum' | 'dad' | 'family'
export async function fetchCalendarEventsForRange(startStr, endStr) {
  const key = cacheKey(startStr, endStr);
  const cached = _cache[key];
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  const url = `${BACKEND_URL}/api/calendar/events?start=${startStr}&end=${endStr}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Calendar fetch failed: ${res.status}`);
  const raw = await res.json();

  // Backend returns { events: [...], cached: bool, count: int }
  // Each event has: id, person ('Alex'/'Maddie'/'Marj'/'Mum'/'Dad'/'Family'), title, start, end, color, allDay
  const data = (raw.events || []).map(ev => ({
    id:          ev.id,
    person:      (ev.person || '').toLowerCase(), // 'alex', 'maddie', 'marj', 'mum', 'dad', 'family'
    title:       ev.title || '(No title)',
    startTime:   ev.start || '',
    endTime:     ev.end || '',
    allDay:      !!ev.allDay,
    color:       ev.color || '#8A8A8A',
    description: ev.description || '',
    location:    ev.location || '',
  }));

  _cache[key] = { data, fetchedAt: Date.now() };
  return data;
}

// Single-day fetch grouped by person — keeps HomeTab backwards compatible.
// Returns { maddie: [...], alex: [...], marj: [...] }
export async function fetchCalendarEvents(dateStr) {
  const events = await fetchCalendarEventsForRange(dateStr, dateStr);
  const result = { maddie: [], alex: [], marj: [] };
  for (const ev of events) {
    if (result[ev.person] !== undefined) result[ev.person].push(ev);
  }
  return result;
}

export function invalidateCalendarCache() {
  Object.keys(_cache).forEach(k => delete _cache[k]);
}

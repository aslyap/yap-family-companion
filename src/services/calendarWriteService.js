import { BACKEND_URL } from '../config';
import { invalidateCalendarCache } from './calendarService';

// Create one event per person in their respective Google Calendar.
// persons: array of 'maddie' | 'alex' | 'marj' | 'family'
// event: { title, startISO, endISO, location? }
// startISO / endISO: full ISO datetime with offset e.g. "2026-06-14T09:00:00+08:00"
export async function createCalendarEvent({ persons, title, startISO, endISO, location = '' }) {
  if (!persons || persons.length === 0) throw new Error('At least one person required');
  const results = await Promise.all(
    persons.map(person =>
      fetch(`${BACKEND_URL}/api/calendar/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person, title, startISO, endISO, location }),
      }).then(async r => {
        if (!r.ok) {
          const text = await r.text();
          throw new Error(`Create failed for ${person}: ${r.status} ${text}`);
        }
        return r.json();
      })
    )
  );
  invalidateCalendarCache();
  return results;
}

// Update an event in a specific person's calendar.
// person: which calendar the event lives in
export async function updateCalendarEvent({ eventId, person, title, startISO, endISO, location }) {
  const res = await fetch(`${BACKEND_URL}/api/calendar/events/${eventId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ person, title, startISO, endISO, location }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Update failed: ${res.status} ${text}`);
  }
  invalidateCalendarCache();
  return res.json();
}

// Delete an event from a specific person's calendar.
export async function deleteCalendarEvent({ eventId, person }) {
  const res = await fetch(
    `${BACKEND_URL}/api/calendar/events/${eventId}?person=${encodeURIComponent(person)}`,
    { method: 'DELETE' }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Delete failed: ${res.status} ${text}`);
  }
  invalidateCalendarCache();
}

import { useEffect, useState } from 'react';

// "A call push has arrived, but we cannot show the ring screen yet."
//
// An incoming call launches this app from a killed state, and the ring screen
// cannot render until a chain of async work finishes: fetch a Stream token,
// connectUser(), then either firebaseDataHandler → onRingingCall (Android) or the
// deep-link cid → onRingingCall (iOS). Until then StreamWrapper renders only its
// children, so the phone sat on the app's Home tab for several seconds before
// snapping to the call — the app looked broken at the exact moment it matters.
//
// Nothing in the call state can cover that gap, because during it there is no call
// object and no client. What we DO know much earlier is that a call is coming: the
// FCM message (Android) or the yapfamily:// deep link (iOS) both say so before any
// of the connect work starts. That signal lives here.
//
// Android note on why a module-level flag works across the launch: a data FCM
// arriving at a killed app starts a headless JS task, and MainActivity then reuses
// the same React instance — so index.js's background handler and App.js share this
// module, the same way they already share the Stream client (see index.js).

// If the call never materialises (push for a call the caller already cancelled, a
// failed onRingingCall, no network at all) the cover must not strand the user on a
// fake "incoming call" screen. Long enough to cover a slow cold start, short enough
// that a dud push is a blip.
const TTL_MS = 25000;

let pendingSince = null;
const listeners = new Set();

function notify() {
  listeners.forEach(fn => fn(isCallPending()));
}

export function markCallPending() {
  pendingSince = Date.now();
  notify();
}

export function clearCallPending() {
  if (pendingSince === null) return;
  pendingSince = null;
  notify();
}

export function isCallPending() {
  if (pendingSince === null) return false;
  if (Date.now() - pendingSince > TTL_MS) {
    pendingSince = null;
    return false;
  }
  return true;
}

export function onCallPendingChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Re-renders when the flag changes AND when it expires — the TTL is otherwise only
// noticed by whoever next calls isCallPending(), which for a stuck cover is nobody.
export function useCallPending() {
  const [pending, setPending] = useState(isCallPending);

  useEffect(() => onCallPendingChange(setPending), []);

  useEffect(() => {
    if (!pending || pendingSince === null) return;
    const remaining = Math.max(0, TTL_MS - (Date.now() - pendingSince));
    const t = setTimeout(() => setPending(isCallPending()), remaining + 50);
    return () => clearTimeout(t);
  }, [pending]);

  return pending;
}

import { useEffect, useState } from 'react';

// The Accept or Decline that was pressed BEFORE there was a call object to press
// it on.
//
// Why this exists: an incoming call cannot show working buttons immediately. The
// chain is FCM/deep link → fetch a Stream token → connectUser() → onRingingCall()
// → the call lands in useCalls() → IncomingCallScreen renders. Measured at ~2s in
// session 20 and reported at ~5s on the Oppo in session 23, and it is paid on
// every call because the app exits after each one. Until that finishes,
// IncomingCallPlaceholder covers the screen with a spinner, and the buttons the
// user is reaching for simply are not there yet.
//
// The old reasoning (IncomingCallPlaceholder, session 18) was that a button with
// no call behind it is a dead button, and a dead button on an incoming call is
// worse than no button. That is right about dead buttons and wrong about the
// conclusion: the press does not have to act immediately, it only has to be
// REMEMBERED. The call is already identified by then — Android's FCM data message
// carries `call_cid` and iOS's Bark deep link carries `cid` — so an intent
// recorded here can be executed the instant the real screen mounts.
//
// So the phone shows real buttons from the first frame, and the connect delay is
// spent with the user's answer already banked instead of with the user waiting.
//
// ⚠️ What this does NOT do: make a decline reach the kiosk any faster. Rejecting a
// call still needs a connected client, so the kiosk keeps ringing for the length
// of the connect either way. What changes is that the user can answer and put the
// phone down instead of holding it waiting for buttons.

// Same budget as pendingCall's cover. An intent that outlives the cover would be
// applied to whatever call arrived next, which on this phone could be a genuinely
// different call minutes later.
const TTL_MS = 25000;

// { action: 'accept' | 'decline', cid: string | null, at: number }
let intent = null;
const listeners = new Set();

function notify() {
  listeners.forEach(fn => fn(peekCallIntent()));
}

function fresh() {
  if (!intent) return null;
  if (Date.now() - intent.at > TTL_MS) {
    intent = null;
    return null;
  }
  return intent;
}

export function setCallIntent(action, cid) {
  intent = { action, cid: cid ?? null, at: Date.now() };
  notify();
}

/** Read without consuming — for rendering the pressed state on the cover. */
export function peekCallIntent() {
  return fresh();
}

/**
 * Consume the intent if it belongs to this call, and return its action.
 *
 * Matched on cid when we have one on both sides. A null cid on the intent means
 * the signal that raised the cover never named the call (a push whose payload we
 * could not read), in which case the only sane reading of the press is "the call
 * that is arriving right now" — it is applied to the first call that shows up
 * inside the TTL. A cid MISMATCH is never applied: that is a different call, and
 * silently accepting it would open a camera and microphone the user never agreed
 * to.
 */
export function takeCallIntent(cid) {
  const current = fresh();
  if (!current) return null;
  if (current.cid && cid && current.cid !== cid) return null;
  intent = null;
  notify();
  return current.action;
}

export function clearCallIntent() {
  if (intent === null) return;
  intent = null;
  notify();
}

export function useCallIntent() {
  const [value, setValue] = useState(peekCallIntent);
  useEffect(() => {
    listeners.add(setValue);
    return () => listeners.delete(setValue);
  }, []);
  return value;
}

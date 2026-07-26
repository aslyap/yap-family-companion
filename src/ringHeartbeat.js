import { BACKEND_URL } from './config';

// Tell the backend this phone is already showing the call, so it can suppress the
// Bark push.
//
// The problem being solved is not a duplicate banner. Bark's continuous Critical
// Alert HOLDS THE iOS AUDIO SESSION, and while it rings the call has no audio in
// either direction — measured: answering from the app's own screen gave the kiosk
// no audio RTP at all and this phone reported `int=A-` (an audio-session
// interruption); swiping the notification away restored 65kbps immediately, same
// call. So when the app is already open, the push actively breaks the call it is
// announcing.
//
// Why a repeating heartbeat rather than one "I'm ringing" post: a single ack can
// be followed by the app being killed, backgrounded by an incoming carrier call,
// or losing its Stream socket — and the push would already have been cancelled,
// leaving a silent phone. Beats stop when any of that happens, and the backend
// rings late instead. A late ring beats a missed call.
//
// Sent over HTTP to our own backend rather than as a Stream custom event to the
// kiosk, deliberately: `call.rejected` is never delivered to that kiosk (measured,
// session 18 — it has to poll `session.rejected_by` instead), so Stream event
// delivery is not something to put in the path of the only alert Kath gets.
const BEAT_EVERY_MS = 400;

function post(path, body) {
  return fetch(`${BACKEND_URL}/api/ring/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Beats while the ring screen is on screen. Returns a disposer.
 *
 * `getState` is read each beat rather than captured: the backend only counts a
 * beat when the call is still genuinely unanswered on a healthy client, so a
 * screen that is still mounted over a dead Stream connection cannot suppress the
 * one alert that would still work.
 */
export function startRingHeartbeat(cid, getState) {
  if (!cid) return () => {};
  let stopped = false;

  const beat = () => {
    if (stopped) return;
    const { state, healthy } = getState();
    post('heartbeat', { cid, state, healthy }).catch(err => {
      // Not silent, but not fatal either: a failed beat simply means the backend
      // stops hearing us and rings, which is the safe direction.
      console.warn('[ring] heartbeat failed:', err?.message ?? err);
    });
  };

  beat();
  const id = setInterval(beat, BEAT_EVERY_MS);
  return () => { stopped = true; clearInterval(id); };
}

/**
 * Answered, declined, or the call went away. Stops the backend watching, so it
 * never rings late into a call that is already up.
 */
export function stopRing(cid, reason) {
  if (!cid) return Promise.resolve();
  return post('stop', { cid, reason }).catch(err => {
    console.warn('[ring] stop failed:', err?.message ?? err);
  });
}

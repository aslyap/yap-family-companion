// TEMPORARY — remove alongside SHOW_CALL_DEBUG in App.js.
//
// Neither phone can produce logs: the iPhone has no Mac to attach to, and adb is
// deliberately off on the Oppo because banking apps flag it. So console.warn on
// device goes nowhere, and every phone-side failure has had to be inferred from
// what the kiosk saw. That inference has been wrong more than once.
//
// This keeps the last few call-related messages in memory so the debug strip can
// render them. It is a diagnostic surface, not error handling — the console.warn
// calls stay where they are.

// The Accept sequence now logs the audio warm-up, each callingState transition and
// the join outcome; 6 lines pushed the start of the sequence off the top before it
// could be read. Session 20 adds participant/track lines on top of that, and the
// whole point is to compare call 1 against call 2 — so BOTH sequences have to be
// on screen at once, which is ~7 lines each.
const MAX = 16;
let lines = [];
let listeners = new Set();

export function debugLog(msg) {
  // mm:ss.mmm — the Accept measurement is the difference between two lines, and
  // whole seconds can't tell a 2.9s join from a 2.0s one.
  const now = new Date();
  const stamp =
    `${String(now.getMinutes()).padStart(2, '0')}:` +
    `${String(now.getSeconds()).padStart(2, '0')}.` +
    `${String(now.getMilliseconds()).padStart(3, '0')}`;
  lines = [...lines, `${stamp} ${msg}`].slice(-MAX);
  listeners.forEach(fn => fn(lines));
}

export function getDebugLines() {
  return lines;
}

export function onDebugLog(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

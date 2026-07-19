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

const MAX = 3;
let lines = [];
let listeners = new Set();

export function debugLog(msg) {
  const stamp = new Date().toLocaleTimeString('en-GB', { hour12: false }).slice(3);
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

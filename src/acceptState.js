// Which calls this process has already started accepting.
//
// Module-level rather than component state, because component state is exactly
// what fails here. The SDK's join() retries internally, and a failed attempt
// restores the previous calling state, so a joining call can go
// `joining -> ringing -> joining` (measured: ringing again 6575ms into an accept
// that eventually took 20.3s). CallOverlay matches JOINING/JOINED as "active" and
// RINGING/IDLE as "incoming", so that flap swaps ActiveCallScreen back to
// IncomingCallScreen — a REMOUNT, which resets the `busy` flag guarding the accept
// button and re-arms Accept on a call that is already mid-join.
//
// Tapping it there calls join() a second time, and the SDK throws outright:
//   `Illegal State: call.join() shall be called only once`
// (video-client index.es.js:14325). The call then fails, having looked to the user
// like a perfectly normal ring screen. This is the "if she taps Accept on the app
// screen the call will fail" report, and it has nothing to do with Bark — the ring
// screen simply comes back mid-join.
//
// Keyed by cid and pruned against the client's live call list, so a later call to
// the same person is unaffected.
const accepting = new Set();

export function markAccepting(cid) {
  if (cid) accepting.add(cid);
}

export function isAccepting(cid) {
  return !!cid && accepting.has(cid);
}

// Called when the accept fails, so the user can genuinely retry. NOT called on
// success: the flag must outlive the join for the whole of the state flap above.
export function clearAccepting(cid) {
  if (cid) accepting.delete(cid);
}

// Drops cids the client no longer holds. Without this the set would grow for the
// life of the process and, worse, a cid could in principle be reused.
export function pruneAccepting(liveCids) {
  const live = new Set(liveCids);
  for (const cid of accepting) {
    if (!live.has(cid)) accepting.delete(cid);
  }
}

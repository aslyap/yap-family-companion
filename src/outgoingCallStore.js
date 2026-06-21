// Bridges the outgoing call created in HomeTab's CallHomeButton to the
// CallOverlay in App.js. useCalls() inside <StreamVideo> does not track
// calls created externally via client.call().getOrCreate().join(), so we
// use a module-level listener instead.
let _call = null;
let _listener = null;

export function setOutgoingCall(call) {
  _call = call;
  _listener?.(call);
}

export function getOutgoingCall() {
  return _call;
}

export function onOutgoingCallChange(fn) {
  _listener = fn;
  return () => { if (_listener === fn) _listener = null; };
}

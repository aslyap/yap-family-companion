// TEMPORARY — session 20 instrumentation for the iOS second-call bug.
// Remove alongside SHOW_CALL_DEBUG in App.js once iOS is signed off.
//
// The symptom: on iOS, the FIRST call after launch works; every later call in the
// same process joins (faster than the first, 1658ms) and publishes — the kiosk sees
// the phone's video — while the phone itself receives nothing. No remote video, no
// audio either way, spinner forever. Force-killing the app clears it; a full Stream
// client teardown + re-init does not, a kiosk refresh does not, and a first call
// that merely rang and was cancelled poisons the next one exactly as much as an
// answered one. Four theories died to single tests last session.
//
// The strip could not settle any of them because it says nothing about what the
// phone RECEIVES. That is the whole job of this file. It answers two questions:
//
//   1. On call 2, does the phone see the kiosk as a participant at all?
//   2. If it does, does it think that participant has tracks — published by the
//      kiosk, and subscribed by us?
//
// Those three outcomes (no participant / participant with no tracks / tracks that
// exist but are dead) are three different bugs in three different layers, and the
// strip currently cannot tell them apart.
//
// Two rules this file exists to obey:
//
//   * Subscribe DIRECTLY, never from a React effect. CallOverlay swaps to
//     ActiveCallScreen the moment callingState reaches JOINING, which unmounts
//     IncomingCallScreen mid-join — an effect would stop reporting exactly when
//     the interesting part begins. That trap cost session 17 a cycle.
//   * Print raw values with their names. `[cam] post-enable: live false` was read
//     as a dead camera last session; it was readyState + muted, i.e. healthy.
//     Nothing here is pre-interpreted into "ok"/"broken".

import { SfuModels } from '@stream-io/video-react-native-sdk';
import { debugLog } from './debugLog';

// `publishedTracks` is a list of protobuf TrackType enum values, so reading it needs
// the enum. Checked rather than assumed: if the re-export through the RN SDK ever
// fails to resolve, `includes(undefined)` would quietly return false and the strip
// would report `pub=--` on a perfectly healthy call — a wrong reading, which is
// worse than no reading. AUDIO = 1, VIDEO = 2 in video/sfu/models.
const AUDIO = SfuModels?.TrackType?.AUDIO;
const VIDEO = SfuModels?.TrackType?.VIDEO;
const TRACK_TYPES_OK = AUDIO !== undefined && VIDEO !== undefined;
if (!TRACK_TYPES_OK) {
  console.warn('[callTrace] SfuModels.TrackType unavailable — pub=/int= will read "?"');
}

// Reduces a TrackType list to A/V flags. Prints `?` rather than `-` if the enum
// never resolved, so "not publishing" and "cannot tell" can never be confused.
function flags(tracks) {
  if (!TRACK_TYPES_OK) return '??';
  const list = tracks ?? [];
  return `${list.includes(AUDIO) ? 'A' : '-'}${list.includes(VIDEO) ? 'V' : '-'}`;
}

// ─── Process-lifetime call numbering ─────────────────────────────────────────
//
// Call 1 works and call 2 does not, so every line has to say which call it came
// from — otherwise two runs of near-identical output cannot be lined up. The
// counter is module-level, so it resets only when the process does, which is
// exactly the boundary the bug lives on: force-killing the app is the only known
// cure, and that is the only thing that sends this back to #1.

let nextSeq = 0;
const seqByCid = new Map();

/**
 * Stable per-call ordinal for this process. Numbers a call the first time it is
 * seen — including one that only rang and was cancelled, which is known to poison
 * the next call just as much as an answered one, so it must consume a number.
 */
export function callSeq(call) {
  const cid = call?.cid ?? call?.id;
  if (!cid) return 0;
  const known = seqByCid.get(cid);
  if (known !== undefined) return known;

  const n = ++nextSeq;
  seqByCid.set(cid, n);
  // Not unbounded: the kiosk client is known to accumulate every call it has ever
  // made in a page-session, and the phone sees the same ids.
  if (seqByCid.size > 40) seqByCid.delete(seqByCid.keys().next().value);
  debugLog(`#${n} call seen by=${call?.state?.createdBy?.id ?? '?'}`);
  return n;
}

// ─── Participant summaries ───────────────────────────────────────────────────

// What the SFU says this participant is publishing. Independent of whether we
// have subscribed to any of it — that distinction is the point of the whole strip.
function published(p) {
  return flags(p?.publishedTracks);
}

// What we actually hold a MediaStream for. `audioStream`/`videoStream` are only
// populated when the participant is publishing AND we are subscribed, so this is
// the receive side that the kiosk's view of us cannot show.
function subscribed(p) {
  return `${p?.audioStream ? 'a' : '-'}${p?.videoStream ? 'v' : '-'}`;
}

// readyState and muted, raw and named. A subscribed stream carrying a dead or
// muted track is a different bug from having no stream at all, and reads
// identically on the `sub=` flags above.
function trackDetail(stream, kind) {
  const track = kind === 'a' ? stream?.getAudioTracks?.()[0] : stream?.getVideoTracks?.()[0];
  if (!track) return '';
  return ` ${kind}[${track.readyState} muted=${track.muted}]`;
}

// Tracks the participant intends to publish but which are not producing media
// right now — receiver-side RTP stalls, SFU drops, a sender-side OS audio-session
// interruption. Orthogonal to publishedTracks, so a track can be in both.
function interrupted(p) {
  const tracks = p?.interruptedTracks ?? [];
  if (tracks.length === 0) return '';
  return ` int=${flags(tracks)}`;
}

// Just the flags — the part that genuinely changes state rather than flapping.
function shapeOf(p) {
  if (p?.isLocalParticipant) return `me pub=${published(p)}`;
  return `${p?.userId ?? '?'} pub=${published(p)} sub=${subscribed(p)}`;
}

function describe(p) {
  // No `sub=` for ourselves: we never subscribe to our own tracks, so it would read
  // `--` on every healthy call and invite exactly the misreading this file exists to
  // prevent. What matters locally is only what we publish — and the kiosk seeing our
  // video already proves the publish side works on the broken call.
  if (p?.isLocalParticipant) return `me pub=${published(p)}${interrupted(p)}`;
  return (
    `${p?.userId ?? '?'} pub=${published(p)} sub=${subscribed(p)}` +
    `${trackDetail(p?.audioStream, 'a')}${trackDetail(p?.videoStream, 'v')}` +
    `${interrupted(p)}`
  );
}

// ─── Tracing ─────────────────────────────────────────────────────────────────

const active = new Map(); // cid -> dispose fn

// A trace outlives the screen that started it, so it needs its own ceiling rather
// than an unmount to stop it. Long enough to cover a whole call.
const MAX_TRACE_MS = 180000;

// The strip holds a fixed number of lines and the join sequence sits above these,
// so a trace that chattered would silently destroy the evidence it was added to
// collect. `muted` on a remote audio receiver can flap on RTP stalls; six changes
// is already the whole story, and anything beyond that is churn.
// Changes are logged on the COARSE shape only — participant set and pub=/sub=
// flags — never on track detail. `muted` on a remote audio receiver flaps, and a
// cap that counts those emissions stops the trace within the first two seconds of
// the call. That is exactly what went wrong: the strip read
// `family-hub … sub=a- a[live muted=true] (last)` and I took it to mean the phone
// never subscribes to video, when the phone was visibly rendering the kiosk's
// video in the same photograph. The trace had simply stopped. Early churn must not
// be able to hide the settled state.
const MAX_SHAPE_LINES = 5;

// …and the settled state gets logged regardless, on a timer, whether or not
// anything "changed". This is the line that answers "does the kiosk's audio ever
// come off muted", which no change-triggered line can answer: if it never
// unmutes, nothing changes, so nothing is logged, and silence looks identical to
// not-being-watched.
const SETTLE_MARKS_MS = [6000, 15000];

/**
 * Watch a call's participants for as long as it lasts and write every CHANGE to
 * the debug strip.
 *
 * Subscribed directly, not from a React effect — see the note at the top. Started
 * at join time and disposed when the call leaves, so it keeps reporting across the
 * IncomingCallScreen -> ActiveCallScreen swap, which is precisely the window where
 * the second call goes wrong.
 *
 * Only changes are logged. The strip holds a handful of lines, and participants$
 * re-emits on every unrelated patch (speaking, audio level, connection quality);
 * logging each emission would push the join sequence off the top before it could
 * be read. A working call is then ~3 lines and a broken one is however many it
 * takes, which is itself the comparison being made.
 */
export function traceCall(call, label = '') {
  if (!call) return () => {};
  const cid = call.cid ?? call.id;
  // Never two traces on one call — a re-accept would otherwise double every line.
  active.get(cid)?.();

  const n = callSeq(call);
  const t0 = Date.now();
  const since = () => `+${Date.now() - t0}ms`;
  const tag = `#${n}${label ? ` ${label}` : ''}`;
  let last = null;
  let lines = 0;
  let latest = [];
  let disposed = false;

  const subs = [];
  const timers = [];
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    timers.forEach(clearTimeout);
    subs.forEach(s => {
      try { s?.unsubscribe?.(); } catch (e) { console.warn('[callTrace] unsubscribe failed:', e); }
    });
    active.delete(cid);
  };
  timers.push(setTimeout(dispose, MAX_TRACE_MS));
  // Unconditional snapshots of whatever the state is at these points.
  SETTLE_MARKS_MS.forEach(ms => {
    timers.push(
      setTimeout(() => {
        const remotes = latest.filter(p => !p.isLocalParticipant);
        debugLog(
          `${tag} settled ${since()} n=${latest.length} rem=${remotes.length}` +
            (latest.length ? ` | ${latest.map(describe).join(' | ')}` : ''),
        );
      }, ms),
    );
  });
  active.set(cid, dispose);

  try {
    subs.push(
      call.state.participants$.subscribe(participants => {
        latest = participants;
        const remotes = participants.filter(p => !p.isLocalParticipant);
        // Coarse shape: who is here and which tracks each publishes/we subscribe
        // to. Deliberately excludes readyState/muted/interrupted — those flap, and
        // letting them consume the budget is what truncated the last reading.
        const shape =
          `n=${participants.length} rem=${remotes.length}` +
          (participants.length ? ` | ${participants.map(shapeOf).join(' | ')}` : '');
        if (shape === last) return;
        last = shape;
        if (lines >= MAX_SHAPE_LINES) return;
        lines += 1;
        // Say when we stop changing-logging, so a capped trace can never be
        // mistaken for a call that simply went quiet. The settled snapshots keep
        // coming either way.
        const more = lines === MAX_SHAPE_LINES ? ' (shape cap)' : '';
        debugLog(`${tag} ${since()} ${shape}${more}`);
      }),
    );
    // Stop of our own accord when the call is over, so call 2's lines can never be
    // call 1's trace still running.
    //
    // NOT `idle`, at least not on its own. callingState$ is a BehaviorSubject, so
    // this fires synchronously with the CURRENT state — and traceCall is started
    // before join(), on a call that is routinely still `idle` at that point (a call
    // recovered by queryCalls after a cold start never saw the live `call.ring`
    // event that sets RINGING; IncomingCallScreen shows for IDLE for exactly that
    // reason). Disposing on `idle` would have torn the trace down on the very calls
    // it was written to observe, and left an empty strip that reads as "no
    // participants ever arrived". `left` is the unambiguous terminal state; `idle`
    // only counts once the call has actually been somewhere.
    let moved = false;
    subs.push(
      call.state.callingState$.subscribe(s => {
        if (s === 'left' || (s === 'idle' && moved)) dispose();
        else if (s !== 'idle') moved = true;
      }),
    );
  } catch (e) {
    // Not fatal — the call still runs, we just lose the receive-side picture. Say
    // so on the strip rather than leaving a gap that reads as "no participants".
    console.warn('[callTrace] subscribe failed:', e);
    debugLog(`#${n} trace FAILED: ${e?.message ?? e}`);
    dispose();
  }

  return dispose;
}

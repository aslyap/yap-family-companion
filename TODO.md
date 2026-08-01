# yap-family-companion — Session Handoff

## Session 30 progress — Gemini's 3 actionable Android fixes implemented (untested), iOS/Android installs handed to the user in parallel

Picked up session 29's handoff exactly as written (companion `f3dc793`, kiosk
`79796d5` — both confirmed matching, no drift). Two tracks run in parallel per
the user's choice: they install/test both builds on-device on their own
schedule; this session went straight to implementing Gemini's 4 Android
answers in code, since that needs no phone access.

**Android build `29b2244` (ring/join revert + full-screen-intent fix)
confirmed GREEN this session** — was still compiling at session 29's end
(`30681244746`), watched to completion here: succeeded in 31m17s. Both it and
the iOS build (`e88b9a2`, `30677422826`) were downloaded locally and their
GitHub Artifacts URLs handed to the user for on-device install.

**iOS `e88b9a2` live-tested by the user this session — 1 of 4 items
confirmed fixed, the other 3 confirmed not fixed, but one of those 3 turned
up a genuinely new, more precise finding, not just "still broken":**

- **Stuck full-screen call screen (backgrounded, kiosk ends call) — ✅
  CONFIRMED FIXED.** The highest-confidence fix of the three landed clean.
- **Kiosk-reject → "Missed call" banner (`dbb56ca`, also rated high
  confidence) — reported "not working," but the ACTUAL symptom is more
  specific than a repeat of the original bug.** Asked the user directly what
  they saw (per this project's own standing rule against assuming a table
  entry): **the banner stays "Yap Family calling" until the user swipes it,
  at which point it correctly shows "Missed call."** That is meaningfully
  different from the pre-fix symptom (which never corrected at all, even
  after interaction) — it means the Bark push `dbb56ca` sends almost
  certainly IS landing with the right content (the swipe reveals it), but
  iOS is not live-refreshing the visible text of a banner that's already
  on-screen and un-dismissed. Checked whether this is documented iOS
  behavior (WebSearch, 2026-08-01): found supporting-but-not-conclusive
  material — collapse-ID-based APNs replacement is documented to replace
  "immediately" for a *not-yet-displayed* notification, and nothing found
  addresses same-identifier replacement of a notification that is already
  rendered on-screen and undismissed specifically. This is consistent with
  (not proof of) session 29's own finding that this exact class of question
  is unanswered even on Apple's own developer forums. **Deployed code
  (`dbb56ca`) is very likely working correctly at the data layer; the
  remaining gap, if real, is an iOS rendering behavior outside this app's
  control, not a backend logic bug.** Not chasing further this session —
  no code lever identified, and this is now in the same "accepted platform
  limitation" category as symptoms 1 and the banner/ringtone desync unless
  further research turns up an actual API for it.
- **Banner-over-call-screen (`CLEAR_BANNER_ON_SUPPRESS`) and foreground
  duplicate (`RING_HOLD_MS` 1200→1800ms) — confirmed unchanged, no
  improvement from either experiment.** User confirmed both look identical
  to the pre-fix description, not a nuanced variant like the item above.
  Both were already flagged "genuinely unverified" going in, so this is a
  clean negative result, not a surprise. Per the original plan for both: no
  further fix is queued from guessing — would need fresh investigation.
  `CLEAR_BANNER_ON_SUPPRESS` is harmless even though it didn't help (passive
  push, shouldn't itself alert) so left deployed rather than reverted:
  reverting it gains nothing now that the swipe-reveal finding above
  suggests the live-refresh limitation is the same one it was trying to work
  around, i.e. it was very likely never going to be able to fix a category of
  problem that isn't really a stale-payload problem.

**Gemini's 4 Android answers, 3 implemented in `App.js` this session (NOT
built or tested yet — no Android build dispatched for these changes):**

1. **Symptom 1 (banner-only unlocked+backgrounded)** — closed per Gemini,
   confirmed intentional Android behaviour. No code change; nothing to do.
2. **Symptom 2 (reappearing call loop)** — implemented as a **reconciliation-
   side safety net**, not a patch to the SDK's own background reject path
   (that's closed-source Kotlin inside `@stream-io/video-react-native-sdk`,
   unreachable from this repo — confirmed no `node_modules` install exists
   locally to even inspect it further, consistent with session 29's own note
   that this lives partly in native code). Both `queryCalls` reconciliation
   sites in `App.js` (`StreamWrapper`'s cold-connect site and its AppState-
   resume site) now, after confirming a pending cid isn't in the live ringing
   set, look up any stale call object still held in `client.state.calls` for
   that cid and force `call.leave()` on it if it isn't already
   `LEFT`/`endedAt` — mirroring the exact fallback pattern already proven in
   `IncomingCallScreen.js`'s `decline()` catch block (`e88b9a2`, iOS, but
   that file is shared code with no platform gate). This does not touch
   whatever native Telecom gap Gemini described directly (can't, from JS) —
   it's a belt-and-suspenders local teardown for the case where the SDK's own
   background handling left a phantom call object lying around long enough
   for one of these two reconciliation checks to see it.
3. **Symptom 3 (foreground double-UI)** — implemented as the architecture
   change Gemini specified: `CallOverlay` now tracks `AppState.currentState`
   and, on Android only, skips rendering its own `IncomingCallScreen` while
   the app is foregrounded (`suppressJsRingScreen`), leaving the native
   heads-up banner as the only incoming-ring UI in that state. No separate
   "listen for native Accept" plumbing was added — tapping the banner's
   Accept already drives the SDK's `callingState` to `JOINING`/`JOINED` the
   same way a locked-screen accept does, and `CallOverlay`'s existing
   `active` filter already matches those states regardless of foreground
   state, so it transitions to `ActiveCallScreen` on its own. `showingCall`
   and the missed-call/`ringOutcomeRef` bookkeeping deliberately still key off
   `incomingRingCall`'s presence, not off whether it's rendered — suppressing
   the UI must not suppress missed-call detection for a call that rang out
   while foregrounded and ignored.
4. **Symptom 4 (~20s spin before Accept works)** — implemented exactly as
   specified: both `queryCalls` reconciliation sites now check
   `isAccepting(pendingCid)` (`src/acceptState.js`, the same
   `markAccepting`/`isAccepting` pattern already guarding double-`join()` in
   `IncomingCallScreen.js`) before clearing the pending-call cover, and skip
   clearing if an accept is genuinely in flight for that cid — mirroring
   `CallOverlay`'s own `incomingRingCall` filter, which already excludes
   accepting calls the same way.

**None of this is tested. No Android build has been dispatched for these
changes** — the corrected build already in the user's hands (`29b2244`) does
NOT contain them. Old standing rule 6/8 from sessions 26-28 ("do NOT dispatch
an Android build") is treated as superseded — session 29 itself dispatched
two Android builds once live Android testing became active, and this
session's kickoff explicitly asked for Gemini's fixes to be implemented. Not
re-dispatching a build automatically here though, since the user is mid-test
on the just-confirmed-working `29b2244` build — **ask before dispatching a
new Android build with these changes**, so a fresh install doesn't land while
they're still confirming the ring-sound/Accept/full-screen-intent regressions
are actually fixed on the current one.

**Next steps, in order:** (1) get the user's on-device results for both
platform installs already handed off; (2) once `29b2244`'s regression
re-tests are confirmed good, dispatch a new Android build with this
session's 3 changes and live-test symptoms 2/3/4 specifically (the
reappearing-call loop, the foreground double-UI, and the ~20s Accept spin);
(3) still waiting on a repro for the Oppo missed-call-handling report — ask,
don't guess, same standing rule as session 29.

## Session 29 progress — iOS mostly root-caused and fixed (build ready to install), Android deeply investigated with concrete Gemini-confirmed fixes queued, none implemented yet

Picked up the kickoff below (session 28, 2026-07-31). Ended at companion
`main` = `29b2244`, kiosk `main` = `e2f1b72`. Two full rounds of repro
gathered directly from the user (locked-phone symptoms, then a full
platform × phone-state matrix), plus one live test round on the Oppo and a
full Gemini research pass — nothing in this session was guessed from a
table alone. **Read the rest of this session's notes before session 28's
own log further down.**

**Where things actually stand, honestly:**
- **iOS**: 3 of 4 real bugs fixed with high confidence (backend ordering
  race, stuck-screen-on-reject-failure, resume/deep-link race), 1 backend
  timing experiment unverified. A build with all of it is ready
  (https://github.com/aslyap/yap-family-companion/actions/runs/30677422826)
  but **NOT YET INSTALLED on the spare iPhone or tested.**
- **Android**: one live test round already happened this session (build
  `7083d49`) — it caught a bad fix (`skipIncomingPushInForeground`) that
  broke ring sound and call-joining, which has been reverted, plus a real
  full-screen-intent-prompt bug that's now fixed. A corrected build
  (`30681244746`) is compiling as of this writing. **Separately, Gemini
  research came back with 4 concrete, mostly-actionable answers — see
  "Gemini's answer" section below — none of those fixes are implemented
  yet.** This is the most valuable unstarted work going into next session.
- **Do not treat any "Fixed" tag below as confirmed until it's actually
  been tested on-device** — this table already caught itself being wrong
  once this session (the full-screen-intent prompt was wrongly assumed
  "expected" until the user corrected it directly).

### Where things stand — quick status

Fixed/deployed items first, then the full issue table by platform × phone
state (2026-08-01 repro, gathered directly from the user, not guessed).

| Fixed this session | Status |
|---|---|
| Bark ring overrun (rang 15-20s after kiosk hangup) | ✅ Fixed, confirmed on-device, repeatedly (session 28) |
| Android placeholder-TTL stuck screen (~20s after reopening) | ✅ Fixed, confirmed on-device, repeatedly (session 28) |
| Backend: stray ring resend can overwrite a missed-call note | ✅ Fixed (`dbb56ca`), deployed Fly v62, NOT call-tested |
| Backend: EXPERIMENTAL clear-banner push on suppress | 🔶 Deployed (`d44b560`), Fly v63, UNVERIFIED, one-line revert available |
| Companion app (both platforms): AppState-vs-deep-link resume race | ✅ Fixed (`8cfe3ef`). User approved overriding standing rule 6 — rolled into both the iOS and Android builds. |
| iOS: stuck full-screen call screen after a lost reject()-vs-kiosk-hangup race | ✅ Fixed (`e88b9a2`), root-caused via the EXACT error text the user hit — see "iOS symptom: stuck screen" below. Rolled into the next iOS build (dispatched: https://github.com/aslyap/yap-family-companion/actions/runs/30677422826). |
| Backend: EXPERIMENTAL RING_HOLD_MS 1200→1800ms (more margin vs. foreground duplicate) | 🔶 Deployed (`e2f1b72`), UNVERIFIED, one-line revert available |
| Android: `skipIncomingPushInForeground` — banner+full-screen duplicate when foregrounded | ❌ REVERTED (`95de4c3`) — live-tested, caused worse regressions (no ring sound, Accept hangs). Symptom back to unfixed. See Android table below. |
| Android: setup-prompt IIFE (battery opt + full-screen-intent permission) had zero error handling, could silently skip the full-screen-intent prompt entirely | ✅ Fixed (`29b2244`), each step now try/catched + reported to debug strip, storage keys bumped to re-fire once. Rolled into build. NOT yet tested. |

#### iOS — by phone state (spare iPhone)

| Phone state | Symptom | Status | Plan |
|---|---|---|---|
| Locked | Sometimes opens to Bark's own Messages tab before the call screen | 🔶 Reopened — correlates with companion app's swipe state, not fully explained. See "iOS symptom 1". | **Nothing planned.** Real fix needs PushKit+CallKit ($99/yr Apple Dev account) — declined. Accepted as a permanent low-priority limitation; don't re-raise unless it gets worse. |
| Locked | Sometimes Bark banner sits on top of the just-opened call screen | 🔶 Two unverified fixes deployed, see "iOS symptom 2" | **Live-test on the next real call.** Both the backend clear-banner experiment and the resume-race fix are deployed — next unanswered/slow-answered call will show whether either helped. No further code queued unless that test is inconclusive. |
| Locked | Kiosk-reject leaves "Yap Family calling" banner instead of "Missed call" | 🔶 Fix deployed, NOT call-tested, see "iOS symptom 3" | **Live-test on the next real call.** Call the spare iPhone, let it ring, reject from the kiosk, confirm it shows "Missed call" and stays that way. High confidence this is actually fixed — just needs the test. |
| Unlocked, app in foreground | Sometimes BOTH Bark AND the Yap Family call screen open (should be just the call screen) | ❌ NEW 2026-08-01, not yet investigated | **Live-test the `RING_HOLD_MS` bump (1200→1800ms) on the next call.** If the duplicate still happens, no further fix is queued — would need fresh investigation, not a guess. |
| Unlocked, app in foreground | Ending call from kiosk | ✅ Works correctly, no issue | None needed. |
| Unlocked, app backgrounded | Only Bark notification shows (correct), but mistimed: banner disappears while the ringtone keeps playing (audio/visual desync). Working correctly = banner stays on screen in sync with the sound. | 🔶 Researched, strongly corroborated by Bark's own issue tracker (`Finb/Bark#256`) as a likely genuine iOS platform limitation with repeated/looping alerts — not something payload changes fix. No code change made. See write-up below. | **Nothing planned.** Treated as an accepted iOS/Bark platform limitation, not a bug in this app. Would only revisit if it starts happening on genuinely answered calls too, not just unanswered ones. |
| Unlocked, app backgrounded | Ending call from kiosk silences the ring, but the Bark banner remains, AND opening the app shows a STUCK full-screen call screen that cannot be ended — errors with Stream error 103: `"reject call failed with error: Cannot accept/reject a call that is not in progress, did you call call.join, call.ring or call.notify before?"` | ✅ FIXED (`e88b9a2`) — root cause: `IncomingCallScreen.js`'s `decline()` only cleared the busy spinner when `reject()` failed, never forcing local state to LEFT, so the screen stayed classified as an incoming ring forever. Now falls back to `call.leave()`. Rolled into next iOS build, NOT yet tested. | **Live-test on the next real call.** Reproduce the original scenario (kiosk ends call while phone is backgrounded), confirm the screen dismisses instead of getting stuck. High confidence. |
| — | iOS heartbeat/timing fixes generally | Superseded by the specific symptoms above — don't chase this as a separate item | N/A — folded into the rows above. |
| — | iOS missed-call handling | Superseded — this session's iOS work covers the actual reported symptoms above | N/A — folded into the rows above. |
| Any (post-connect) | Phone publishes video at an accidental 720p (should be up to 2160p per the call type's own target_resolution) | 📋 **PARKED, not touched this session.** Pre-existing finding from an earlier session: `IncomingCallScreen.js` (shared with Android) calls `call.camera.selectDirection('front')` with no width/height, and react-native-webrtc's constraint defaults silently cap it at 1280x720. Documented recommendation: set 1920x1080 explicitly rather than just removing the constraint — removing it outright risks overshooting to 4K and producing a slideshow if bitrate can't keep up (network ceiling has never been measured on a real call). User's call: park for a dedicated session with proper bitrate measurement, add to this list so it isn't dropped. | **Dedicated future session.** Set `target_resolution` to 1920x1080 explicitly in the kiosk's `settings_override`, then measure actual bitrate/framerate on a real call before/after — not a same-session drop-in change. |

#### Android — by phone state (Oppo Find N5)

**Live-tested 2026-08-01 against build `7083d49` (tag shown on the debug
strip). Results below fold in that test.**

| Phone state | Symptom | Status | Plan |
|---|---|---|---|
| Locked | Full-screen "Yap Family calling" comes up | ✅ Confirmed correct, live | None needed. |
| Locked | Ending call from kiosk | ✅ Confirmed works, live | None needed. |
| Locked | ~10s after kiosk ends the call, ANOTHER full-screen call comes up, repeatedly. Force-stop sometimes needed, not a manual button press. | ⚠️ Not fixed. **Gemini confirmed (2026-08-01) the `call.missed`-dashboard-push theory is very plausibly right, AND identified a concrete native-teardown gap** — see "Gemini's answer" write-up below. Not guesswork anymore. | **Concrete fix identified, not yet implemented:** find Android's reject/decline failure path (likely `processCallFromPushInBackground` or this app's own decline handler) and mirror the iOS fix already shipped (`e88b9a2`) — force a local teardown when the API-level reject/leave call fails, so the native Telecom `Connection` object always gets `setDisconnected()`+`destroy()` even when the server says the call's already over. Next session's top priority. |
| Unlocked, app not foreground | Only a banner shows (not full screen) | ✅ **CLOSED — confirmed intentional Android behavior, not a bug.** Gemini, quoting AOSP docs: "you are chasing a non-existent OS behavior... this is not a ColorOS restriction, a missing permission, or an OEM bug. It is working exactly as designed... even the native system dialer behaves this way." | **None. Stop tracking as an issue** — reclassify as expected behavior if this table is ever trimmed. |
| Unlocked, app in foreground | BOTH a banner AND the full-screen call show | ❌ **REVERTED (`95de4c3`).** The `skipIncomingPushInForeground` fix (`e767bc0`) was live-tested and caused three worse regressions in this exact scenario: no ringtone sound, and Accept doing nothing (see below — turned out to be the SAME root issue as the reappearing-call loop, not a separate bug). Reverted; this symptom is back to unfixed. | **Concrete architecture fix identified, not yet implemented.** Gemini: the banner and the ringtone/Telecom-registration notification are "the same entity" — can't suppress one without the other. Correct pattern: when foregrounded, let the native banner win and DON'T render this app's own JS full-screen ring UI at all; listen for the native "Accept" tap and transition straight to the active-call screen. This is a real design change to `CallOverlay`/`IncomingCallScreen` (`App.js`), not a one-liner — needs its own session. |
| Unlocked, app in foreground | No ringtone sound, full-screen UI shows silently | ✅ Root cause understood (caused by `skipIncomingPushInForeground` suppressing the notification channel that plays Android's ring sound) — fixed by reverting. Not yet re-tested. | **Re-test with the corrected build (this round).** Should just be back to normal now that the flag is reverted — confirm and close. |
| Unlocked, app in foreground | Accept does nothing, call hangs | ✅ Root cause understood (see "reappearing call" write-up below — this WAS the reappearing-call bug, just observed from the accept side: stuck on `IncomingCallPlaceholder`, no real call object behind it) — fixed by reverting `skipIncomingPushInForeground`. Not yet re-tested. | **Re-test with the corrected build.** If it recurs even after the revert, that's evidence it's NOT solely caused by that flag and ties into the still-unsolved reappearing-call mystery above — treat as a strong new clue, not a surprise. |
| Any (clean install) | Full-screen-intent permission prompt didn't appear at all, required a manual settings hunt to grant | ✅ FIXED (`29b2244`) — **correction: my first read ("expected, not a regression — AsyncStorage persists across reinstall") was WRONG, per the user directly, who confirmed this was a genuinely clean install.** Real bug found: the setup IIFE (battery-opt + full-screen-intent prompts) had NO error handling — any step throwing silently swallowed the rest, including this prompt, and a clean install is exactly the scenario most likely to hit a fresh-install edge case. Each step now try/catched and reported to the debug strip; storage keys bumped so this device gets re-prompted once. NOT yet tested. | **Re-test on next install/build.** Watch for the prompt reappearing; if it STILL doesn't, the debug strip should now show a `setup: ... prompt FAILED: <reason>` line — a real error message instead of silence, which is itself the diagnostic if this needs a second pass. |
| Any | Accept sometimes spins ~20s before working, second press connects | ⚠️ Not fixed, but **Gemini confirmed the race theory and gave a concrete fix pattern** — see write-up below. | **Concrete fix identified, not yet implemented:** the instant Accept is pressed, set a local join-in-flight lock for that `call_cid` (this app already has the pattern — `src/acceptState.js`'s `markAccepting`/`isAccepting`, used elsewhere to guard against a double `join()`) and make `App.js`'s `queryCalls`-based reconciliation (both the cold-connect site and the AppState-resume site) check `isAccepting(cid)` before clearing the pending-call cover — don't let a reconciliation false-negative undo an in-flight accept. |
| Any (post-connect) | Kiosk video sometimes doesn't show after the call connects | ❌ NEW 2026-08-01, logged per user request, not investigated | **Needs a repro before anything else** — how often does it happen, does it correlate with anything (cold vs. warm start, foreground vs. background accept, etc)? Not investigating further until there's something concrete to go on, per this project's own standing rule. |
| Any (post-connect) | Phone publishes video at an accidental 720p (should be up to 2160p) | 📋 **PARKED, not touched this session** — same shared-code issue as the iOS row above, see there for the full write-up. Applies identically to Android. | **Dedicated future session**, same plan as the iOS row — one code change, shared between platforms. |
| — | Oppo missed-call handling | ⚠️ Still no repro details gathered — deferred by user, get this before touching missed-call code specifically | **Waiting on the user** — ask what actually happens vs. expected on a missed call, same as was done for iOS earlier this session. Not guessing at this from the table alone. |

**Reappearing call loop — re-examined against the live debug-strip
screenshot from this test (2026-08-01), and NOT actually fixed, contrary
to first impression.** Timeline read directly off the strip: call `#3` was
genuinely accepted and joined (`accept: joined ok in 1654ms`), ended
normally (`returnHome`, `endCall ok`) at `50:26`. Then, with no user
action: `#4 call seen by=family-hub` at `50:41` (~15s later), itself torn
down within 4s (`50:45`, another `returnHome`/`endCall ok`) — meaning it
was never actually shown/accepted, just silently ended, exactly like a
phantom ring. A reconnect fired at `50:49`, then ANOTHER reconnect at
`50:58` (only 7s after the previous one finished connecting — two
reconnects in quick succession is itself new/odd). Then `#5 call seen by=
family-hub` at `51:00` (~19s after `#4`) — this is the one stuck on screen
in the screenshot, Accept/Decline visible, no user action logged yet. This
is the SAME ~10-20s-later-unprompted-reappearance pattern as before,
observed end-to-end in one continuous log, not inferred. **When the user
tried to Accept call `#5`, it hung — and the debug strip's green text was
missing from that screen, which only ever happens when
`IncomingCallPlaceholder` (the pre-call cover, deliberately visually
identical to the real `IncomingCallScreen` but with no debug strip and no
real call behind it — see `App.js`) is showing instead of the real call
screen.** That means call `#5` never actually had a proper call object
back it in `useCalls()` — Accept had nothing to act on, hence the hang.
This is a direct, load-bearing symptom of the SAME underlying bug, not a
separate one — and gives a genuinely new, sharp diagnostic angle: whatever
creates these phantom calls (`#4`, `#5`, ...) is doing so in a way that
sometimes leaves the JS layer's own call-recovery machinery unable to
actually resolve them into a real, joinable call object. The "two distinct
call_cid" mystery from earlier and this "stuck on placeholder" symptom are
very likely the same bug looked at from two different angles. Still
unsolved — the Gemini research prompt below already covers this; worth
adding this new "stuck on placeholder, unjoinable" angle to it if picked
up again.

**Clarified by the user, same test round: the "hang" was not permanent —
first Accept press spins for ~20s, then the spinner stops and the button
becomes tappable again, and a SECOND press connects successfully.** A
second debug-strip screenshot (different call, `#1` this time, `cid` tail
`865294`) shows: call seen at `54:25.613`, then `54:36.189 pending cid
5552865294 not in ringing calls on resume — clearing cover` — this is the
`queryCalls` reconciliation (added this session, see the AppState resume
fix) concluding the call ISN'T ringing and clearing the placeholder cover,
**even though the call genuinely was still ringing** (it joined
successfully 9 seconds later, at `54:45`–`54:46`). That reconciliation
firing a false positive is a real, newly-introduced-this-session
suspect for the ~20s delay: it's plausible the placeholder gets cleared
prematurely, the real `IncomingCallScreen` doesn't immediately take over
cleanly, and whatever the user's first tap actually hit doesn't resolve
into a real `accept()` call until ~20s later. NOT fully diagnosed — only
one `#1 accept: joining` line appears in this log (at `54:45.001`,
immediately followed by a clean join), so there's no direct evidence of a
first FAILED attempt, only the reconciliation's false-positive clear
sitting suspiciously in the middle of the ~20s gap. **Deliberately not
chasing this further blind right now** — the `skipIncomingPushInForeground`
episode is a fresh lesson in not shipping another guess before testing
what's already changed. Revisit with a clean test once the revert build
(`95de4c3`) is confirmed working.

**New item, same test round: kiosk video sometimes doesn't show after the
call connects.** Not yet investigated at all — logged here per the user's
request, not chased this session.

### iOS — three symptoms, gathered via direct Q&A (2026-08-01), not guessed from the table

User's own description of the iPhone behavior, locked phone, in order of what
they see:
1. Sometimes, tapping the Bark notification first shows Bark's own **Messages
   tab**, THEN the full-screen Yap Family call page. **Expected: go straight
   to the call page, always.**
2. Sometimes, the call page opens, but the **Bark banner sits on top of it**.
   **Expected: the banner should dismiss itself once the call page is up.**
3. Sometimes, rejecting the call from the **kiosk** ends the call, but the
   **"Yap Family calling" banner stays** on the phone instead of turning into
   "Missed call". **Expected: banner should clear/update the moment the
   kiosk rejects.**

Confirmed with the user this is **one bucket** — the same broken-ness as the
session 28 "iOS heartbeat/timing fixes still not fixed" report, not a
separate missed-call-specific issue. Two of the three are now explained by
reading `calendar_backend.py`'s ring worker and `streamVideo.js` together;
the third is outside this codebase.

**Symptom 3 (banner survives a kiosk reject) — CONFIRMED race, FIXED
(locally, untested).** `_ring_worker`'s tick decides "resend due?" under
`_rings_lock`, appends the payload to a local `due` list, then releases the
lock and does the actual `requests.post` to api.day.app *after*. If the kiosk
calls `/api/ring/stop` (on reject) in the gap between a tick committing to a
resend and that resend's HTTP call actually landing, the stale "Yap Family
calling" resend can arrive at Bark *after* the kiosk's own
`notifyCalleeMissed` push (same Bark `id`) — silently overwriting "Missed
call" back to "Yap Family calling", which then never gets corrected because
the worker has genuinely stopped by then. This matches "sometimes", not
"always" — it's a narrow window (bounded by the worker's 100ms tick and Bark
relay latency), not a guaranteed collision every time.

Fix: `calendar_backend.py` now tracks a `pending_sends` counter per call,
incremented in the SAME locked block as the decision to resend, decremented
after the send completes. `/api/ring/stop` sets `stopped=True` (blocking all
FUTURE resend decisions) and then blocks — up to 2s, generously past the
~300-600ms measured Bark relay latency — until `pending_sends` drains to 0.
Since no new resend can be decided once `stopped=True`, this is a real
guarantee, not a "probably fast enough": by the time `/api/ring/stop`'s HTTP
response reaches the kiosk, every resend this worker will EVER send for that
call has already landed, so `notifyCalleeMissed`, sent right after, is
guaranteed to be the last write to that Bark notification id. This also
benefits every other caller of `stopRing`/`stopBackendRing` for free (the
phone's own answer/decline paths), not just the kiosk-reject case.
**Committed (`dbb56ca` on `yap-family-home` main, pushed) and deployed
(Fly release v62, `flyctl status` shows `started`, `/docs` returns 200) — but
NOT tested live yet.** Test: call the spare iPhone from the kiosk, let it
ring, reject from the kiosk's red button, confirm "Missed call" shows and
stays (not "Yap Family calling"). It's daytime SGT, not quiet hours, so this
can be tested whenever convenient — no override needed, just do it.

**Symptom 2 (banner over the just-opened call screen) — root cause
CONFIRMED, same family of bug, fix NOT built.** This isn't the reject path —
it races the initial tap. `IncomingCallPlaceholder` starts sending heartbeats
the instant it mounts (essentially the instant the deep link is tapped), but
the worker only re-checks heartbeat freshness once per 100ms tick, and a
resend that a tick already committed to just before that first heartbeat
registers as fresh is, like symptom 3, already unstoppable — it lands as a
banner momentarily after the call screen has opened. The `pending_sends`
fix above does NOT close this window: there's no `/api/ring/stop` call at
tap-time to hang off of, and even if there were, blocking doesn't un-display
a banner that already rendered.

**Now built and deployed as an explicitly experimental, easily-reverted
change** (`CLEAR_BANNER_ON_SUPPRESS` in `calendar_backend.py`, defaults
`True`): the moment `_ring_worker` first sees fresh heartbeat evidence (the
phone's own screen confirmed up), it now also fires ONE same-id push
stripped of `level`/`sound`/`volume`/`call` (set to `passive`), trying to
overwrite whatever stray resend might have raced the tap. This is cheap —
the worker already holds the full payload in `r["payload"]` — but genuinely
**unverified**, not "probably fine": checked whether a same-id replacement
with a quieter level actually updates an on-screen critical-alert banner's
visible content vs. only updating Notification Center once the original is
manually dismissed — session 28's Gemini research already flagged this
exact class of question as iOS-version/timing-dependent, and a fresh check
of Apple's own Developer Forums (2026-08-01) found the identical question
asked outright with **zero replies, no Apple engineer answer** — this is
genuinely open even to Apple's own developer community, not just under-
documented.

**Because it's unverified, treat this literally as an experiment, not a
fix**: worst case if the hypothesis is wrong is one extra low-key push per
call that (per `passive`'s documented behavior) shouldn't alert or show a
banner on its own — but that's exactly the part that's unconfirmed, so
watch for it introducing a NEW artifact, not just failing to fix the old
one. `CLEAR_BANNER_ON_SUPPRESS = False` fully reverts without touching the
surrounding logic if it makes things worse. **Needs a real call test**
before trusting it either way.

**Symptom 1 (Bark's own Messages tab shows first) — REOPENED. Gemini's
Bark-source research below is still good background, but it does NOT
fully explain the live report and should not be treated as the final
word — see the new data point further down this section (correlates with
the COMPANION app's swipe state, which this research doesn't touch at
all).** Root cause per that research:
Bark's `didReceive response:` delegate calls `UIApplication.shared.open(url)`
itself — iOS has to launch Bark's own process to run that code at all. Warm
launch (Bark already in memory): near-instant, `open(url:)` fires before
Bark's UI finishes painting, no visible flash. Cold launch (Bark evicted,
plausible on an idle spare phone): iOS renders Bark's root tab (Messages
history) while initializing its process, THEN `didReceive` runs and hands
off — the 200-500ms flash is genuinely unavoidable app-switching overhead,
not a Bark bug. Confirmed NOT related to `level:'critical'` — Gemini's read
is that critical vs. active/time-sensitive notifications go through the
identical tap-handling path, no special acknowledgment requirement inside
Bark's UI. Confirmed no Bark app-level setting exists for this either.
Maintainer position on related Finb/Bark issues (#174, #305, #401): a
relayed notification cannot delegate its OS-level tap target to another
app — Bark's binary is what iOS launches, full stop.

**IF this research turns out to be the whole story, the only real fix is
architectural: PushKit VoIP push + CallKit in the companion app itself**,
which needs a paid Apple Developer account ($99/yr — project is currently on
a free cert via SideStore; `streamVideo.js` already noted this constraint).
The user was previously asked whether to pursue that and said no, given the
prior framing (intermittent, cold-launch-only) — **that framing is now in
question given the swipe-state correlation below, so don't re-raise the
$99/yr question again until the resume-race fix has actually been tested
and either does or doesn't change symptom 1.**

Further checked (2026-08-01) whether Bark's cold-launch frequency itself
could be reduced without CallKit — genuinely a dead end, not a guess:
Background App Refresh does NOT affect push notification handling at all
(confirmed via Apple's own community threads — "Apps that refresh because
they received a notification... are not controlled by background app
refresh settings"), so there is no setting, for Bark or otherwise, that
reduces how often iOS evicts its process between calls. iOS process eviction
itself has no public user-facing control (memory-pressure-driven, OS
internal).

**New data point, same session, changes the picture: live-tested by the
user swiping away (force-quitting) the COMPANION app specifically — Bark's
own state was not deliberately touched. Result: companion app swiped away →
no symptom 1. Companion app left running (just backgrounded, phone locked)
→ symptom 1 happens.** This is genuinely surprising and NOT fully explained
by anything above — Bark and the companion app are separate processes;
there's no direct code-level reason the companion app's swipe state should
control whether BARK's own UI flashes. Do not treat this as solved.

What WAS found while chasing this: reading `App.js`'s own resume handler
turned up a real, separate bug — an `AppState` "active" event and the
`Linking` "url" deep-link event race each other when the companion app
resumes from being merely backgrounded (not force-quit). If the AppState
event wins, the app wrongly concludes this is a stale, non-call resume and
tears down and rebuilds its entire Stream client connection — real,
measurable work on the phone's JS thread, mid-ring. Fixed (see below,
`resumeCover` / the 250ms grace window in the AppState listener).

**Speculative, not confirmed: this MIGHT be part of why swiping the
companion app away changes symptom 1's visibility** — even though it can't
touch Bark's own code, a companion app busy tearing down and rebuilding its
network client at the exact moment Bark is trying to hand off to it via
`openURL` could plausibly slow down how quickly the companion app actually
takes over the foreground, stretching out how long Bark's own transitional
screen stays visible. This is a hypothesis to test, not a claim to trust —
it does not fully explain the report either, since Bark showing ANY of its
own UI at all still requires Bark's tap-handling code to run first,
regardless of how fast the companion app subsequently takes over. **Next
step: build with the AppState race fix, retest the exact swiped/not-swiped
comparison, see if it changes.**

Original research prompt (for reference — already answered above, don't
re-run unless the situation changes):

> I'm using Bark (Finb/Bark, the open-source iOS push-notification relay app,
> https://github.com/Finb/Bark) to deliver incoming-call alerts for a home
> video-calling app. The push carries a `url` field
> (`yapfamily://call?cid=...`) meant to deep-link straight into my own app the
> instant the notification is tapped.
>
> **The problem:** tapping the delivered Bark notification sometimes opens
> Bark's OWN app first — landing on its Messages/history tab — and only THEN,
> a moment later, hands off to my app's `url`. Sometimes it goes straight to
> my app with no Bark UI visible at all. I want to know whether this is
> avoidable, not just why it happens.
>
> **Already confirmed, don't re-derive:**
> - The push payload already sets `url` correctly and does NOT set `action`
>   (Bark's docs: `action` only shows a popup when explicitly set to `'alert'`,
>   which this payload never does).
> - Checked Bark's full documented payload parameter list (title, subtitle,
>   body, markdown, device_key, device_keys, level, volume, badge, call,
>   autoCopy, copy, sound, icon, image, group, ciphertext, isArchive, ttl,
>   url, action, id, delete) — none of them are documented as controlling
>   whether a tap shows Bark's own UI before following `url`.
> - The push always uses `level: 'critical'` (a Critical Alert, to bypass
>   silent mode / Focus) — this field is a live suspect, not ruled out: I
>   have NOT confirmed whether critical alerts specifically are handled
>   differently on tap than ordinary/active-level notifications.
> - No `adb`/Mac/Xcode device console access to this iPhone during testing —
>   whatever the answer is, it has to come from Bark's own source/docs/issues,
>   not from me instrumenting the phone.
>
> **What I want:**
> 1. Look at Bark's actual iOS source (https://github.com/Finb/Bark) —
>    specifically how it implements `UNUserNotificationCenterDelegate`'s
>    `didReceive response:withCompletionHandler:` (or wherever it reads the
>    `url` field and calls `openURL`). Is there ANY conditional logic there —
>    on `level`, on whether the app was already running, on cold vs warm
>    launch, on notification category — that would explain sometimes showing
>    Bark's own root view before jumping to `url`, and sometimes not?
> 2. Search Finb/Bark's GitHub issues (open and closed) for reports matching
>    this behavior — notification tap opening Bark's own list/history before
>    (or instead of) following `url`. Quote the issue number and any
>    maintainer response if found.
> 3. Is there a Bark app-level SETTING (inside Bark's own Settings tab, not a
>    push payload field) that affects this — e.g. something like "open URL
>    directly" vs "show notification detail first"? If one exists, give the
>    EXACT setting name and location in Bark's current iOS UI — this has to be
>    handed to someone who's already been sent on failed settings hunts
>    elsewhere in this project, so it can't be a guess.
> 4. Is this specifically an iOS platform behavior for Critical Alerts (via
>    `UNNotificationInterruptionLevel.critical`) — i.e. does iOS require
>    critical alerts to be acknowledged inside their owning app before
>    honoring any follow-on `openURL`, in a way that doesn't apply to lower
>    interruption levels? If so, is there a Bark payload combination
>    (different `level`, plus something else to still guarantee the critical
>    bypass-silent-mode behavior) that avoids this?
> 5. Realistically: is this fixable via payload/settings at all, or is it
>    inherent to relaying pushes through a third-party app (Bark) rather than
>    using a real PushKit VoIP push + CallKit in the app itself? Be direct
>    about which of the above is confirmed from source/docs vs. speculative —
>    this project has already burned real time on a plausible-sounding
>    assumption before a live test disproved it, so don't paper over
>    uncertainty.

**First step next session (or later this one): get concrete repro details for
the Oppo missed-call report** — still nothing gathered, the user asked to
deal with iPhone first this session. Don't guess at a fix for it from the
table alone, same rule as before.

### Second round of repro (2026-08-01, same session) — full state matrix, both platforms

User ran through every phone-state combination and reported back while away
from the keyboard (went for a run — answered two clarifying questions first,
more below marked OPEN). Full symptom table is in the status table at the
top; this section is the investigation detail for the NEW items only.

**iOS — stuck full-screen call screen (unlocked, app backgrounded) — FIXED,
see status table above.** Root-caused precisely via the user's own copy of
the error text, not guessed. Worth restating the mechanism since it explains
BOTH the iOS symptom and is likely relevant to Android's reappearing-call
issue too (see below): Stream's server validates reject/leave calls against
its own authoritative call state, and when the kiosk ends a call moments
before the phone's own decline reaches the server, the server correctly
rejects the phone's reject() as invalid — the call already isn't "in
progress" from the server's point of view. That's not a bug in Stream's API,
it's an expected race in any push-based ringing system. The bug was entirely
in how this app handled that expected failure: `IncomingCallScreen.js`'s
`decline()` catch block only cleared the busy spinner, never forcing the
call's LOCAL state away from RINGING/IDLE — so `CallOverlay`'s
`incomingRingCall` filter (`App.js`) kept matching it forever, and every
retry failed identically since the server was correctly, consistently
right that the call was over. Fixed by falling back to `call.leave()` in
that catch block, which forces local state to LEFT regardless of the
server's opinion.

**iOS — Bark banner disappears while the ringtone keeps playing (unlocked,
app backgrounded) — NOT yet investigated in code.** User's own description
of correct behavior: "banner will stay on in sync with the noise." Current
behavior: "banner will disappear and ringing keeps going." Not yet chased
down. Two candidate directions, neither confirmed: (a) iOS may not
re-present a visual banner on every same-id critical-alert replacement even
though it re-plays the sound each time — i.e. the backend's `_ring_worker`
resend cadence could be correctly re-triggering audio on every `REPEAT_MS`
cycle while iOS only shows the banner UI once until manually dismissed, or
(b) something in the resend cadence math (REPEAT_MS=3600ms vs. the sound
file's real ~3.63s ring length, per session 28's own measurement) could be
producing exactly this kind of desync under conditions not tested in
session 28's live test. Researched further (2026-08-01): found a directly relevant, if unresolved,
data point — a Home Assistant Companion app community thread reports
`apns-collapse-id` (Apple's SERVER-side, APNs-level notification-merging
header) "doesn't work for critical messages... while it works for normal
ones." That specific mechanism is probably NOT what's in play here though:
Bark is a relay app that constructs its OWN local notification from the
push content client-side (matching the earlier confirmed research on
symptom 1 — Bark runs custom code on receipt), which more likely uses
`UNNotificationRequest`'s identifier-based replacement (a DEVICE-side
mechanism, already verified working for this project's actual `id` field
on 2026-07-26 per session 28's log) rather than the APNs-level
`apns-collapse-id` header — so the "doesn't work for critical" caveat may
not directly apply. Still couldn't find a definitive answer on whether a
device-level identifier-matched replacement re-presents a fresh banner
animation every time or just silently updates the existing entry while the
critical alert's sound plays regardless (sound and visual re-presentation
appear to be handled by separate iOS subsystems, per multiple hints across
several forum threads, none of them conclusive). Genuinely underdocumented
even in Apple's own developer community.

**Further research (2026-08-01): found direct, strongly corroborating
evidence on Bark's OWN issue tracker.** `Finb/Bark#256` ("重要警告与重复播放的
执行有点问题" — "critical alert + repeat playback has some execution
issues"): a user reported that with repeated/looping critical-style
alerting, "it actually only rings once, then only vibrates afterward, and
after multiple repeated runs, even the vibration may disappear." Bark's own
maintainer (Finb) confirmed this as a real, known limitation and said he'd
"improve the implementation logic" for combining critical alerts with
repeat playback. That report is about Bark's OLD `call=1` mechanism
specifically (not the same code path this project uses — session 28
replaced `call=1` with external same-id resends specifically because of
its own problems), but the OUTCOME described — components (sound,
vibration, and by extension plausibly the visual banner) unpredictably
dropping out of sync or disappearing across repeated alert cycles — matches
this project's live report closely enough to be strong corroborating
evidence that iOS itself is unreliable at sustaining ALL components of a
repeated/looping alert together over many cycles, independent of which
specific looping mechanism is used. This is now a genuinely sourced,
multi-report pattern, not a one-off. **Conclusion: very likely a real iOS
platform limitation, not something to keep chasing in this app's payload —
same category as symptom 1.** Also directly confirmed, from the Bark
maintainer himself (`Finb/Bark#285`): "Tapping a push notification will
always open the app" — no parameter prevents Bark's own app from being the
thing iOS launches on tap, reinforcing symptom 1's conclusion with a
primary-source quote rather than just inference.

**iOS — sometimes BOTH Bark AND the call screen open at once (unlocked, app
in foreground) — NOT yet investigated in code, but likely explained by
existing known timing margins.** When the app is already foregrounded, the
live Stream WebSocket should deliver `call.ring` directly and
`IncomingCallScreen` should mount and start heartbeating well within
`RING_HOLD_MS` (1200ms, the window the backend holds the Bark push before
firing it absent heartbeat evidence — see `calendar_backend.py`). This
symptom being intermittent rather than constant is consistent with that
1200ms margin sometimes not being enough even in the "easy" foregrounded
case — the round trip is WS-ring-event → React render → effect →
first heartbeat HTTP POST landing at the backend, which the existing
`RING_HOLD_MS` comment estimates at 101-120ms warm but doesn't budget for
render/effect latency on top. **Built and deployed as an experiment** (`e2f1b72` on `yap-family-home`,
Fly deploy confirmed healthy): `RING_HOLD_MS` bumped 1200→1800ms for more
margin — low risk (only delays how long a GENUINELY unanswered call takes
before Bark fires, by 600ms), easy one-line revert, but UNVERIFIED whether
it actually fixes this without a live test. Also affects the locked-phone
ring timing slightly (600ms later first ring for every call) — watch for
that being noticeable if retested.

**Android — the ~10s-later reappearing call, now confirmed session-blocking
(force-stop required, not just "decline it and move on") — investigated
deeply, one strong lead, NOT fully resolved.** Read a live debug-strip
screenshot the user sent mid-investigation. Two hard facts from it:

1. The debug strip's own call numbering (`callTrace.js`'s `callSeq`, keyed
   by CID, one line per DISTINCT cid ever seen this process) showed only
   `#1 call seen by=family-hub` — no `#2` — even though the user says this
   was captured after the screen had already come back a second time.
2. TWO DIFFERENT truncated cids appeared in `pending cid ... not in ringing
   calls on resume — clearing cover` lines (`...028544` and `...069613`).
   `pendingCid` here comes straight from the FCM push's own `call_cid` field
   (`index.js`'s `markCallPending(message.data?.call_cid)`), not from any
   locally-generated value — so these really are two distinct `call_cid`s
   the phone was told about by FCM, ~4 seconds apart around when the first
   call was marked missed.

That is genuinely surprising: it means either (a) the kiosk placed a second,
genuinely separate Stream call shortly after the first ended, or (b) FCM/the
push pipeline redelivered a stale message with different bookkeeping that
LOOKS like a different cid. Checked the kiosk's own call-placing code
(`App.jsx`'s `activeCall` state, `VideoCallOverlay.jsx`) for anything that
could cause an accidental second `startCall()` — found no retry/debounce
issue, the button handlers are plain and the effect is cleanly keyed on
`person`. **Confirmed by the user (2026-08-01): no further button presses on the
kiosk.** The screen came back on its own, ruling out a manual second call.

**Second new lead, checked and fixed regardless of confirmation
(2026-08-01, `7083d49`):** GetStream's own docs confirm `call.ring` and
`call.missed` are independently configurable push events on Stream's
dashboard. `index.js`'s `markCallPending(cid)` was firing unconditionally
for ANY Stream video FCM message (`isFirebaseStreamVideoMessage` only
checks `data.sender === 'stream.video'`, not the event type), while
`firebaseDataHandler` right next to it only does anything for
`type === 'call.ring'` internally — a real mismatch. If `call.missed`
pushes are also enabled on Stream's dashboard (unchecked — no dashboard
access this session), a `call.missed` push for the just-ended call would
carry its own cid and, unfiltered, re-raise the pending-call cover. Fixed
by gating `markCallPending` on `message.data?.type === 'call.ring'` to
match `firebaseDataHandler`'s own contract — correct regardless of whether
it's THE explanation for this specific mystery.

**Third lead, checked and ruled out: `yap-family-home/src/main.jsx`
wraps the app in `<React.StrictMode>`.** In a React DEVELOPMENT build,
StrictMode deliberately double-invokes mount effects (mount → cleanup →
mount again) specifically to surface exactly this class of bug — and
`VideoCallOverlay.jsx`'s call-placing effect is keyed on mount, calling
`startCall()` (which generates a brand-new `callId` from `Date.now()` every
invocation). A double-invoke would create two genuinely separate calls, the
first torn down almost immediately (which is consistent with a call being
marked "missed" within seconds — exactly what the debug strip showed) and
the second being the one that actually rings through — which would fully
explain two distinct `call_cid`s with zero additional button presses.
**RULED OUT (2026-08-01): checked directly on the Beelink itself.** The
`Yap-Kiosk-Edge` scheduled task (confirmed via `Get-ScheduledTask` /
`Get-ScheduledTask -TaskName "Yap-Kiosk-Edge" | ... .Actions`) launches:
`msedge.exe --start-fullscreen --app="https://yap-family-home.vercel.app"
--no-first-run --no-restore-session-state --profile-directory="Default"` —
genuinely the production Vercel URL, and `--no-restore-session-state` means
even a leftover dev tab from earlier debugging wouldn't survive a relaunch.
**StrictMode's double-invoke is not the explanation. The "two distinct
call_cid" mystery is open again.** Two threads worth pulling if picked back
up: (a) does Stream's own Video API resend/retry the `call.ring` FCM push
server-side for an unanswered call — analogous to `calendar_backend.py`'s
own Bark-resend logic, but on Stream's infrastructure, entirely outside
this repo — not yet checked; (b) the debug strip's OWN `00:36` pending-cid
clear happened just 4s after the client finished connecting, before call #1
was even seen at `01:09` — worth checking whether that was a leftover/
backlogged push from BEFORE this app process started, unrelated to the
actual call under test, which would mean only two cids (not three) are
really part of the same story. Neither pursued further this round —
deprioritized in favor of the foreground-duplicate and iOS banner-desync
research asked for by name.

Separately, read the actual SDK source (`@stream-io/video-react-native-sdk`,
`packages/react-native-sdk/src/utils/push/android.ts`'s `firebaseDataHandler`,
fetched from `GetStream/stream-video-js` on GitHub, not guessed) to
understand what happens when a `call.ring` FCM message arrives. Confirmed:
it calls `shouldCallBeClosed(callFromPush, data)` and, if true, calls
`callingx.endCallWithReason(...)` AND `callFromPush.leave({reject: false})`
— i.e. the SDK's own native call UI layer has its own leave/reject path,
separate from anything in this app's JS. No explicit de-duplication guard
against the SAME handler running twice for the same cid was found in this
function (only listener-accumulation is guarded via
`pushUnsubscriptionCallbacks`). This is SDK-internal behavior, not something
to patch in this repo — but it does mean the "why does the call UI
reappear" answer may live partly in `@stream-io/react-native-callingx`'s
native (Kotlin) side, which is not readable without cloning that package
separately (not done this session — time-boxed to the JS/TS layer that's
actually readable from here).

**Also relevant and NOT yet acted on: `App.js`'s AppState-vs-deep-link
resume race (fixed for iOS, see status table) is NOT platform-gated code —
the same buggy teardown-and-reconnect logic runs on Android too.** The
debug-strip screenshot's own later lines showed it firing: `05:03.892
resume: reconnecting after 51s bg` following a WS failure
(`connection:WS failed with code: 1006... Software caused connection
abort`). Whether this reconnect churn is a contributing cause of the
reappearing-call loop (by adding delay/instability right as a redundant
push arrives) or just an unrelated normal reconnect is unconfirmed. **The
fix for it already exists in the same commit as the iOS fix (`8cfe3ef`) —
it would take effect on Android automatically from the same codebase, but
per standing rule 6 ("do NOT dispatch an Android build"), no Android build
has been made. This needs an explicit decision from the user, not an
assumption either way.**

**Android — banner AND full-screen both show at once (unlocked, app in
foreground) — investigated via SDK source, one solid lead, not built.**
Read `internal/utils.ts` from the same `GetStream/stream-video-js` repo:
`canListenToWS = () => canAddPushWSSubscriptionsRef.current &&
AppState.currentState !== 'active'`, and `firebaseDataHandler` only
registers its native call-UI/foreground-service path when `canListenToWS()`
is true — i.e. **the SDK deliberately does NOT show its own native call UI
when the app is foregrounded.** So the extra "banner" the user sees is
almost certainly NOT this SDK mechanism firing twice — it's much more
likely plain Android platform behavior for `setFullScreenIntent()`
notifications: Android tends to degrade a full-screen-intent notification
to a heads-up banner instead of force-launching over an app that's already
in the foreground (well-established Android behavior, not specific to this
SDK), while this app's OWN JS layer (`useCalls()` picking up the live
WebSocket ring) independently renders its own full-screen `IncomingCallScreen`
at the same time — two separate, individually-correct code paths producing
a redundant pair of UIs specifically in the one state (foregrounded) where
Android's OS-level heuristic changes its mind about auto-launching.
**FIXED (2026-08-01, `e767bc0`), and confirmed with real citations, not
guessed:** Android's own official docs, verbatim: "While the user is using
the device, the system UI might display a heads-up notification instead of
launching your full-screen intent." That's the mechanism, confirmed.
Better still — the SDK itself has a documented option for exactly this
case: `push.android.skipIncomingPushInForeground` — *"incoming call push
notifications (call.ring) will not be displayed as a notification when the
app is in the foreground."* Checked it's wired through end-to-end in the
SDK's own source (`libs/callingx.ts` passes it straight to native
`setupAndroid()`), not a dead/unused type. Added to `index.js`'s
`setPushConfig` call. Low-risk even if the exact installed SDK version
predates this option — an unrecognized JS object key is silently ignored,
not an error. Rolled into the Android build. **NOT yet tested live.**

### Honesty check on "fixed" claims below

Session 28's own write-up (further down this file) calls several things
"fixed" based on live evidence gathered mid-session. Two of those hold up:
the original Bark ring-overrun bug (call kept ringing 15-20s after kiosk
hangup) and the Android placeholder-TTL stuck-screen bug both have direct,
repeated on-device confirmation via the debug strip and are reasonably
trustworthy. **Everything else should be treated as "built and deployed,
NOT independently confirmed working" until re-tested.** The iOS
timing/heartbeat fixes this warned about are the ones root-caused above in
session 29 — don't assume "I pushed a fix for X" means X is actually fixed
even now; symptom 3's fix specifically still needs a live test.

### Android — Telecom investigation, not more settings-hunting

Two Android issues are still open, both native-level and NOT fixable by
guessing through phone settings menus — two blind attempts at that in
session 28 wasted real time and frustrated the user badly. Read the standing
rule below before suggesting any settings screen.

1. **Full-screen call UI works when phone is locked, but only a banner shows
   when unlocked + app backgrounded.** Confirmed NOT a missing permission
   (all relevant ones — `MANAGE_OWN_CALLS`, `FOREGROUND_SERVICE_PHONE_CALL`,
   `USE_FULL_SCREEN_INTENT` — are present and, where checkable, enabled).
   The app already uses Android's real Telecom/`ConnectionService`
   registration (`TelecomCallRepository`, confirmed from
   `@stream-io/video-react-native-sdk` source), not a plain-notification
   fallback, so this isn't the generic "that's just how Android
   notifications work" explanation.
2. **The call screen/notification can reappear ~10s after it already closed,
   with zero corresponding app-level log lines** — points to a native
   Telecom call registration not being torn down, possibly linked to an
   observed race where the phone's own background-decline attempt
   (`processCallFromPushInBackground` inside the SDK) failed with a Stream
   error because the kiosk had already ended the call server-side moments
   earlier. **Session 29 update: confirmed this REPEATS (not a one-off) and
   that declining/ending the reappeared screen does NOT reliably stop it —
   force-stopping the whole app is what's needed, confirmed by the user. Also
   confirmed NOT caused by a second manual button press on the kiosk — the
   user explicitly ruled that out.** Read the actual SDK source
   (`@stream-io/video-react-native-sdk`'s `firebaseDataHandler`,
   `packages/react-native-sdk/src/utils/push/android.ts` and
   `internal/utils.ts` on `GetStream/stream-video-js`, fetched from GitHub,
   not guessed): confirmed the JS layer's `firebaseDataHandler` has no
   explicit de-duplication against being invoked twice for the same
   `call_cid`, but a debug-strip screenshot showed TWO GENUINELY DIFFERENT
   truncated `call_cid`s arriving ~4s apart with no second button press —
   meaning something created (or FCM delivered a ring for) a second,
   distinct Stream call, not just a duplicate delivery of the same one. Live
   suspicion, unconfirmed: the kiosk's `main.jsx` wraps the app in
   `<React.StrictMode>`, which double-invokes mount effects in a DEV React
   build (would create exactly two distinct calls with zero extra button
   presses) — but this project's own notes say the kiosk runs a PRODUCTION
   Vercel build, where StrictMode's double-invoke should not fire. Whether
   the physical kiosk browser might be pointed at a dev server instead is
   unconfirmed and worth asking about directly rather than researching
   further.
3. **NEW, session 29: when the app is in the foreground, BOTH a banner AND
   the full-screen call UI show at once (should be just full-screen).**
   Read the SDK source for this too: `canListenToWS()` (`internal/utils.ts`)
   gates the SDK's native-call-UI registration on `AppState.currentState !==
   'active'` — i.e. the SDK deliberately does NOT show its own native call
   UI when the app is foregrounded. So the extra banner is likely NOT this
   SDK mechanism double-firing; it's more likely plain Android platform
   behavior for `setFullScreenIntent()` notifications degrading to a
   heads-up banner instead of auto-launching full-screen when the target
   app is already in the foreground, while this app's own JS layer
   independently renders its own full-screen ring screen via the live
   WebSocket — two individually-correct paths colliding specifically in
   this one state.

All three need real investigation, not another guess. No `adb`/`logcat` on this
phone — it's deliberately disabled (banking apps flag root/adb detection),
so any diagnosis path has to work without it. A ready-to-use research
prompt (for Gemini or similar), written specifically for an Oppo Find N5
running ColorOS, is below — use it as-is rather than re-deriving the
question from scratch:

> I'm debugging a React Native (Expo) app that receives incoming video calls
> on Android via `@stream-io/video-react-native-sdk` (v1.37+), which under
> the hood registers calls through Android's real Telecom framework
> (`ConnectionService`, self-managed, via `TelecomManager`/`PhoneAccount` —
> confirmed from the SDK's own source, not a plain-notification fallback;
> `LegacyCallRepository` only applies below API 26, and this device is far
> above that).
>
> **Target device: Oppo Find N5 (foldable), running ColorOS, Android 15
> (targetSdkVersion 35 in the build).** Focus specifically on ColorOS —
> generic AOSP/Telecom docs are not what's needed, only what's DIFFERENT
> about ColorOS specifically.
>
> **Already confirmed, don't re-derive:**
> - The app's manifest (merged from the SDK's own library manifest) already
>   declares `MANAGE_OWN_CALLS`, `FOREGROUND_SERVICE_PHONE_CALL`,
>   `FOREGROUND_SERVICE_CAMERA`, `FOREGROUND_SERVICE_MICROPHONE`, and
>   `USE_FULL_SCREEN_INTENT`.
> - On-device, in Android's stock Settings → Apps → Special app access:
>   "Send full-screen notifications" is ON for this app, "Display pop-ups
>   while in background" is ON, "Turn screen on" doesn't list this app as an
>   option (unclear if relevant).
> - No `adb`/`logcat` access on this device (deliberately disabled).
> - The SDK exposes `push.android.skipIncomingPushInForeground` — a
>   documented option to suppress the SDK's own `call.ring` notification
>   entirely while the app is foregrounded. **Already tried and reverted**:
>   setting it to `true` DID stop the duplicate banner, but broke two other
>   things in the exact same scenario — the ringtone sound disappeared
>   entirely (Android plays the ring FROM the notification channel itself,
>   which this flag suppresses), and `Accept` sometimes did nothing at all
>   (see symptom 4 below — turned out to leave the JS layer stuck showing a
>   pre-call placeholder with no real joinable call object behind it). Don't
>   suggest re-enabling this flag as a solution; the question that matters
>   now is WHY suppressing that one notification also breaks ring audio and
>   call registration, since those look like they shouldn't be coupled.
>
> **Symptom 1 — full-screen call UI works locked, only a banner shows
> unlocked+backgrounded.** A properly registered self-managed
> ConnectionService call should interrupt to full-screen regardless of lock
> state, like a real phone call — so this reads as Telecom registration
> either not happening, or not being honored with full call treatment, on
> this device specifically while unlocked.
>
> **Symptom 2 — the call screen/notification can reappear ~10-20s after it
> already closed, with zero corresponding app-level log lines, and REPEATS —
> confirmed multiple times in one continuous debug-strip log, and confirmed
> that declining/ending the reappeared screen does NOT reliably stop it;
> force-stopping the whole app is what actually works.** Sequence observed
> directly (not inferred): call `#3` genuinely joined and ended normally;
> ~15s later call `#4` appeared with no user action, was itself torn down
> within 4s (never actually shown/accepted — like a phantom ring); ~19s
> after that, call `#5` appeared, and this one got STUCK on screen. One
> observed possible cause for the reappearance itself: the phone's own
> background-decline handler (`processCallFromPushInBackground` inside the
> SDK) independently tried to reject a call a moment after the caller had
> already ended it server-side, and that redundant reject failed with an
> error — suspicion is that failure may leave the native registration
> un-torn-down, unconfirmed without logcat. Confirmed NOT caused by a second
> manual call button press on the calling side. **New angle, session 29:**
> checked `firebaseDataHandler`'s JS source directly (GetStream's own repo)
> — it has no de-duplication against being invoked twice for the same
> `call_cid`, but more importantly, a debug-strip screenshot showed TWO
> GENUINELY DIFFERENT truncated `call_cid` values arriving ~4s apart, meaning
> this is not just a duplicate delivery of one ring — something is
> generating (or delivering a ring push for) a second, distinct Stream call
> object. Also worth checking outside this SDK entirely: GetStream's own
> Video API docs say `call.ring` and `call.missed` push notifications are
> independently configurable on Stream's dashboard — if `call.missed` is
> ALSO enabled, a missed-call push for the just-ended call could plausibly
> be misread by this app's own JS as a new incoming ring (this app's own
> handling of that has since been tightened to only react to
> `type === 'call.ring'`, but the dashboard-level "is call.missed even
> configured to push" question is still open and this session had no way to
> check the Stream dashboard directly).
>
> **Symptom 3 — when the app is in the foreground (unlocked, actively being
> used), BOTH a heads-up banner AND the app's own full-screen incoming-call
> UI show at the same time; only the full-screen UI should show.** Checked
> the SDK's own JS source: its native call-UI registration is explicitly
> gated on `AppState.currentState !== 'active'` (i.e. it deliberately does
> nothing when foregrounded), so this is NOT the SDK's own call UI
> double-firing. Current best-supported explanation, backed by Android's own
> official docs (verbatim: "While the user is using the device, the system
> UI might display a heads-up notification instead of launching your
> full-screen intent"): Android itself degrades the SDK's
> `setFullScreenIntent()` notification to a heads-up banner because the
> target app is already foregrounded, while this app's own JS layer
> independently renders its own full-screen ring screen via the live
> WebSocket — two individually-correct paths colliding in this one state.
> The obvious SDK-level fix (`skipIncomingPushInForeground`, see above) was
> tried and reverted because it broke ring sound and call joining — so this
> needs a fix that removes ONLY the redundant visual banner without
> suppressing the notification (and whatever native call-registration side
> effects come with it) altogether.
>
> **Symptom 4 (NEW) — Accept sometimes spins for ~20 seconds doing nothing,
> then stops, and a SECOND press connects successfully.** One debug-strip
> screenshot shows a call seen at `T`, then 11 seconds later a reconciliation
> check logs `pending cid ... not in ringing calls on resume — clearing
> cover` — concluding the call ISN'T ringing anymore — even though that same
> call joined successfully 9 seconds after THAT. So the app-level "is this
> call still valid" check produced a false positive, clearing the pre-call
> placeholder cover for a call that was genuinely still ringing. Only one
> real `accept: joining` log line appears in the strip (right before the
> successful join), so there's no direct proof of a first failed join
> attempt — the leading theory is that the user's first tap lands on a
> stale/cleared placeholder state and does nothing, and the SECOND tap is
> the one that actually reaches a real, working call object. Not deeply
> investigated this session — flagging as likely related to symptom 2's
> "stuck on a placeholder with no real call behind it" pattern, not
> necessarily a fully separate bug.
>
> **What I want:**
> 1. What does ColorOS require beyond stock Android for a third-party
>    self-managed ConnectionService/PhoneAccount to get full native call
>    treatment (full-screen, works unlocked)? Is there a ColorOS-specific
>    permission, OEM allowlist, or "trusted calling app" step outside stock
>    AOSP Telecom? Be specific about WHERE on a ColorOS 15 device (exact app
>    name if not in stock Settings, exact menu path) — this needs to be
>    relayed to someone already sent on two failed blind settings hunts
>    before, so it can't be a third guess.
> 2. Is self-managed PhoneAccount registration known to behave differently
>    on ColorOS regarding full-screen presentation unlocked vs. locked? Any
>    known ColorOS bugs/changes (XDA, Oppo dev docs, GitHub issues against
>    calling SDKs like this one, Twilio's, Agora's, mentioning ColorOS)?
> 3. For symptom 2: what's the correct way to GUARANTEE a self-managed
>    ConnectionService registration is torn down even when the app's own
>    leave()/reject call fails or races against the caller having already
>    ended the call server-side? Is there a force-disconnect/force-unregister
>    API that should be used as a fallback, and is this a gap in
>    `@stream-io/react-native-callingx`'s own handling of that failure path?
> 4. Realistically: how much of this is "find the right ColorOS toggle" vs.
>    "needs proper native Android development"? Want an honest read on
>    whether this is a configuration gap or an SDK/app integration gap.
> 5. For symptom 3: given `skipIncomingPushInForeground` is out (broke sound
>    + join), is there a documented, correct way for the app to detect "I am
>    already showing this call myself" and cancel/dismiss JUST the visual
>    banner presentation of the underlying system notification — without
>    cancelling the notification object itself, which seems to be what's
>    also carrying the ring sound and/or native call registration? A
>    specific `NotificationManager` call, a `react-native-callingx` API that
>    isn't being used, or is this simply not separable on stock
>    Android/ColorOS?
> 6. For symptom 4: is there a known race in the SDK (or in how apps
>    typically use `queryCalls`/ringing-state reconciliation) where checking
>    "is this call still ringing" shortly after a call starts can produce a
>    false negative for a call that's genuinely still ringing? If so what's
>    the documented-correct way to avoid it (e.g. a minimum age before
>    trusting a negative reconciliation result, or a different API to check
>    against)?
> 7. Independent of the SDK/ColorOS: is there anything in GetStream's own
>    Video API server-side behavior (ring timeout, retry, or `call.missed`
>    push delivery) that could cause a SECOND, genuinely distinct
>    `call.ring` push to be sent for what was really just one call attempt?
>    Docs confirm `call.ring` and `call.missed` push notifications are
>    independently configurable — if this project's Stream dashboard has
>    `call.missed` pushes enabled too, could that explain symptom 2's "two
>    distinct call_cid" observation, given this app's own `call.ring`-type
>    filtering was only added this session and wasn't in place during the
>    test that produced that evidence?
>
> Be direct about documented/verifiable vs. speculative — this project has
> already been burned once by a plausible-sounding wrong assumption that
> cost real debugging time before a live device test disproved it.

### Gemini's answer to the prompt above (2026-08-01) — concrete, not run against yet

Run in parallel with the corrected Android build. Read carefully before the
next session touches Android code — this replaces guessing with four
specific, actionable fixes. **None of these are implemented or tested yet.**

**Symptom 1 (full-screen vs. banner unlocked) — CLOSED, working as
designed.** Gemini's direct answer: "You are chasing a non-existent OS
behavior... this is not a ColorOS restriction, a missing permission, or an
OEM bug. It is working exactly as designed by Android. There is no toggle
to find." A self-managed ConnectionService call is NOT supposed to hijack
the screen while the device is unlocked and in active use — even the
native system dialer behaves this way. **Stop treating this as a bug.**
Remove it from the "open issues" framing; if it's tracked at all, track it
as "confirmed intentional Android behavior," not a defect.

**Symptom 2 (reappearing calls, multiple call_cids) — confirmed the
`call.missed`-dashboard-push theory, AND gives a concrete native-teardown
fix.** Gemini: "Your suspicion is correct... if your app previously passed
native push payloads to the SDK without strictly checking for
`type === 'call.ring'`, the SDK would interpret the missed-call push as a
new incoming call trigger" — validates this session's `index.js` fix
(`7083d49`) restricting `markCallPending` to `call.ring` only; that fix
should already help. Separately, a genuine gap: when the background reject
handler's API call fails (call already ended server-side, exactly the
Stream-error-103 class of failure seen on iOS), Android's native
`Connection` object needs `setDisconnected()` + `destroy()` called on it to
actually leave Telecom's system UI — **if the JS-level `reject()`/`leave()`
promise throws and halts execution before reaching native teardown, the
Connection stays alive as a phantom call in `TelecomManager`.** This is the
Android-side mirror of the exact iOS bug already fixed this session
(`e88b9a2` — `decline()`'s catch block now force-calls `call.leave()`
instead of just clearing the busy spinner). **Concrete next step:** find
Android's equivalent reject/decline failure path (likely in
`processCallFromPushInBackground` or wherever this app's own Android
decline flow lives) and apply the same pattern — wrap in try/catch, and on
API failure, explicitly force a local teardown so the native module tears
down the Telecom connection regardless of what the server says.

**Symptom 3 (double-UI collision, foreground) — architecture correction:
suppress the JS UI, not the native banner.** Gemini: "You cannot cleanly
separate the visual heads-up banner from the notification object that
carries your ringtone and Telecom registration. They are the same entity"
— confirms why `skipIncomingPushInForeground` broke sound+join: it wasn't
just hiding a banner, it was tearing down the same object the ringtone and
call registration depend on. **The correct pattern, per Gemini: when the
app is foregrounded, let the native heads-up banner win, and DON'T render
this app's own JS full-screen incoming-call UI — the opposite of the
current design, which always renders the JS ring screen off the live
WebSocket regardless of foreground state.** Concretely: listen for the
native "Accept" tap event (from the banner) and transition straight into
the active-call screen on that signal, rather than showing a competing
full-screen ring UI at all while foregrounded. This is a real design
change to `CallOverlay`/`IncomingCallScreen` (App.js), not a one-line fix —
needs its own careful implementation, probably gated on
`AppState.currentState === 'active'` to decide whether to render the ring
screen at all.

**Symptom 4 (false negative on Accept, ~20s delay) — confirmed race,
concrete fix.** Gemini: "a standard state-reconciliation race condition...
WebSocket updates can cause the call to momentarily drop from the SDK's
ringing array before the join is finalized... your UI reacts to this brief
absence by assuming the call is dead." Fix pattern given: the instant
Accept is pressed, set a local UI lock for that `call_cid` (e.g.
`isJoiningCall`), disable the button, and **ignore the SDK's ringing-array
absence / any reconciliation-driven clear for that cid while the lock is
active** — only release the lock on an explicit join rejection or a
definitive `call.ended` event. This app already has a very similar pattern
for iOS (`src/acceptState.js`'s `markAccepting`/`isAccepting`,
already used to guard against a double `join()` in `IncomingCallScreen.js`)
— the concrete next step is making the `queryCalls`-based reconciliation in
`App.js` (both the cold-connect site and the AppState-resume site) check
`isAccepting(cid)` before clearing the pending-call cover, the same way
`CallOverlay`'s `incomingRingCall` filter already does.

### Standing rule — read before session 28's rules below

7. **Do NOT send the user hunting through phone settings menus based on a
   guess.** Two attempts at this in session 28 (a generic Android
   permissions screen, then a guessed Special-App-Access category) both sent
   the user through several menu layers to find nothing useful, and cost
   real goodwill. If a settings check is genuinely needed, either look up
   the EXACT menu path for the EXACT device/OS version first (as was
   eventually done for ColorOS via web research), or ask for a screenshot of
   where the user already is rather than naming a menu that may not exist.

## Session 28 — original log (fix the Bark ring overrun PROPERLY, Fly backend work)

Session 27e (2026-07-30/31, on the Beelink) closed out the iPhone call tests
and fixed three kiosk display/startup bugs (see "Session 27e outcomes" below
and `yap-family-home`'s own TODO.md). **One thing remains, decided but not
built: the Bark ring overrun fix, chosen deliberately over two lighter
options — read "Test 3" below in full before starting, don't re-derive it.**

### The state you're picking up

- Companion `main` = `9969fe2`. Kiosk (`yap-family-home`) `main` = `8e83d8a`.
  Kiosk `yap-kiosk-setup` (Beelink OS scripts, separate repo) `main` =
  `f76011f`. `git pull` all three before doing anything — this project's repos
  drift between sessions.
- **A custom Bark sound already exists and is already uploaded** to the spare
  iPhone: `iphone_x_ring_cycle.caf` (5.0s, one ring+pause cycle, in
  `yap-family-companion/assets/`), shows in Bark as `iphone_x_ring_cycle`.
  Don't remake it.
- **Windows Smart App Control was permanently disabled on the Beelink**
  tonight (user's informed decision, one-way without a Windows reinstall) —
  this is why `ffmpeg`/`choco` now work there where they didn't before. Not
  relevant to this backend work, but don't be surprised by it.

### The actual task

The kiosk's `streamVideo.js` sends the initial Bark ring via
`POST ${BACKEND}/api/ring/start`, and the **Fly backend**
(`calendar_backend.py` — not in this repo, not checked out anywhere on the
Beelink, you'll need to find/clone it) holds that push for ~1200ms and
decides — based on the phone's own heartbeats — whether to actually fire it
or suppress it (when the callee's app is already foregrounded and showing its
own ring screen). That decision happens **asynchronously, after** the HTTP
response already returned to the kiosk. The kiosk currently has no way to
know the outcome.

**Why that matters here:** the overrun fix requires replacing Bark's
`call: '1'` (fixed 30s loop, no remote-stop — confirmed via Bark's own docs
and cross-checked with Gemini, see Test 3 below) with a *repeated short push*
every ~5s using `iphone_x_ring_cycle`, for as long as the call is genuinely
still ringing. But only the backend knows whether it's genuinely still
ringing (vs. suppressed). A kiosk-only repeat loop would ring even when the
backend correctly suppressed the original push — a version of the exact
duplicate-ring bug Test 1 exists to catch.

**Do this properly (Option 2, chosen over a kiosk-only compromise or leaving
it alone):** extend the Fly backend so the repeat logic lives where the
suppression decision already lives, or so it reports the outcome back to the
kiosk in a way the kiosk can act on (a poll endpoint, a webhook, whatever fits
the existing `/api/ring/start` + `/api/ring/stop` design). Read
`calendar_backend.py`'s existing hold/suppress logic first — don't guess at
its shape.

### Standing rules — read before touching anything, cost sessions 20-27

1. **QUIET HOURS 21:00–07:00 SGT block every outgoing call test. No override.**
2. **ASK WHICH MACHINE A CONSOLE IS ON** before trusting it as kiosk evidence.
3. **One artifact from each side of the SAME call, or it isn't evidence.**
4. **Read the SDK/backend source before theorising.**
5. **One instruction at a time** when a step needs the physical phone/kiosk.
6. **Do NOT strip the debug code. Do NOT dispatch an Android build.**

### Session 28 outcomes (2026-07-31, on the Beelink, ~12:50 SGT — daytime, not blocked by quiet hours)

**Correction to the kickoff note above: `calendar_backend.py` was already
checked out.** It lives inside the `yap-family-home` repo itself (a monorepo —
`fly.toml`/`Dockerfile`/`Procfile` sit right next to the Vite kiosk frontend),
not a separate repo. No cloning was needed; found it with a filesystem search
in ~2 minutes. Worth knowing for future sessions so this isn't re-searched.

**Built and deployed Option 2 as decided** — the repeat logic lives entirely
in the backend's existing ring coordinator, not the kiosk:

- `calendar_backend.py`: the ring worker (`_ring_worker`) no longer sends the
  held push once and stops. Once it has positive evidence a call is genuinely
  still ringing (the existing suppression check, unchanged), it now **resends
  the same payload every `REPEAT_MS` (5000ms)** — same Bark `id`, so each
  resend replaces the previous notification in place, reusing the exact
  recall mechanism already proven for `notifyCalleeMissed`. `ring_stop`
  (`stopped=True`) is checked every 100ms tick, so the worst-case tail after a
  kiosk hangup is now whatever's left of one 5s cycle, not up to 30s.
  `RING_TTL_S` bumped 45→65s so the repeat outlasts Stream's own ≥60s ring
  timeout instead of cutting off early — **this number is an assumption, not
  verified against the actual Stream dashboard config**, worth confirming if
  a real long-unanswered call still goes silent early.
- `streamVideo.js`: the Bark payload no longer sends `call:'1'`; it plays
  `iphone_x_ring_cycle` once per push and lets the backend repeat it. Also
  added a client-side repeat in the pre-existing "backend hold unreachable"
  fallback path (`sendBarkDirectRepeating`) — that path has no ring worker to
  repeat anything, so without this it would have quietly regressed from a 30s
  ring to a single 5s cycle whenever the backend hold itself is down.
- Commit `48c58b5` on `yap-family-home` main, pushed (Vercel auto-deployed the
  kiosk frontend). Backend deployed separately via `flyctl deploy` — **first
  attempt (v59) came back `failed`** in `flyctl releases` on an `unauthorized`
  error from Fly's own post-deploy smoke-check API call, even though the
  machine had actually taken the new image and was serving fine (`/docs` gave
  200) — looked like a transient Fly platform hiccup, not a problem with the
  image. Redeployed immediately; **v60 is `complete`**. If a deploy ever shows
  `failed` in `flyctl releases` again, check `flyctl status` for the image tag
  and hit a live endpoint before assuming the code didn't ship — it may have,
  and redeploying to clear the failed release is cheap either way.

**Live call test run — ✅ core fix confirmed, two follow-on findings.**
Two calls placed kiosk→spare iPhone (confirmed on the Beelink), left
untouched ~8s, hung up from the kiosk red button. Confirmed via matching Fly
logs (`family-hub-kath-1785475926532` and `…966433`): repeated resends do
re-trigger the critical-alert sound each time (not treated as a silent
update), and `ring_stop` cuts the repeat off within one 100ms worker tick —
**the overrun is fixed**, worst case now one file-length, not up to 30s.

1. **Gap between rings too long — root-caused and FIXED.** `REPEAT_MS` was
   5000ms to match `iphone_x_ring_cycle.caf`'s full 5.0s length, but
   `ffmpeg silencedetect` showed the file only rings for ~3.63s — the rest is
   a trailing pause baked into the file — so every cycle played out ~1.37s of
   dead air plus ~300-600ms of measured Bark relay latency before the next
   ring landed. Fixed by firing at `REPEAT_MS = 3600` instead (cuts the pause
   short via the same same-id replace mechanism). Commit `a0cf7ea`, deployed
   as Fly release **v61, complete**. Not yet re-tested live after this
   specific change — the timing math is solid (verified against the actual
   audio file) but the felt result on the phone hasn't been re-confirmed.
2. **Screen goes black then wakes every cycle — investigated, real ceiling,
   NOT fixed, parked as a future option.** Bark's Banner Style was already
   `Persistent` on the spare iPhone (ruled out as a settings fix). Checked
   Bark's full documented parameter list and cross-checked with Gemini:
   plain APNs notifications (which is all Bark or any notification-relay
   service can send) have **no key that keeps the screen lit across a
   sequence of same-id replacements** — each delivery is its own brief
   wake-then-sleep event to iOS, full stop, regardless of interruption level.
   `call:'1'`'s screen persistence came from being **one single delivery**
   whose sound looped locally within that one delivery's lifecycle, which is
   exactly the mechanism with the uncontrollable 30s/no-remote-stop problem
   this whole fix exists to avoid. Gemini's independent read matched: with
   plain notifications, "persistent screen" and "remotely stoppable" are
   mutually exclusive; getting both needs a genuine PushKit VoIP push +
   CallKit incoming-call UI in the companion app itself, which Bark cannot
   provide.
   - **Parked compromise (Gemini's "Option C"), not attempted, decided to
     leave for a future session:** a longer sound file (e.g. the existing
     5.0s clip concatenated 2× to ~10s, two ring+pause cycles in one
     delivery) played once per delivery to halve/third the wake frequency,
     paired with an active "kill push" on `ring_stop` — same `id`, a silent
     or near-silent sound — to cut off in-progress audio instead of relying
     on resend cadence alone. Needs: (a) uploading the longer sound to Bark
     on the phone, (b) uploading a genuinely silent custom sound asset for
     the kill push (Bark has no documented built-in silent sound), and
     (c) a live test, since Gemini explicitly flagged that whether a
     same-id silent replacement actually stops in-progress audio is
     iOS-version/lock-state dependent and unverified. Real chance it doesn't
     work as hoped. If picked up later, read this paragraph first — the
     research is already done, don't re-run it.

---

## Session 27d — MOVE TO THE BEELINK, iPhone call tests (start here)

**Nothing about SideStore is outstanding. It is fixed — see the SOLVED section
below and do not re-open it.** What is outstanding is the iPhone *call* testing,
which has now been waiting since session 22 and needs the kiosk.

### First three commands on the Beelink

```powershell
Get-Date -Format 'yyyy-MM-dd HH:mm tt'
& git -C "C:\Users\Yap Family Dashboard\Desktop\Digital Dashboard\yap-family-home" pull
& git -C "C:\Users\Yap Family Dashboard\Desktop\Digital Dashboard\yap-family-companion" pull
```

⚠️ The kiosk repo **drifts** — it was 5 commits behind at the start of session 26.
⚠️ The Beelink user folder is `Yap Family Dashboard`; **every path has a space, so
use the call operator** — `& "C:\Path With Spaces\app.exe"`.
⚠️ **QUIET HOURS 21:00–07:00 SGT block every outgoing call. No override. Check am/pm.**

### State going in

| thing | state |
|---|---|
| Companion `main` | this commit (docs). Last **code** commit `84aac2e` |
| Kiosk `main` | `ddc2703`, deployed, bundle `index-C_CyEBwL.js` |
| Fly backend | needs nothing |
| Spare iPhone | build **`b=a1fe32b`**, `me=kath`, SideStore refresh WORKING, 7 days |
| Bark key `hMct2EY…` | on the **spare**, NOT on Kath's phone |

⚠️ **A kiosk call to `kath` rings the spare and Barks the spare. Nothing reaches
Kath overseas.** Verified 2026-07-30.

### Test 1 — the duplicate notification (Priority A, waiting since session 22)

1. At the **Beelink kiosk**, call **Kath**. Answer on the spare, let it connect.
2. Hang up from the **kiosk's red button**, then **lock the spare immediately**.
3. Call **Kath** again from the kiosk. Don't touch the phone.
4. Photograph the lock screen.

**PASS = Bark only**, one "Yap Family calling / Tap to answer" critical alert.
**FAIL = a quiet "Yap Family is calling" banner instantly, with Bark ~5s later.**
That duplicate is what `7873da9` removed and this build carries.

### Test 2 — `61a9b4a`'s first ever iOS run (nobody planned this)

Under test at the same time, because `a1fe32b` is the first iOS build to include it.
On the incoming call, watch for **live Accept/Decline buttons instead of a
spinner**, and note anything odd about accepting.

### Test 3 — the iOS missed call (no longer needs Kath's phone)

⚠️ **Previously blocked on Sunday; it is not.** The spare holds the Bark key, and
the key is the whole mechanism. Call the spare from the kiosk, **let it ring out
untouched**, then end it from the kiosk's **red hang-up button**. Confirm the
"Yap Family calling / Tap to answer" alert is **replaced in place** by
"Missed call" — **one** notification, not two. Issued in sessions 25, 26 and 27,
never run.

### Test 4 — tomorrow morning, 30 seconds, and it gates Sunday

Open SideStore on the spare and read the day count. **7 days = the midnight
automation fired locked and unattended on the new RPPairing file.** 6 = it didn't.
This is the only evidence that Kath's Sunday setup can be trusted to survive
without a computer nearby.

### Then: Sunday 2 August — Kath's phone, full first-time setup

Not a reinstall. From nothing, and **budget hours**:

1. **Pair with `idevice_pair`, NEVER iloader** (uninstalled — see SOLVED below).
   Generate → **Validate** → **Install**. The file must contain **`alt_irk`**.
2. Install SideStore itself with **Sideloadly** over USB (free Apple ID).
3. Companion IPA from **inside SideStore** via its **+** picker — only apps
   SideStore manages get refreshed.
4. Shortcuts automation: **Time of Day 12:00 AM daily, Run Immediately** →
   Connect to LocalDevVPN VPN → **Wait 5s** → Refresh All Apps.
5. **LocalDevVPN → `Auto Connect on Launch` ON.**
6. **Bark**: install, grant **Critical Alerts**, **Show Previews = Always**,
   **Banner Style = Persistent**, then put her device key into
   `VITE_BARK_KEY_KATH` on **Vercel → Production → redeploy** (Vite bakes env at
   build time).
7. **Refresh once and confirm 7 days. Then leave it locked overnight and confirm
   7 days again BEFORE she travels.** This is the step that must not be skipped —
   the failure mode is a setup that looks fine and dies days later out of reach.

### Standing rules — these cost sessions 20–27

1. **ASK WHICH MACHINE A CONSOLE IS ON.** A bookmarks bar or window chrome means
   it is **not** the Beelink's fullscreen kiosk.
2. **One artifact from each side of the SAME call, or it is not evidence** —
   `#N call seen` **and** `reject ok` on the phone, same call id on the kiosk.
3. **Read the source before theorising** —
   `node_modules/@stream-io/video-client/dist/index.es.js` (`dist/src/` is `.d.ts`).
4. **Get the KNOWN-GOOD reading before explaining the bad one.** A matched pair of
   SideStore logs killed three confident theories in minutes today.
5. **Verify tool capabilities before acting on them** — two fabricated commands
   were acted on today.
6. **One instruction at a time.** Not options, not "if X then Y".
7. **Do NOT strip the debug code.**
8. **Do NOT dispatch an Android build.** Android is closed. Two fixes are batched
   for whenever one is next needed: timeouts on the decline path
   (`IncomingCallScreen.decline()` — neither `reject()` nor `endCall()` has one),
   and a manual re-entry point for the full-screen-intent permission.

### Handover back when the Beelink session ends

Append a **"Session 27e outcomes"** section: what was run, on which machine, and
the artifact it produced. Then commit and push:

```powershell
& git -C "C:\Users\Yap Family Dashboard\Desktop\Digital Dashboard\yap-family-companion" add TODO.md
& git -C "C:\Users\Yap Family Dashboard\Desktop\Digital Dashboard\yap-family-companion" commit -m "docs: session 27e outcomes"
& git -C "C:\Users\Yap Family Dashboard\Desktop\Digital Dashboard\yap-family-companion" push
```

**Anything changed on Vercel, in Stream, or on a phone must be written down — the
next session cannot see any of it.**

---

## Session 27e outcomes (2026-07-30, on the Beelink)

Ran on the **Beelink kiosk** (fullscreen, no browser chrome — confirmed) calling
the **spare** iPhone (build `b=a1fe32b`, `me=kath`). Kiosk console confirmed
bundle **`index-C_CyEBwL.js`**, matching the expected deployed build. Repos
matched TODO exactly on arrival — no drift this session (companion `fc37b19`,
kiosk `ddc2703`).

⚠️ **Kiosk call ids truncate on the phone strip.** The kiosk's full call id
`family-hub-kath-<13-digit-ms-timestamp>` appears on the phone strip with the
leading `178` dropped — e.g. kiosk `…1785414811859` = phone strip
`5414811859`. Useful for matching evidence across the two sides in future
sessions.

### Test 1 (duplicate notification) — ✅ PASS

Call → answer on spare → hang up from kiosk red button → lock spare
immediately → call again, untouched. **Only the Bark critical alert fired; no
extra quiet "Yap Family is calling" banner.** Confirmed ~20:32 SGT. First
attempt was invalid (phone was touched/accepted before the photo was taken);
the passing run was the retry with the phone genuinely untouched.

### Test 2 (`61a9b4a` first iOS run) — confirmed, nothing odd

Reached via tapping the Bark alert (call id `…5414811859`): the incoming-call
screen renders **live Decline/Accept buttons**, not a spinner. Nothing odd
noted about the buttons themselves. Not accepted during the observed run, so
post-accept behavior on iOS specifically remains unobserved.

### Test 3 (iOS missed call replaces alert in place) — ⚠️ PARTIAL, two open issues

Tested across three device states, phone untouched during each ring:

| state | on end from kiosk | notification result |
|---|---|---|
| locked | ring → kiosk hangup | "Missed call" replaces the alert **in place** ✅ |
| unlocked, app not open | Bark "call coming through" → kiosk hangup | "Missed call" replaces the alert **in place** ✅ |
| unlocked, **app open** | in-app full-screen "Yap Family calling" (no Bark) → kiosk hangup | call screen clears immediately, **no missed-call notification at all** ❌ |

Kiosk-side log for one of the passing calls confirms the intended mechanism:

```
[call] << event: call.session_ended
[call] rang out unanswered — sending missed-call note
[ring] stop (cancelled): 200
[bark] push accepted: {"code":200,"message":"success",...}
```
(call `family-hub-kath-…4979676`)

**Two open issues found — update (2026-07-31, kiosk repo, user away on a walk):**

1. **No missed-call record when the app was foregrounded — root-caused and FIXED,
   not yet phone-verified.** Confirmed in `streamVideo.js`: the backend
   suppresses the initial Bark ring push entirely when the callee's app is
   foregrounded (it shows its own in-app ring screen instead), so there was no
   prior Bark banner for `notifyCalleeMissed`'s `level: 'passive'` push to
   visibly rewrite — it landed silently in Notification Center, unseen. Fixed
   by switching that push to `level: 'active'` (kiosk repo, commit `8e83d8a`,
   pushed → Vercel deploy). Still doesn't ring or bypass Focus/DND, just
   guarantees a banner shows even when nothing rang before it. **Needs a real
   phone test to confirm** — not done this session, no one available to check
   the phone.
2. **Bark's ring/sound overrunning ~15s after kiosk hangup — root-caused,
   fix DECIDED but NOT YET BUILT (needs a new session — see kickoff prompt at
   the top of this file).**

   Confirmed via Bark's own docs (README.md, bark-server API_V2.md): `call: '1'`
   plays the ringtone **on a fixed 30-second timer**, and there is no
   documented remote-stop for an in-progress `call` loop — a same-`id` push
   rewrites the visible banner but does not interrupt audio already playing.
   Also checked with Gemini as a second opinion; it agreed and added that a
   `UNNotificationServiceExtension` (which is how Bark processes pushes) only
   runs *before* a notification is presented, so it has no way to reach back
   into an already-playing sound either. No exploitable gap found anywhere in
   this — it is a real platform limitation, not a bug in our code.

   **The fix**: stop using `call: '1'`'s forced 30s loop; instead repeat a
   *short* sound every few seconds for as long as the call is actually
   ringing, so worst-case overrun shrinks to that short clip's length instead
   of up to 30s. A custom sound was made for this: `iphone_x.mp3` (the
   companion app's own former in-app ringtone, muted in `39a6db8` once Bark
   took over iOS ringing) turns out to be exactly 6 loops of one natural
   ~5-second "ring (3.6s) + pause (1.4s)" cycle back-to-back — confirmed via
   `ffmpeg`'s `silencedetect` filter, silence boundaries almost exactly every
   5.01s. Trimmed to one clean cycle and converted:
   `assets/iphone_x_ring_cycle.caf` (5.0s, mono 44.1kHz PCM) — **already
   uploaded into Bark on the spare** (Service → Alert Sound → Custom Sounds →
   `iphone_x_ring_cycle`, confirmed showing "5 second(s)" in the app).

   **⚠️ Why this isn't built yet — a real architectural gap, not just
   remaining effort.** The backend (Fly, `calendar_backend.py` — not checked
   out in either of these two repos, not touched this session) holds the
   first ring push for ~1200ms and decides — based on the phone's heartbeats,
   invisibly to the kiosk — whether to actually fire it or suppress it
   entirely (when the callee's app is already foregrounded showing its own
   ring screen). That decision is made asynchronously, **after** the
   `/api/ring/start` HTTP response has already returned to the kiosk
   (confirmed via this file's own history, line ~1720: the Fly log reads
   `holding push for 1200ms` → `suppressed, phone is ringing on screen`,
   i.e. the outcome is logged well after the request/response cycle). So the
   kiosk cannot currently know whether it should keep sending repeat pushes
   or not — repeating unconditionally from the kiosk alone would ring even in
   the suppressed case, reintroducing a version of the duplicate-ring bug
   Test 1 exists to catch.

   **Decision (2026-07-31, with user): Option 2 — fix it properly.** Extend
   the Fly backend so it tells the kiosk (or handles the repeat loop itself)
   whether the ring is actually live, rather than building a kiosk-only
   workaround with a known correctness gap. This needs its own look at
   `calendar_backend.py`, which is not part of this repo — **start a new
   session for this, see the kickoff prompt at the top of this file.**

### Evidence-gap note

Several more test/exploratory calls (kiosk-visible as `#3`–`#8` on the phone
strip, ids `…694077` through `…415000096`) were placed during this session
that weren't individually narrated back turn-by-turn. The kiosk console dump
obtained late in the session covers them at the `[call]`/`[bark]`/`[ring]`
level, but they weren't individually matched to phone-side photos per the
"one artifact from each side" rule. Not believed to change any conclusion
above, but flagged rather than silently assumed clean.

### Not run this session

- **Test 4 (SideStore day count on the spare)** — deferred to tomorrow
  morning per the user's request; not yet checked.
- Session ended for **quiet hours (21:00 SGT)**; no further calls placed
  after ~20:45.

### Reminder for tomorrow morning

⚠️ **The naive "check the day count" plan is broken — don't just read the
number.** The user manually ran "Refresh All Apps" again tonight at ~20:5x
SGT, on top of the earlier manual refresh this session, resetting the counter
to a fresh 7. Tomorrow morning is only ~10-12 hours later, so **the counter
will almost certainly still read 7 even if the midnight automation fails
silently** — there hasn't been enough elapsed time for it to tick down
regardless. A **7 reading proves nothing** this time. A **6 reading would
still be meaningful** (proves the automation did not run).

**Do this instead:** pull SideStore's on-device console log (same technique
as the SOLVED fix below — `pymobiledevice3 apps pull
com.SideStore.SideStore.DGTDMWTY29 …`) and look for a refresh entry
timestamped **~00:00 on 2026-07-31**, or check whether the Shortcuts
automation's "Notify When Run" notification actually fired overnight. Either
one directly proves the automation ran, instead of inferring it from a
counter that tonight's manual refresh has made uninformative.

**Update (2026-07-31 morning):** user checked — no error in the SideStore
log, both apps read 7 days. As predicted above, **this doesn't confirm the
automation ran** (the manual refresh last night resets the same reading).
**Real test deferred to later today**: check again after enough real time has
passed since last night's manual refresh that a failed automation would
actually show as 6.

---

## ✅ SOLVED (2026-07-30): stale RPPairing keys. The tool is `idevice_pair`.

**SideStore refresh works again — both apps went 6 → 7 days, sign-in restored.**
Read this before touching pairing on any phone, including Kath's.

### The cause

The pairing file's **RemotePairing (RPPairing) block was stale and incomplete.** It
carried `identifier` / `private_key` / `public_key` from an old identity and was
**missing `alt_irk` entirely** — a field current iOS requires. That produced an
**instant** `[minimuxer] ERROR: Failed to get UDID` (no timeout line), i.e. a
connection accepted and then rejected on a failed cryptographic handshake.

### The fix — 4 minutes, free, no paid account, no reinstall

1. **`jkcoxson/idevice_pair`**, Windows v0.1.14 —
   `https://github.com/jkcoxson/idevice_pair/releases`. Local copy at
   `C:\Users\user\Downloads\idevice_pair-windows-x86_64.exe`.
2. Phone on USB, unlocked. Pairing Type = **RPPairing**.
3. **Generate** → produces the plist (`public_key`, `private_key`, `identifier`,
   **`alt_irk`**). New identifier was `58c639c0-…` vs the stale `65f34248-…`.
4. **Validate** → success. **Install** (its own SideStore button, writes into
   `com.SideStore.SideStore.DGTDMWTY29`) → success.
5. VPN on → SideStore → **sign in** → **Refresh All Apps**. Both apps 6 → 7 days.

### ⚠️⚠️ `Wireless Debugging: MissingValue` IS A RED HERRING

idevice_pair reports **the identical** `Failed: UnknownErrorType("MissingValue")`
on that status line — and generate, validate and install all succeed anyway. So:

- It is **not** an iloader bug (three tools report it: iloader, idevice_pair, and
  pymobiledevice3 as "No such value").
- It is **not fatal** and **not the cause of anything**. iloader treats it as fatal
  and aborts at device-select; that is iloader's problem, and iloader is simply not
  needed any more.
- **Do not chase it again.** Hours went into it.

### ⚠️ The mistake that cost this session, recorded so it is not repeated

Every pairing file tested carried the **same RemotePairing triple** — it was
deliberately carried over when building a "merged" file, and then the original was
restored. So **the one variable that mattered was never varied**, while "the pairing
file is exonerated" was being asserted. That conclusion only ever covered the
**classic** lockdown record. `pymobiledevice3 lockdown save-pair-record` does not
emit the RPPairing block at all, which is why it could not have fixed this either.

Two further process failures worth naming:

- **A second opinion fabricated two tool capabilities** —
  `pymobiledevice3 developer core-device pair` (does not exist; `core-device` has 15
  subcommands, none is `pair`) and Sideloadly's "Export pairing file" (does not
  exist; verified in the v0.60 UI). Both were acted on. **Verify tool capabilities
  before acting.**
- **An "iloader is architecturally obsolete on iOS 17.4+" claim was asserted and was
  false.** The user killed it on timing alone: iOS 17.4 shipped in 2024 and iloader
  worked on this phone on 27 July. That challenge is what redirected the session to
  the RemotePairing identity.

### 🔑 The instrument that actually worked

**SideStore writes a console log per launch, on the device, pullable over USB.**
Nothing else in this stack told the truth.

```powershell
$c = "`nls Documents/ConsoleLogs`nexit`n"   # leading newline required — BOM
$c | & python -m pymobiledevice3 apps afc com.SideStore.SideStore.DGTDMWTY29
& python -m pymobiledevice3 apps pull com.SideStore.SideStore.DGTDMWTY29 `
    "/Documents/ConsoleLogs/<name>.log" "<local>"
```

**Always pull the KNOWN-GOOD log too.** A matched pair (29 July worked / 30 July
failed) killed three confident theories in minutes — the unreachable override peer
`192.168.1.50`, `vpn peer: nil`, and "the network changed" — because all three are
present in the run that **succeeded**, which was also on a different subnet.

### What this changes for Kath

- **Unattended 7-day refresh is viable again.** The $99 Apple Developer account is
  no longer forced by a broken signing path. It remains a real option for its own
  reasons (TestFlight OTA install, CallKit, retiring Bark) — but that is now a
  choice, not a rescue.
- **Sunday's setup must use `idevice_pair`, NOT iloader**, and must produce an
  RPPairing file that includes `alt_irk`.
- ⚠️ **Verify the nightly automation tomorrow morning** — 7 days again = it ran
  locked and unattended. This fix restores refresh; it does not prove the automation
  fires.
- Still worth doing: **LocalDevVPN → `Auto Connect on Launch` ON** (it is off), and
  a ~5s `Wait` between the VPN and refresh steps in the Shortcuts automation.

---

## Session 27c (2026-07-30) — the diagnosis, kept for the exclusions

**Read this before touching SideStore, iloader, or the pairing file. Roughly three
hours went into it and the outcome is a precise diagnosis with no fix.**

### The failure, exactly

SideStore's `Refresh All Apps` fails with *"Failed to refresh 2 apps. SideStore
could not determine this device's UDID. Please replace your pairing using
iloader."* on the **spare** iPhone (device name "Kathryn", iOS **26.5.2** build
**23F84**, UDID `00008101-00046C423041401E`).

⚠️ **The message names the pairing file and the pairing file is NOT the problem.**
That is the second time this message has lied — session 25's cause was the VPN.

### 🔑 The decisive instrument nobody knew existed: SideStore's own logs

**SideStore writes a console log per launch, on the device, and it can be pulled
over USB.** This is the only instrument in the whole setup that told the truth.

```powershell
# list them
$c = "`nls Documents/ConsoleLogs`nexit`n"
$c | & python -m pymobiledevice3 apps afc com.SideStore.SideStore.DGTDMWTY29
# pull one
& python -m pymobiledevice3 apps pull com.SideStore.SideStore.DGTDMWTY29 `
    "/Documents/ConsoleLogs/<name>.log" "<local path>"
```

⚠️ Piping stdin to that AFC shell adds a **BOM** to the first command — start the
string with a newline or the first command fails as `'\ufeffl'`.

**A matched pair of logs was captured — same device, same build, one working and
one failing.** This is evidence no upstream issue thread has.

| | 29 July 00:51 (worked, gave 7 days) | 30 July 08:50 (fails) |
|---|---|---|
| `[iface] en0` | ip=**192.168.10.122** | ip=**192.168.0.113** |
| `[iface] utun4` | ip=10.7.0.0 peer: **nil** | ip=10.7.0.0 peer: **nil** |
| override peer | **NOT reachable at 192.168.1.50** | **NOT reachable at 192.168.1.50** |
| `device endpoint` | **cleared -> nil** | **cleared -> nil** |
| `Getting UDID for first device` | → `UDID: 00008101-…` ✅ | → `ERROR: Failed to get UDID` ❌ |

**Everything minimuxer logs is IDENTICAL in both runs.** The failure is one call,
and the difference is invisible from outside. Note also that the working run was on
a *different subnet*, which is why the network is exonerated.

### ⚠️ Two theories formed from that log and both were WRONG — don't re-run them

1. **"The override peer `192.168.1.50` is unreachable, that's the bug."** No — it
   is equally unreachable in the run that **succeeded**. `overrideEffective:
   false` in both.
2. **"The network changed, that's the bug."** No — the working run was on
   `192.168.10.122`, a different subnet from the failing one.

Both were called out loud before checking the working log. **Read the known-good
log before theorising about the failing one.**

### Ruled out with evidence — do not re-test any of these

| ruled out | evidence |
|---|---|
| **iOS update** | 26.5.2 (23F84) **released 2026-06-29**, a month before. Nothing updated overnight. |
| **`lockdownd` wedged** | pymobiledevice3 10.2.3 over USB reads device info, pairs, and reads/writes app containers cleanly. |
| **Wireless lockdown off** | Was genuinely missing; set via `pymobiledevice3 lockdown wifi-connections --state on`, now reads `{"EnableWifiConnections": true}`. `Test-NetConnection <phone> -Port 62078` → **True**. Did not fix it. |
| **The pairing file** | Pulled SideStore's own file; structurally complete (EscrowBag, UDID, RemotePairing triple). Built a merged file with the **live** HostID (old `31266624-3445721725783980` → live `31268786503418099139313832`); SideStore onboards cleanly on it. **Merged and restored-original fail identically.** |
| **MAC privacy** | Device `WiFiAddress fc:66:cf:25:8c:fd` matches `WiFiMACAddress` in the pairing file exactly. |
| **Network / subnet** | Phone and PC on the same /24, ping both ways, port 62078 open. And the working run was on a different subnet. |
| **Developer Mode** | ON. Cycled off/on. ⚠️ **SideStore requires it — do not leave it off.** |
| **Local Network permission** | ON for SideStore. |
| **LocalDevVPN signature expiry** | Only **two** dev-signed apps exist: `com.SideStore.SideStore.DGTDMWTY29` and `com.yapfamily.companion.DGTDMWTY29`. LocalDevVPN is **not** sideloaded, so no deadlock. |
| **iloader being out of date** | Upgraded **2.2.6 → 2.2.10** (released 2026-07-29). `Failed to enable wifi debugging: MissingValue` **unchanged**. |
| **LocalDevVPN logs** | v1.1.5, `connecting → connected`, status transitions only. No data-plane logging, no errors, no port. |
| **lockdownd contention** | Retried with USB unplugged and iloader closed. Same. |
| **Reboot-then-refresh-immediately** | The most-reported upstream mitigation. Tried clean. Same. |

Also tried and failed: 4 reboots, VPN off/on repeatedly, SideStore **Reset Pairing
File** then re-place, force-quit and relaunch, opening LocalDevVPN first so its
extension is definitely alive.

### What it actually is

An **upstream SideStore bug** on iOS 26.4.x/26.5.x. SideStore **0.6.3** (stable).
Upstream issues: `SideStore/SideStore` **#1305, #1262, #1336, #1322, #1197, #1112**;
reported log is `Couldn't fetch first device (timed out)` → `Failed to get UDID`.
Re-placing the pairing via iloader is **documented as ineffective**, which is
exactly what we found the hard way. No confirmed fix. LiveContainer is reported to
bypass **sign-in only** and cannot be driven by a Shortcuts automation, so it does
not restore unattended refresh.

`iloader`'s `MissingValue` is a **separate** upstream bug (`nab138/iloader` #340,
#75, #260, #427, #463 — open, no fix). ⚠️ It is **not iloader-specific**:
pymobiledevice3 returns "No such value" for the same key, so the value genuinely
did not exist device-side. Creating it did not help iloader.

### ⚠️ What this means for Kath, and it is not good

- **The spare's apps are still signed** — refreshed 2026-07-29, so ~6 days left
  from then. **Call testing is NOT blocked.**
- **Sunday 2 August is at risk.** Kath's phone needs a from-scratch setup (see
  session 27b) and the refresh path is broken upstream. Unattended 7-day refresh
  for someone overseas with no PC **cannot currently be delivered.**
- The user has ruled the **$99 Apple Developer account out** for now. Do not
  re-argue it unasked; it was raised and answered on 2026-07-30.

### Small robustness items found along the way — worth doing regardless

1. **LocalDevVPN → `Auto Connect on Launch` is OFF.** Turn it on.
2. **`Connect On Demand` does not bring the tunnel up after a reboot** — observed
   twice. The nightly automation must connect it explicitly.
3. **The nightly Shortcuts automation has no `Wait`** between "Connect to
   LocalDevVPN" and "Refresh All Apps". Add ~5s. Not the cause of this failure
   (SideStore's own button fails while unlocked and attended), but correct.
4. ⚠️ **No SideStore log exists for 00:00 on 2026-07-30** — the newest before
   07:42 is `console-20260729_191638_544.log`. So the midnight automation may not
   have fired at all that night, which is a **separate** question from this bug.

### 🔑 THE TOOL WE WERE MISSING: `idevice_pair` (NOT iloader)

⚠️⚠️ **RETRACTED — "iloader is architecturally obsolete on iOS 17.4+" is FALSE.**
It was asserted here and it does not survive the session-25 record: on **27 July,
on this phone, on this same iOS 26.5.2 build**, iloader successfully did
`Delete Stored Pairing` + regenerate + place, **three times**. iOS 17.4 shipped in
2024, so an architectural incapability would have failed then too. iloader did not
become obsolete — **it stopped working between 27 and 30 July.** The claim came from
a second opinion that explicitly could not cite a maintainer statement, and it was
passed on with more confidence than it was given.

⚠️ **So the shared-cause reading is back, and stronger.** Two tools that both
worked on 27–29 July both broke by the 30th, on an OS that hasn't changed in a
month. Something on the DEVICE changed. The fingerprint is
`EnableWifiConnections` being **absent** when it had demonstrably worked days
earlier — that is the central question now, not a footnote.

⚠️ **New hypothesis worth testing, and it points at us:** the 27 July session
thrashed iloader's pairing — three regenerations including a full delete. That may
have left duplicate or stale **RemotePairing peers** on the device, working until
something forced re-validation. If so the fix is to clear the peer list and mint
one clean identity, which is precisely what `idevice_pair` is for.

**`idevice_pair` is still the right next action** — but because it is the only tool
that will **vary the RemotePairing identity**, not because iloader is obsolete.

**`jkcoxson/idevice_pair` is the current tool.** It generates **RPPairing** files via
`CoreDeviceProxy` + `RemotePairingClient`, and installs them straight into the
Documents folder of SideStore / LiveContainer / StikDebug via HouseArrest+AFC — the
same mechanism we were driving by hand with `pymobiledevice3 apps push`.

- Windows build **v0.1.14 (2026-06-17)**, downloaded to
  `C:\Users\user\Downloads\idevice_pair-windows-x86_64.exe`
- Releases: `https://github.com/jkcoxson/idevice_pair/releases`
- RPPairing support landed in `v0.1.9-rppairing`

⚠️ **Our pairing file has always carried the SAME RemotePairing triple.** The log
prints `[minimuxer] INFO: RPPairing file detected`. When the merged file was built,
`identifier` / `private_key` / `public_key` were **deliberately carried over** from
the old file, then the original was restored — so the RemotePairing identity was
never once varied, while "the pairing file is exonerated" was being asserted. That
conclusion only ever covered the **classic** record.

⚠️ **Two mid-session conclusions that were WRONG and are retracted here:**
"no Windows tool can produce a SideStore pairing file with RemotePairing keys", and
"therefore Clear Trusted Computers would be unrecoverable". With `idevice_pair` the
file can be regenerated, so clearing trust is recoverable — **but generate and
verify a working file FIRST, and only clear trust if it is actually needed.**

⚠️ Also wrong, and checked in the UI rather than guessed: **Sideloadly has NO
"Export pairing file" feature** (v0.60 — Advanced Options is app-signing only;
Settings has only Anisette Local/Remote, Signing Mode, Uploading). And
**`pymobiledevice3 developer core-device pair` DOES NOT EXIST** — `core-device` has
15 subcommands and none of them is `pair`. Both were asserted by a second opinion
and both are fabrications; verify tool capabilities before acting on them.

**Correct syslog syntax**, for the capture that still needs doing:
`pymobiledevice3 syslog live -o <file>` (there is no `--process`; the filters are
`--process-name`/`-pn` and `-m`).

### NEXT SESSION, IN ORDER — needs the phone on USB at the upstairs PC

1. Run `idevice_pair-windows-x86_64.exe`, generate a **fresh RPPairing file**, and
   let it install into SideStore.
2. VPN on → **Refresh All Apps**. This is the first test that varies the
   RemotePairing identity.
3. If it still fails: `pymobiledevice3 syslog live -o <file>` during a refresh, then
   search for `remotepairingd`, `lockdownd`, `minimuxer`, `refused`.
4. Untried permutation: push the **classic-only** file from
   `pymobiledevice3 lockdown save-pair-record` with **no** RemotePairing block, to
   see whether minimuxer takes a different path when `RPPairing file detected` is
   absent.
5. Sort out the HostID mismatch we created: pymobiledevice3 paired a **new** HostID
   (`31266624-3445721725783980` → `31268786503418099139313832`) and the restored
   original file carries the **old** one.
6. Pull and search the JetsamEvent logs (`JetsamEvent-2026-07-29-230654.ips`).
7. Check the app's entitlements / app-group suffix after the 29 July re-sign.

### ⚠️ STATE OF THE SPARE AT END OF SESSION — read before touching it

- **SideStore is SIGNED OUT of the Apple ID**, and cannot sign back in: sign-in is
  gated behind the same UDID call that refresh fails on (upstream issue **#1305**
  is exactly this). Caused by following SideStore's own documented step 8 for error
  1006 — *"switch anisette to Macley"* + **Reset adi.pb**. ⚠️ **My instruction, and
  it cost the session's Apple ID session.** It did NOT cost a working capability:
  refresh had already failed identically at 08:50 with the session intact.
- **Anisette is back to the default** `https://ani.sidestore.io`.
- **The original pairing file is restored byte-identical** (9803 bytes).
- **Developer Mode is back ON** (it was cycled off during diagnosis; SideStore
  requires it).
- `EnableWifiConnections` was **absent** and is now `true` — left that way
  deliberately; it is correct and was one of the few genuinely wrong things found.
- **The companion app is still signed until ~5 August**, so **call testing is not
  blocked**. Sign-in only has to succeed once the upstream bug is worked around.

### The official 10-step remediation for error 1006 — audited against what we did

From `docs.sidestore.io/docs/troubleshooting/error-codes`:

| # | Official step | Us |
|---|---|---|
| 1 | Reset the pairing file in SideStore settings | ✅ |
| 2 | Delete stored pairing in iloader | ❌ **blocked** — iloader dies at device-select |
| 3 | Refresh iloader | ❌ blocked |
| 4 | Pair the device with iloader | ❌ blocked (substituted pymobiledevice3) |
| 5 | Place the pairing file in all apps / next to SideStore | ✅ via pymobiledevice3 |
| 6 | Open SideStore and refresh | ✅ fails |
| 7 | Set **Device IP to `10.7.0.1`** (or the custom LocalDevVPN setting) | ⬜ **NEVER TRIED** |
| 8 | Switch anisette to Macley | ⚠️ tried — **this is what signed us out** |
| 9 | Reboot the device | ✅ ×4 |

⚠️ **Step 7 is the last untried documented action.** SideStore's stored override is
`192.168.1.50` — a stale address on a subnet that does not exist here — while
LocalDevVPN's actual Device IP is `10.7.0.1`. It is **not causal** (the same stale
value is in the log of the run that SUCCEEDED, with `overrideEffective: false`), but
it is the documented fix and it would give minimuxer the `peer` it keeps logging as
`nil`. Not attempted because the user stopped, correctly, after the adi.pb damage.

⚠️ **LiveContainer's workaround requires the Nightly channel**, so it is not
available on this 0.6.3 stable install.

### Auto-update audit — "we changed nothing" is not quite true, but it wasn't this

Three components update themselves without the user acting. Checked:

- **SideStore 0.6.3 was released 2026-05-05**, so it did **not** self-update on the
  29th. Dead.
- **iloader** ships a Tauri updater; 2.2.6 → 2.2.10 made no difference to
  `MissingValue`, so this explains onset at most, not the bug.
- **LocalDevVPN is App Store / Apple-signed, so it auto-updates.** Currently 1.1.5.
  **Still unchecked** — App Store → LocalDevVPN → update history. Best remaining
  candidate for "nothing changed".

⚠️ **The 29 July log proves that run genuinely worked** — `Successfully resigned
app`, `Sideloaded app … with result: success()`. So the theory that it only
*appeared* to work off a cached UDID is dead.

⚠️ **Not doc-backed, contrary to what I said mid-session:** the "disable Wi-Fi and
Cellular Data" advice in SideStore's docs is for **obtaining 2FA verification
codes**, NOT for refresh or UDID failures. Wi-Fi Assist remains speculative.

### Tooling now on the upstairs PC

- **pymobiledevice3 10.2.3** (was 9.27.0). This is the tool that works when
  iloader does not: `usbmux list`, `lockdown info`, `lockdown save-pair-record`,
  `lockdown wifi-connections`, `apps list/query/pull/push/afc`.
- ⚠️ **iloader is UNINSTALLED (2026-07-30)** — executable, folder, registry entry,
  the MSI in Downloads and `AppData\Local\me.nabdev.iloader` all removed. It
  produced the defective pairing file and could not select the device on this iOS.
  **Do not reinstall it, whatever SideStore's error message says.** Pairing is
  `idevice_pair`; installing SideStore itself is Sideloadly.
- **Sideloadly v0.60** at `C:\Users\user\AppData\Local\Sideloadly\sideloadly.exe` —
  signs and installs over USB with the free Apple ID (7 App IDs remaining). It reads
  the UDID over USB and does anisette locally, so it never touches the loopback path
  that failed. ⚠️ It has **no** pairing-file export.
- Pairing files, both logs and the merge script are in the session scratchpad;
  **copy them somewhere permanent if they are still wanted.**

---

## Session 27b — CONTINUE ON THE BEELINK (start here)

Session 27 ran from the work PC over remote desktop and stopped because every
remaining test needs the kiosk. **Everything below was established first; do not
re-derive it.**

### First three commands on the Beelink

```powershell
Get-Date -Format 'yyyy-MM-dd HH:mm tt'
& git -C "C:\Users\Yap Family Dashboard\Desktop\Digital Dashboard\yap-family-home" pull
& git -C "C:\Users\Yap Family Dashboard\Desktop\Digital Dashboard\yap-family-companion" pull
```

The kiosk repo is the one that matters on that machine and it **drifts** — it was
5 commits behind at the start of session 26. If the companion repo is not present
on the Beelink, that is fine; read this file from GitHub instead. ⚠️ The Beelink
user folder is `Yap Family Dashboard`, and **every path there has a space, so it
needs the PowerShell call operator** — `& "C:\Path With Spaces\app.exe"`.

⚠️ **QUIET HOURS 21:00–07:00 SGT block every outgoing call. No override, ever.
Check am/pm.**

### Settled in session 27 — do not re-test

| finding | evidence |
|---|---|
| **Priority 1 CLOSED.** SideStore auto-refresh holds | **7 days** on both apps on the spare — the midnight automation ran **locked and unattended**, so the LocalDevVPN step works. Second consecutive verification. |
| **A fresh iOS build is installed on the spare** | Dispatched from `main`; strip reads **`b=a1fe32b`**, confirmed on device. `a1fe32b` is docs on top of `84aac2e`, so the code is current `main`. |
| **The spare is signed in as `kath`** | strip reads `me=kath` |
| repos current | companion `a1fe32b`, kiosk `ddc2703`, both clean, both fetched |

⚠️ **The session-27 build supersedes `7873da9` deliberately.** `7873da9` was three
code commits stale, and one of them — `61a9b4a`, the banked Accept/Decline during
the connect — is **cross-platform and had never been built for iOS**. Installing
the older IPA would have tested the wrong binary and left Sunday as that code's
first iOS run. Old Priority 2 is therefore superseded, not skipped.

### ⚠️⚠️ "Kath's phone" has meant TWO DIFFERENT PHONES all along

**Bark is not installed on Kath's current phone and never has been.** The Bark
device key the kiosk sends to — `hMct2EY…`, `VITE_BARK_KEY_KATH`, one key per user
at `streamVideo.js:96` — is registered to **the spare** (her *old* phone, device
name "Kathryn"). Confirmed by the user, 2026-07-29.

So every result recorded as *"tested on Kath's phone"* — including the 2026-07-26
`id`-replacement test that proved a delivered critical alert can be recalled — was
taken **on the spare**. The findings stand; the device attribution in TODO and in
`project_bark_ios_ring` was wrong.

**Two consequences, both load-bearing:**

1. **Testing is safe right now.** A kiosk call to `kath` rings the spare over
   Stream *and* sends the Bark critical alert to the spare. **Nothing reaches Kath
   overseas.** This was checked before ringing precisely because a continuous
   silent-bypassing Critical Alert at an unknown local hour is not recoverable.
2. **Sunday 2 August is a FULL FIRST-TIME SETUP, not a reinstall.** Kath's current
   phone needs, from nothing: LocalDevVPN + iloader pairing, SideStore (Stable),
   the companion IPA via SideStore's own **+** picker, the midnight Shortcuts
   automation (Connect VPN → *Refresh All Apps*), **Bark installed and its key
   put into `VITE_BARK_KEY_KATH` on Vercel → Production → redeploy**, Critical
   Alerts ON, Show Previews = Always, Banner Style = Persistent. Budget hours, not
   minutes. Sequence: [[project_sidestore_refresh]] and [[project_bark_ios_ring]].

### Priority A — the duplicate-notification test (the one that was interrupted)

The instruction that was live when the session stopped, unchanged:

1. At the **Beelink kiosk**, call **Kath**. Answer on the spare, let it connect.
2. Hang up from the **kiosk's red button**, and **lock the spare immediately**.
3. Call **Kath** again from the kiosk. Do not touch the phone.
4. Photograph the spare's lock screen.

**PASS = Bark only** — one "Yap Family calling / Tap to answer" critical alert,
ringing. **FAIL = a quiet "Yap Family is calling" banner appears instantly and
Bark arrives ~5s later.** That duplicate is what `7873da9` removed and what this
build carries.

⚠️ **`61a9b4a` is also under test here and nobody planned it that way** — this is
its first iOS run. Watch the incoming-call screen for **live Accept/Decline
buttons instead of a spinner**, and note anything odd about accepting.

### Priority B — a decision owed to the user, now dated

**The $99 Apple Developer account.** The case is written up under session 25's
SideStore section — **do not re-argue it from scratch, ask where they have
landed.** It is more urgent than it was this morning: Sunday is now a from-scratch
setup on Kath's phone, so buying it changes what gets built on Sunday rather than
starting a fresh 7-day treadmill on a phone that has never been on one.

### Priority C — needs Kath's phone, so it cannot happen before Sunday

The iOS missed call: call her iPhone from the kiosk, let it ring out untouched,
end it from the kiosk's red hang-up button, confirm the critical alert is
**replaced in place** by "Missed call" — one notification, not two. ⚠️ **Given the
finding above, this can be run on the SPARE today instead** — the spare holds the
Bark key, which is the entire mechanism under test. Do that if there is clock left
after Priority A.

### Standing rules — these cost sessions 20-26

1. **ASK WHICH MACHINE A CONSOLE IS ON.** A bookmarks bar or window chrome in a
   screenshot means it is **not** the Beelink's fullscreen kiosk.
2. **One artifact from each side of the SAME call, or it is not evidence.** Never
   reason about a decline without `#N call seen` **and** `reject ok` on the phone
   and the **same call id** on the kiosk.
3. **Read the SDK source before theorising** —
   `node_modules/@stream-io/video-client/dist/index.es.js` (`dist/src/` is `.d.ts`
   only). Ten minutes there beat four hypotheses.
4. **One instruction at a time.** Not options, not "if X then Y".
5. **Do NOT strip the debug code.** Decisive again in session 26.
6. **Do NOT dispatch an Android build.** Android is closed — the July 29
   complaints were a lost `USE_FULL_SCREEN_INTENT` grant, fixed with one toggle.
   Two fixes are batched for whenever a build is next needed anyway: timeouts on
   the decline path, and a manual re-entry point for the full-screen-intent
   permission.

### When the Beelink session ends — handover back

Append a **"Session 27b outcomes"** section to this file recording, for each test:
what was run, on which machine, and the artifact it produced. Then:

```powershell
& git -C "C:\Users\Yap Family Dashboard\Desktop\Digital Dashboard\yap-family-companion" add TODO.md
& git -C "C:\Users\Yap Family Dashboard\Desktop\Digital Dashboard\yap-family-companion" commit -m "docs: session 27b outcomes"
& git -C "C:\Users\Yap Family Dashboard\Desktop\Digital Dashboard\yap-family-companion" push
```

If the companion repo is not on the Beelink, write the outcomes into the kiosk
repo's `TODO.md` under a clearly-marked *"companion session 27b"* heading, push
that, and say so — a result recorded in the wrong repo still beats one lost.
**Anything that changed on Vercel, in Stream, or on a phone must be written down;
the next session cannot see any of it.**

---

## Session 27 kickoff prompt — iPhone

**Android is in a good place and is NOT the job this session. iOS is, and it has
a deadline: Kath is back Sunday 2 August 2026.**

Read this file and the memory index first. Companion `main` — last **code** commit
is `84aac2e`. Kiosk `main` at **`ddc2703`**, pushed and deployed to Vercel (bundle
`index-C_CyEBwL.js`). The Fly backend needs nothing.

⚠️ **`git fetch --all` in BOTH repos before searching for anything.** The kiosk
drifts; it was 5 commits behind at the start of session 26.

⚠️ **QUIET HOURS BLOCK ALL CALL TESTING, 21:00–07:00 SGT.** No override, ever.
**Check the clock first and check am/pm** — `Get-Date -Format 'HH:mm tt'`.

### ⚠️ Read these two before touching a console — both cost session 26 dearly

1. **ASK WHICH MACHINE THE CONSOLE IS ON.** Every kiosk reading in session 26 came
   from the user's **work PC**, a second browser signed in as `family-hub`, while
   the screen being judged was the **Beelink**. That client worked perfectly the
   whole time. Hours of hypotheses were fitted to the machine that wasn't failing.
   **The tell is in the screenshot: a bookmarks bar and window chrome mean it is
   NOT the Beelink's fullscreen kiosk.**
2. **One artifact from each side of the SAME call, or it is not evidence.** Never
   reason about a decline without `#N call seen` AND `reject ok` on the phone, and
   the **same call id** on the kiosk. Session 26 paired a phone strip with a kiosk
   console from a different call and reported the conclusion as settled.

**And: read the SDK source before theorising.** `node_modules/@stream-io/
video-client/dist/index.es.js` (the `dist/src/` folder is `.d.ts` only). Ten
minutes there answered more than four hypotheses combined.

### Priority 1 — SideStore on the spare iPhone (30 seconds, gates everything)

**Asked four times in session 26 and never answered.** Open SideStore on the spare
iPhone and read the day count against each of the two apps. **7 days = the midnight
automation ran locked and unattended and the VPN fix holds; 6 = it did not.**
`Notify When Run` is ON, so also ask whether a notification appeared overnight.

Nothing else on iOS is safe to plan until this is known — a signing treadmill that
has quietly stopped changes what Sunday has to achieve.

### Priority 2 — the iOS build of `7873da9`, still never installed

Waiting since **session 22**. Removes the duplicate "Yap Family is calling"
notification. Reproduce with: answer, hang up, lock the phone immediately, call
again. Before the fix: a quiet banner instantly and Bark ~5s later. After: Bark
only. Can be installed on the spare now; Kath's own phone needs Sunday.

### Priority 3 — the iOS missed call (needs Kath's phone, so Sunday)

Kiosk-side and already live. Call Kath's iPhone from the kiosk, let it ring out
untouched, then end it from the kiosk's red hang-up button. Confirm the
"Yap Family calling / Tap to answer" critical alert is **replaced in place** by
"Missed call" — **one** notification, not two. Issued in session 25, again in 26,
never run.

### Priority 4 — the $99 Apple Developer account, now dated

**Decide before Sunday.** If it is bought, Sunday's reinstall on Kath's phone
should be the one that uses it rather than starting another 7-day treadmill. The
case is written up under session 25's SideStore section — **do not re-argue it from
scratch. Ask where the user has landed.**

### Batched for the next Android build — do NOT dispatch one just for these

Nothing on Android needs a build urgently. When one is next dispatched, include:

1. **Timeouts on the decline path.** Neither `await call.reject()` nor
   `await call.endCall()` in `IncomingCallScreen.decline()` has one; `withTimeout`
   was only ever applied to `join()`. A stall strands the phone on "Ending…"
   forever with nothing logged. Seen once in session 26, not reproducible.
2. **A manual re-entry point for the full-screen-intent permission.** It silently
   degrades every incoming call, cannot be read back from JS, and its prompt is
   gated behind a one-shot key last bumped in `a999a0e` — **55 commits ago**.
   Bumping the suffix again buys one prompt and leaves the same hole.

**Do not strip the debug code.** The strip was decisive again in session 26.

### Two standing instructions from the user

- **One instruction at a time.** Not options, not "if X then Y". Literal paths for
  the machine they are on — the Beelink/kiosk user folder is `Yap Family Dashboard`,
  this PC's is `user`. ⚠️ **Any path with a space needs the PowerShell call
  operator:** `& "C:\Program Files\iloader\iloader.exe"`.
- **Evidence before theories, and check the instrument before trusting the
  evidence.** Sessions 20-26 each lost time to an instrument, not a fault.

---

## Session 26 kickoff prompt (completed — see outcomes below)

**Priority 1 (Android) is CLOSED — all four tests pass on `84aac2e`, installed on
the Oppo. Do not re-open it.** One iOS test is outstanding and needs no build.

Read this file and the memory index first. Companion `main` last **code** commit
is `84aac2e`; kiosk `main` at `d6794a9`, deployed. The Fly backend needs nothing.

⚠️ **`git fetch --all` in BOTH repos before searching for anything.** Session 24
reported a feature absent twice after an exhaustive search of a 9-commit-stale
checkout. A stale checkout and a missing feature return identical "no matches".

⚠️ **QUIET HOURS BLOCK ALL CALL TESTING, 21:00–07:00 SGT** — no override, ever.
**Check the clock first, and check am/pm.** Session 25 lost time twice to this:
once starting at 23:50 (nothing could be tested), and once misreading 20:42 as
08:42 and nearly flagging a correct timestamp as a bug. `Get-Date -Format 'tt'`.

### Priority 1 — iOS missed call (one call, no build)

Kiosk-side and already live. **Session 25 got as far as issuing this instruction
at 20:45 and ran out of clock.**

Call Kath's iPhone from the kiosk, let it ring out untouched, then end it from
the kiosk's red hang-up button. Confirm the "Yap Family calling / Tap to answer"
critical alert is **replaced in place** by "Missed call" — **one** notification,
not two. The bug that started this was two stacked alerts, 54 minutes and 1 hour
old, both still offering to answer calls that were long over.

### Priority 2 — the iOS build from session 22, still not installed

`7873da9` removes the duplicate "Yap Family is calling" notification. Waiting
since session 22. Reproduce with: answer, hang up, lock the phone immediately,
call again. Before the fix that gave a quiet banner instantly and Bark ~5s later;
after it, Bark only.

### Priority 3 — decide on the $99 Apple Developer account

Raised in session 25 and **left with the user deliberately**. Do not re-argue it
from scratch; the case is written up under "SideStore" in the outcomes below.
Short version: it retires the 7-day signing treadmill, the pairing file, the VPN,
the nightly automation and SideStore itself, and it is the same $99 previously
declined for unlock-to-answer. It would also make real APNs/CallKit *possible*,
which is what Bark currently stands in for — that is a future option worth real
work, **not** a reason to rip Bark out.

### Then: the strip, and Priority 4

**Do not strip the debug code yet.** The strip earned its keep twice in session
25 — `b=84aac2e` confirmed which build a reading came from, and the absence of a
`missed:` line proved a "missed call test" had actually been a decline. Two of
the four unexplained items are still unexplained failures on the Oppo.

### Two standing instructions from the user

- **One instruction at a time.** Not options, not "if X then Y". Literal paths
  for the machine they are on — the Beelink/kiosk user folder is
  `Yap Family Dashboard`, this PC's is `user`. ⚠️ **Any path with a space needs
  the PowerShell call operator:** `& "C:\Program Files\iloader\iloader.exe"`.
- **Evidence before theories, and check the instrument before trusting the
  evidence.** Sessions 20-25 each lost time to an instrument rather than a fault.

---

## Session 26 outcomes (2026-07-29)

### The Android "regression" was a lost OS permission, not code

Reported: no full-screen ring on the Oppo, only a narrow banner, plus a missing
missed-call notification. Matrix taken on the Oppo, strip confirmed **`b=84aac2e`**
(the build session 25 signed off, so not a stale install):

| # | app | screen | full screen | banner | missed call |
|---|---|---|---|---|---|
| 1 | open | on | ✅ (the app's own ring screen) | ✅ | ✅ |
| 2 | open | off | ❌ | ✅ | ✅ |
| 3 | off | on | ❌ | ✅ | ✅ |
| 4 | off | off | ❌ | ✅ | ❌ |

**Cause: `USE_FULL_SCREEN_INTENT` special app access was OFF for Yap Family.**
Confirmed on the device. `App.js:541-546`, written after session 15, documents
this signature verbatim — *Android demotes the full-screen intent to a heads-up
banner, MainActivity never launches, and `turnScreenOn` never fires*. Rows 2-4
are that, exactly.

⚠️ **Row 4's missing missed call is probably a symptom of the same thing, not a
second fault.** `postMissedCall` is called from `CallOverlay`; if MainActivity
never launches, `CallOverlay` never mounts and nothing posts. To be confirmed by
re-running the matrix after granting.

⚠️ **Row 1 is probably NOT a regression of `84aac2e`.** The handler at
`missedCall.js:44-55` returns `shouldShowBanner: false` for anything without the
`yapMissedCall` data tag, so it cannot be adding a banner. Stream's incoming-call
notification is posted natively and never passes through a JS handler. A
foreground ring showing the app's own screen *plus* Stream's banner is most
likely long-standing behaviour that had never been observed, because no previous
session rang the phone with the app in the foreground.

### Why the app stopped asking for the permission — user observation, confirmed

The user noted that every new install used to prompt for full-screen
notifications and the last one did not. **They were right and my first
explanation was wrong.** The prompt is one-shot, gated on an AsyncStorage key,
and the key was bumped three builds running — `265e02b` (unsuffixed) →
`284d0d4` (`_v2`) → `a999a0e` (`_v3`). **`a999a0e` was the last bump, and there
have been 55 commits since.** So the prompt has been silent since session 15 on
any install-over-the-top; the installs that did re-prompt after that were ones
where the app was uninstalled first, which wipes AsyncStorage.

### Granting it fixed rows 2-4, including the missed call — CONFIRMED

Permission turned ON, then row 4 re-run (app force-closed, screen off): **full
screen woke the phone, and the missed-call notification arrived.** So row 4 was a
symptom of the permission, not a second fault, exactly as predicted. No build was
needed for any of it.

### The "5-10s delay ending the call" is ~2-3s, and nothing is timing out

Reported after the fix: the phone kept showing the call for 5-10s after hang-up
at the kiosk. Measured from the strip, `#N call seen` → `missed: posted`:

| call | gap | how it was ended |
|---|---|---|
| #1 | 15.67s | let ring |
| #2 | 15.11s | let ring |
| #3 | 8.80s | let ring, shorter |
| #4 | **5.06s** | hung up at ~3s, deliberately |

⚠️ **A fixed-timeout hypothesis was formed on #1 and #2 landing 0.5s apart and
was killed by #3 before #4 arrived.** Two calls of similar length look identical
to a timeout. The gap tracks ring duration, so the cancel *is* being delivered.

Netting off ring time and the ~1.4s the phone spends on `connect:` before it even
sees the call, the real kiosk-hangup → phone-clears lag is **~2-3s**. Most of
what was felt as delay is the phone's connect, which happens before `#N call
seen` and is invisible from the kiosk. **Polish, not a fault. Not being chased.**

### ⚠️ Instrument correction: the strip SURVIVES a call

Recorded here because it was stated wrongly mid-session and it changes how every
future reading is taken. `debugLog.js` is in-memory only, so the strip was
expected to die when `returnToAndroidHome()` → `BackHandler.exitApp()` runs. It
does not: four calls spanning ~25 minutes sat in one buffer. `exitApp()`
backgrounds the app rather than killing the process. **The strip can be read
after a call — it does not have to be photographed during one.**

### Decline never was a delivery bug — the kiosk just never closed its screen

Reported: decline on the phone does not end the kiosk call. Chain, every link
evidenced:

1. **The phone's decline succeeds.** `reject()` then `endCall()`, both 200 —
   strip read `reject ok` at `58:01.346` and `endCall ok` at `58:01.607`. The
   call really ends.
2. **The kiosk knows.** Its SDK reacts to the coordinator event by calling
   `leave({ reject: true })` **itself**. Proven by the stack: `JF.onmessage →
   ZF.dispatchEvent → leave → reject`, with **no frame from our code**. And
   `useCalls()` drops to `0 (none)`.
3. **That SDK reject 400s.** It POSTs to a call that has already ended → *"Cannot
   accept/reject a call that is not in progress"*, as an **uncaught** rejection
   inside the SDK's own leave.
4. **So the leave never completes**, `callingState` never reaches `LEFT`, and
   `VideoCallOverlay.jsx:105` — the only thing that dismisses the overlay — never
   runs. The kiosk sits on "Calling Dad…".

Both fallbacks under it were already dead: `call.rejected` is not delivered
(settled session 18), and the `rejected_by` poll reads `[]` because the call is
gone before a rejection can be observed on it.

**Fixed kiosk-side in `ddc2703`** — a `call.ended` listener that calls
`onLeave()`, alongside the `LEFT` effect rather than replacing it. Plus the two
`.catch(() => {})` on the decline paths now log. **No app build was needed.**
New bundle: **`index-C0bLweHD.js`** (was `index-DKAgh5vE.js`).

⚠️ **Two wrong leads were followed first, both worth not repeating.** The
`useCalls()` leak (count reached 5-6 stale `:left` calls) looked causal and was
not — after a hard reload the count returned cleanly to 0 and decline still
failed. And an SFU `1006` WebSocket failure (`Failed to join call`) appeared on
one call and never recurred: **intermittent, still unexplained, not the decline
bug.** Kept open below.

⚠️ **The pre-join placeholder and `CallLayout`'s waiting state render identical
markup by design** (`VideoCallOverlay.jsx:344`) — the same trap session 23
recorded with `IncomingCallPlaceholder`. A screenshot cannot tell them apart. The
tell is the console: `[call] watching this call: true` requires the call object,
so it only prints from `CallLayout`.

⚠️ **The placeholder branch (`!error && !call`) still has NO end-detection** —
only a manual hangup button. A decline arriving before `startCall()` resolves
would strand it the same way. Not hit in testing, not fixed. Open.

### What the Stream SDK source actually says (read, not inferred)

`node_modules/@stream-io/video-client/dist/index.es.js` — the real implementation
(`dist/src/` is `.d.ts` only).

1. **The reject 400 is SDK-internal and harmless.** `watchCallRejected` (:9741):
   the kiosk **is** the call creator, so when the only other member rejects, the
   SDK itself calls `leave({ reject: true, reason: 'cancel' })`. The phone's
   `endCall()` has already ended the call, so Stream answers *"not in progress"*.
   Hours were spent treating this as a lead. It is noise.
2. **⚠️ "`call.rejected` is never delivered" (session 18) is WRONG as written.**
   `watchCallRejected` returns early unless `callingState === RINGING` (:9737),
   and the kiosk joins immediately so it is JOINED. **The SDK's handler ignores
   the event; the event itself arrives.** Which is exactly why the hand-rolled
   listener at `VideoCallOverlay.jsx:133` works. Restate it that way.
3. **There is no "wrong call object" mechanism.** `Call.on()` (:14036) subscribes
   to the *shared* client socket and filters on `event.call_cid === this.cid`.
   No per-call subscription to go stale; any Call with a matching cid gets it.

### Decline VERIFIED working on `ddc2703` — matched pair, same call id

The first evidence all session where both sides are provably the same call
(`family-hub-adrian-1785299075001`), on bundle `index-C_CyEBwL.js`:

| side | reading |
|---|---|
| phone | `#1 call seen 25:01.292` → `reject ok 25:23.188` → `endCall ok 25:23.663` |
| kiosk | `<< event: call.rejected` → `callee rejected, ending call: adrian` |
| kiosk | `poll — rejected_by: ['adrian']` → `count: 0 (none)` → `onClose` |

Both the event path AND the poll fired. The callee waited **22s** before
declining, so it is not a narrow timing window.

⚠️ **Still unverified: a SECOND call in the same page session.** Every confirmed
decline today was the first call after a load.

### ⚠️⚠️ THE ONE THAT COST THE SESSION: the console was a DIFFERENT MACHINE

**Every kiosk console reading on 2026-07-29 came from the user's work PC**, not
the Beelink — a second browser signed in as `family-hub`, watching the same
calls. The screen being judged ("the kiosk call kept going") was the **Beelink**,
for which there was **no console evidence at all**.

That client was working correctly the whole time: it received `call.rejected`,
recorded `rejected_by: ['adrian']`, and closed its overlay. So an afternoon of
hypotheses were fitted to the machine that wasn't failing — they are not wrong so
much as **answering a question nobody asked**.

⚠️ TODO has warned since session 20: *"Test hardware differs: confirm whether a
kiosk reading came from the Beelink or the upstairs PC."* The tell was in every
screenshot — a bookmarks bar and window chrome, which the Beelink's fullscreen
kiosk does not have. **Before accepting any kiosk console, ask which machine it
is on, and check the screenshot for window chrome.**

### On the Beelink itself: decline works, with an intermittent hang

Tested directly on the Beelink, no second client involved:

- **Decline from the phone's full-screen call screen ends the Beelink call.** ✅
- **Decline from the notification banner also works.** ✅
- **Seen once, then not reproducible: the phone stranded on "Ending…"** —
  `busy === 'declining'`, set synchronously at the top of `decline()`, so the
  function had started and never finished.
- A banner flashes briefly *after* a successful decline, then clears. Cosmetic.
- Which presentation appears (banner / full screen / both) looks random but almost
  certainly tracks the three device states + app-in-foreground (session 23).
  **Record lock state with every future observation** or it stays "random".

⚠️ **Open, and worth fixing on the next build regardless:** neither
`await call.reject()` nor `await call.endCall()` in `IncomingCallScreen.decline()`
has a timeout — `withTimeout` was only ever applied to `join()`. If either stalls,
nothing is logged and the screen strands on "Ending…" forever. That is precisely
the observed symptom, and today it was **invisible**: no line on the strip either
way. Wrapping both in `withTimeout`, logging which one timed out, and releasing
`busy` would make the next occurrence self-reporting.

### ⚠️ How this session burned two hours — process, not code

Four hypotheses were formed and discarded before the SDK was read: a fixed
timeout (killed by call #3's 8.80s), the `useCalls()` stale-call leak (killed by
a reload that cleared it while decline still failed), the overlay not closing
(shipped as `ddc2703`, and its premise — that `call.ended` arrives — was false),
and "the second call is damaged".

**The root process error: pairing a phone strip with a kiosk console from a
DIFFERENT call**, then reporting the conclusion as settled. Two of the four
"failures" also had no confirmed decline in them at all — the strip showed the
phone still on Decline/Accept.

**Rule for next time: never reason about a decline without `#N call seen` AND
`reject ok` on the phone, and the SAME call id on the kiosk. One artifact from
each side of the same call, or it is not evidence.** Reading the SDK source took
~10 minutes and answered more than all four hypotheses combined — do it first.

### Still open after this session

- **SFU WS `1006`** — one call failed to join the SFU entirely (`Join SFU request
  failed`, `Failed to join call (0)`). Coordinator socket was healthy at the time.
  Seen once, not reproduced. If it recurs, check whether it is Beelink-specific
  by loading the same kiosk URL on the upstairs PC.
- **720p, not 1080p.** Confirmed on the kiosk camera: `[cam] post-enable
  {"frameRate":30,"height":720,"width":1280}`. This is Priority 4 as written —
  proposed in session 23, deliberately never implemented. Not a regression.
- **`[sdk] [devices]: Failed to get video stream` / `Camera init failed` on the
  phone**, three times, always at `connect:` time while the app is backgrounded.
  Android blocks background camera access, so this is *probably* benign. Not
  confirmed either way.

**Open code item for the next build.** A permission that silently degrades every
incoming call, cannot be read back from JS, and is gated behind a one-shot flag
needs a **manual re-entry point in the app** — a "Fix call settings" action the
user can hit any time. Bumping the suffix again only buys one more prompt and
leaves the same hole open for the next revocation.

---

## Session 25 outcomes (2026-07-27)

### Priority 1 is CLOSED — all four Android tests pass on `84aac2e`

| # | Test | Result |
|---|---|---|
| 1 | **Accept/Decline appear instantly** | ✅ "Buttons are almost immediate" — the 5s spinner is gone |
| 2 | **Decline from that early window** | ✅ press registered, kiosk call ended, phone returned to launcher |
| 3 | **Missed call on Android** | ✅ "Missed call — Yap Family called at 8:39pm" |
| 4 | **A decline produces no note** | ✅ nothing posted |

⚠️ Test 1 does **not** shorten the connect, and that was confirmed with the user
as the thing actually bothering them. Ring-to-talking is unchanged.

### The missed-call notification was posted and never shown (`84aac2e`)

First test produced nothing. The diagnosis, in order, because the order is the
point:

1. **The "Missed calls" notification channel existed on the Oppo.** `ensureChannel()`
   inside `postMissedCall()` is the only thing that creates it, so the function
   had run. That single reading killed "never reached" without placing a call.
2. **No `setNotificationHandler` existed anywhere in the app** — `7873da9` removed
   it along with the local iOS notification. Expo SDK 56 docs, verbatim: *"The
   default behavior when the handler is not set or does not respond in time is
   not to show the notification."* (checked against the versioned docs, not
   assumed).
3. **Foreground is exactly when ours arrived.** `CallOverlay` posted it and called
   `returnToAndroidHome()` → `BackHandler.exitApp()` in the same tick, so delivery
   landed mid-exit-transition while the app still counted as active.

Fixed three ways in `84aac2e`:
- `setNotificationHandler`, **scoped by a `data` tag to our own notification**. A
  handler is global; returning "show" for everything would put a banner over a
  foreground incoming ring, which is the bug `7873da9` removed.
- The post is **awaited** before `returnToAndroidHome()`. Unawaited it lost the
  race with `exitApp()` every time, because it awaits channel creation first.
- `debugLog` on **both** the success and failure paths.

⚠️ **`console.log`/`console.warn` go NOWHERE on the Oppo** — no adb, and
`debugLog` is a separate buffer that does not capture the console. So
`postMissedCall`'s "errors are reported, never swallowed" was true in code and
useless in practice: a post that succeeded, one that threw, and one never reached
all read identically as nothing on the lock screen. Anything worth diagnosing on
a phone must go through `debugLog`.

### `endCall ok` distinguishes a decline from a ring-out — use it

A reported "missed call tested — no notification" was **not a missed call**. The
strip read `#1 call seen` → `returnHome: called` 7.6s later → `endCall ok`.
`endCall ok` is logged only from `IncomingCallScreen.js:379` (decline) and
`ActiveCallScreen.js:65` (hangup); a call that rings out and is cancelled from the
kiosk produces neither. So the phone had declined, and **no notification was the
correct behaviour**. The re-run with nothing touched passed immediately.

### SideStore: the pairing file was never the problem — the VPN was

Kath's **old** phone (the spare; its device name is "Kathryn", which is not the
same phone) stopped refreshing. Error:

> Failed to refresh 2 apps. SideStore could not determine this device's UDID.
> Please replace your pairing using iloader.

**That message is a liar.** Three pairing files were placed via iloader —
including a full `Delete Stored Pairing` + regenerate — with no effect. The actual
cause: **LocalDevVPN was not connected.** SideStore reaches `lockdownd` on
`127.0.0.1:62078` *through* the VPN; with it down it cannot read the UDID and
blames the pairing. One toggle fixed it instantly; both apps went to **7 days**.

⚠️ The note "SideStore brings up LocalDevVPN itself, no connect step needed" was
**wrong** — the VPN merely happened to be up on the day that was verified.
Corrected in memory. The midnight automation is now:

1. **Connect to LocalDevVPN VPN** (iOS's built-in `Set VPN` action does reach it)
2. **SideStore "Refresh All Apps"**

Verified by turning the VPN **off**, then running the automation with ▶: it
brought the VPN up itself and refreshed clean. `Notify When Run` turned back ON
for a few nights. **Next morning's check: 7 days = it ran locked and unattended;
6 = it did not.**

⚠️ **Apple's 30-day pairing expiry is real but was NOT the cause here.** *"On
devices with iOS 11 and iPadOS 13.1, or later, if a pairing record hasn't been
used for more than 30 days, it expires"* — Apple Platform Security, "Physical
pairing model security". A second opinion confirmed the hypothesis confidently
and it was still the wrong diagnosis; the tell that killed it was the phone
**not** prompting "Trust This Computer", i.e. the host pairing was alive all
along. Confident agreement is not evidence.

**The structural problem it raised is still open** and is why Priority 3 exists:
on-device refresh does not touch the pairing record's last-used timestamp, only a
host connection does. An always-on LAN host running `idevicepair validate` weekly
keeps it alive **while the phone is on the home network** — which does not cover
Kath overseas for weeks, the exact case the app exists for. Untested idea worth
one experiment on the spare: the house already runs **Tailscale**, so if her
phone joined the tailnet the Beelink could touch the record from anywhere.
Unknowns: whether `lockdownd` accepts a session over a `utun` interface, and that
mDNS discovery won't cross Tailscale so it must be pointed at the tailnet IP.

### Not done

Priority 2 (iOS missed call) — instruction was issued at 20:45 and quiet hours
closed the window. Priority 3 (the iOS build) untouched. No strip removal.

---

## Session 25 kickoff prompt (completed — see outcomes above)

**Android calling is verified. Everything open is a test of code already written,
already pushed, and already installed. No build is needed for Priorities 1 or 2.**

⚠️ **Session 24 ran at 23:28 and could not place a single call** — quiet hours.
Start this session **after 07:00 SGT** or there is nothing to do. See below.

Read this file and the memory index first. Companion `main` is whatever this
commit is (docs only — the last **code** commit is `f746e73`); kiosk `main` at
`d8b1be5`, **deployed to Vercel and hard-refreshed on the Beelink**.
The Fly backend is deployed; session 23 changed only a comment in it, so it needs
nothing.

⚠️ **`git fetch --all` in BOTH repos before searching for anything.** Session 24
searched all three repos for the quiet-hours feature — git-ignored files included
— reported twice that it did not exist, and was wrong: the kiosk had **9 unpulled
commits** carrying it. A thorough search of a stale checkout and a genuinely
absent feature return the identical "no matches", and the thoroughness makes the
wrong answer more convincing. The companion gets pulled by habit; the kiosk
drifts.

⚠️ **QUIET HOURS BLOCK ALL CALL TESTING, 21:00–07:00 SGT.** Kiosk
`src/services/quietHours.js`, added in the commits above. Outgoing calls grey out
and do nothing; incoming calls are ignored silently. **There is no override and
there will never be one** — explicitly decided, because a debug bypass could be
left on. Everything in Priorities 1–3 needs the kiosk to place a call, so
**check the clock before planning a test session** — session 24 got as far as
"press Accept now" at 23:28 before discovering this.

⚠️ **Two unrelated features are both called "missed call".** The phone
notification (Priorities 1 and 2) and the kiosk's `MissedCallBanner`, which logs
calls dropped during quiet hours to `localStorage`. Evidence about one says
nothing about the other.

⚠️ `gh` CLI is **not installed** on this PC. Builds are dispatched from
`https://github.com/aslyap/yap-family-companion/actions` in a browser and their
status cannot be polled from the session — ask, never assume.

### Priority 1 — test three things on the Android build (INSTALLED)

✅ **Session 24: the build is installed on the Oppo and the strip reads
`b=8e14f30`.** That is run #82, green, and `8e14f30` is docs-only on top of
`f746e73`, so both untested changes are present. Instrument checked — no need to
re-install or re-confirm the tag. The three tests below were **not run**: quiet
hours (see above) made it impossible to place a call.

1. **Accept/Decline appear instantly.** Call the Oppo. The call screen must come
   up with working buttons, **no spinner where the buttons go**. Press Accept
   during that window — the press is banked (`src/callIntent.js`) and runs the
   moment the real screen mounts. Reported as "the connecting spin wheel stays on
   for about 5 sec and I don't like that".
   ⚠️ This does **not** shorten the connect. Ring-to-talking is unchanged; only
   the wait-before-you-can-act is gone. Confirmed with the user as the thing that
   was actually bothering them.
2. **Decline from that same early window.** It cannot reach the kiosk any faster
   — rejecting needs a connected client — but it must not be lost or double-fire.
3. **Missed call on Android.** Call the Oppo, let it ring out unanswered. A
   "Missed call — Yap Family called at HH:MM" notification must appear, silently.
   Declining must produce **no** note.

### Priority 2 — missed call on iOS

Kiosk-side and already live, so this needs no build.

✅ **Still valid on kiosk `040896d`, checked in session 24.** The quiet-hours
commits touched `VideoCallOverlay.jsx` and `IncomingCallOverlay.jsx`, but the
diff against `8209352` adds only music silencing — the `stopBackendRing()` →
`notifyCalleeMissed()` block that rewrites the ring as a missed call is
untouched, and the `IncomingCallOverlay` change is the kiosk *receiving*, not the
phone.

Call Kath's phone, let it ring out, and confirm the "Yap Family calling / Tap to answer" critical alert is
**replaced in place** by "Missed call" — one notification, not two. This is the
screenshot that started it: two stacked alerts, 54 minutes and 1 hour old, both
still offering to answer.

### Priority 3 — the iOS build from session 22, still not installed

`7873da9` removes the duplicate "Yap Family is calling" notification. Its build
was running when session 22 ended and has still never been installed. Reproduce
with: answer, hang up, lock the phone immediately, call again. Before the fix
that gave a quiet banner instantly and Bark ~5s later; after it, Bark only.

### Then: the four unexplained items, the strip, and Priority 4

See "Four things seen this session that are NOT explained" below — the
both-directions audio dropout is the one worth catching in the act. **Do not
strip the debug code yet** even though Priority 1 went green; the strip is the
only diagnostic surface the Oppo has and two of those four are unexplained
failures on it.

### Two standing instructions from the user

- **One instruction at a time.** Not options, not "if X then Y". Literal paths
  for the machine they are on — the Beelink/kiosk user folder is
  `Yap Family Dashboard`, this PC's is `user`.
- **Evidence before theories, and check the instrument before trusting the
  evidence.** Sessions 20-23 each lost time to an instrument rather than a fault.

---

## Session 24 outcomes (2026-07-26, 23:00–00:00)

**A short session that tested nothing, because it could not.** Everything below
is setup and correction, not results.

### Done

- **The Android build is installed on the Oppo and the strip reads `b=8e14f30`.**
  Run #82, green, 30m 32s. `8e14f30` is docs-only on top of `f746e73`, so both
  untested changes are present. **Do not re-install or re-verify the tag.**
- **Priority 2 re-checked against the moved kiosk and is still valid** — see the
  diff evidence under Priority 2 above.
- Kiosk repo pulled from `b297eab` → `040896d` (9 commits, quiet hours).
- Wake-on-LAN diagnosed and fixed — **recorded in the kiosk's TODO.md**, not
  here, since it is house infrastructure rather than the companion. Stale public
  IP in the Oppo's WoL app; an open item compares Tailscale-relay vs
  DDNS + DHCP-reservation as the durable fix.

### Not done

All three Priority 1 tests, Priority 2, and Priority 3. Quiet hours. No code was
written this session and no theory about calling was formed.

### ⚠️ The mistake that cost the session, recorded so it is not repeated

Asked where quiet hours was documented, I searched all three repos — every `.md`
in the tree, then every source file **including git-ignored ones** — and reported
twice, with the evidence laid out, that the feature did not exist in the
codebase. It did. The kiosk repo was **9 commits behind the remote** and the
whole feature was in them.

The failure was not the search. The search was thorough, and being thorough is
what made the wrong answer persuasive. **A stale checkout and an absent feature
return the identical "no matches".** This is
[[feedback_check_the_instrument]] with git as the instrument: I checked whether
ripgrep was hiding files and never checked whether the checkout was current.

**`git fetch --all` in every repo is now the first step of any "does X exist
here?" question — before the first grep, not after two wrong answers.** The
companion gets pulled by habit; the kiosk drifts, and the answer often lives in
the kiosk.

---

## Session 23 outcomes (2026-07-26)

### Priority 1 is CLOSED — all four Android tests pass on the Oppo

Run on the **installed** APK (`07a124a`), no rebuild. See the correction below:
TODO had the last Android build wrong by six commits, and a 25-minute build was
started and cancelled on the strength of it.

| # | Test | Result |
|---|---|---|
| 1 | **Decline** ends the kiosk call | ✅ — open since session 18, now closed |
| 2 | **Cold-start ring** (force-killed, screen off) | ✅ rang, screen came on |
| 3 | **Accept** from the app's own screen | ✅ connects; **no `b24bb7b` flap** |
| 4 | **Return home** on hangup | ✅ drops to the Android launcher |

`accept: joined ok in 1453ms` — healthy, faster than iOS's 2448ms, and `t0` is set
at `IncomingCallScreen.js:152` **before every await in the accept path**, so that
number covers the whole thing from the button press. Instrument checked.

### Four things seen this session that are NOT explained — read before stripping

None reproduce now, so none were chased. All four are recorded with the reading
that would settle them, because "cleared up by itself" is not "fixed".

1. **No in-call audio in EITHER direction, Oppo ↔ kiosk.** Reported live, then
   cleared on its own before a console dump was taken. Both-directions-dead rules
   out the session-19 kiosk mic alias (one direction) and the Bark audio session
   (iOS only). ⚠️ **If it recurs, get the kiosk console dump WHILE it is
   happening** — F12, clear, call, **talk continuously for 40s** (Opus sends
   almost nothing on silence, so a quiet room reads identically to dead audio),
   hang up, copy the whole console.
2. **Stuck on `Connecting…`, never connected.** Screenshotted. Cleared by a
   **force-close + clear app data**, which points at *persisted* state rather
   than a code path.
   ⚠️ **The screenshot was `IncomingCallPlaceholder`, not the accept spinner** —
   I misread it as the latter at first. Both render "Yap Family / …video call"
   over a spinner labelled `Connecting…`, which is by design (the cover is a copy
   of the ring screen's shell) and makes them indistinguishable in a photograph.
   So this was almost certainly **the client never arriving**, not `join()`
   hanging. The tells that separate them, for next time: the placeholder has no
   Accept/Decline buttons at all, and `join()` is time-boxed at 30s
   (`IncomingCallScreen.js:267`) so a real join hang writes a failure line to the
   strip at 30s. Neither reading was taken.
3. **Accept latency varies.** One measured call was 1453ms; others felt long.
   Consistent with session 20's finding that the SDK's own `doJoin` retries are
   **intermittent, not per-call** (`joining → ringing → joining → ringing →
   joining → joined` over 7.3s). Known behaviour, not a new bug.
4. **Ring sometimes appeared as the heads-up banner only, not the full screen.**
   Could not be reproduced. Probably Android working as designed: a full-screen
   intent is only launched full-screen when the device is **locked or screen
   off**, and demoted to a banner when unlocked and in use.
   `USE_FULL_SCREEN_INTENT` is declared (`app.json:39`) and the special app
   access was granted on the Oppo in session 15, so the mechanism is in place.
   ⚠️ **There are three states, not two** — screen off / on-but-locked /
   unlocked — plus app-in-foreground as a fourth path that bypasses the
   notification entirely. If it returns, record **lock state AND whether the app
   was in front** before touching the phone. Only `unlocked + app in front +
   banner only + no ring screen` is a real `CallOverlay` bug.

⚠️ **Priority 3 (strip the debug code) is now unblocked by Priority 1 — but do
not strip yet.** Items 1 and 2 above are unexplained failures on the Oppo, and the
strip plus the kiosk console are the only diagnostic surfaces that exist. Strip
after a clean session with no recurrence, not because Priority 1 went green.

### Working Accept/Decline during the connect (new, needs an Android build)

Reported on the Oppo: "the Yap Family screen comes up and the connecting spin
wheel stays on for about 5 sec — how do we make it go straight to the
Accept/Reject icons". That spinner is `IncomingCallPlaceholder`, covering the
token fetch + `connectUser()` + `onRingingCall()` chain. Session 20 measured that
chain at ~2s; the Oppo is showing ~5s. It is paid on **every** call because the
app exits after each one.

The cover had no buttons by deliberate design (session 18): no call object yet, so
they would be dead, and a dead button on an incoming call is worse than none. The
dead-button premise is right, the conclusion was not — **a press does not have to
act immediately, it only has to be remembered**. The call is already identified by
then: Android's FCM data message carries `call_cid`, iOS's Bark deep link carries
`cid`.

New `src/callIntent.js` banks the press; `IncomingCallScreen` consumes it in a
`useLayoutEffect` on mount and runs `accept()` or `decline()` immediately. Cover
now renders the real button row, copied from `IncomingCallScreen`'s styles.

- `useLayoutEffect`, not `useEffect` — same commit as the first render, so live
  buttons never paint for a frame under a thumb that has already chosen.
- The intent is **not** seeded into `busy`: `busy` is the double-press guard both
  `accept()` and `decline()` check, so pre-setting it would silently drop the
  banked press. Both set `busy` synchronously before their first await, so the
  first painted frame already reads `Connecting…`.
- A cid **mismatch** is never applied — that would be a different call, and
  auto-accepting it opens a camera and mic nobody agreed to. A null cid on the
  intent (push we could not read) applies to the first call inside the TTL.
- `stopRing()` fires on a cover decline: plain HTTP to our backend, no Stream
  client needed, which is why it can run that early.

⚠️ **This does not make decline reach the kiosk any faster.** Rejecting needs a
connected client, so the kiosk rings for the length of the connect either way.
What changes is that the user can answer and put the phone down instead of holding
the phone waiting for buttons.

⚠️ **Separately worth measuring: why is it 5s and not the ~2s of session 20?** The
strip prints `token ok in Xms` and `connect: ok in Xms`. If the connect has
regressed, fixing that shrinks the gap for real rather than papering it. Not done.

### Bark can recall a delivered push — a "settled fact" that was wrong

⚠️ **Sessions 21 and 22 recorded that a delivered Critical Alert cannot be
recalled "because we don't control Bark". Bark exposes exactly that control.**
The claim was written into TODO.md, `streamVideo.js` and `calendar_backend.py`,
and was load-bearing in the suppression design argument. All three are corrected.

Bark's `id` parameter: a later push with the **same id replaces** the delivered
notification. `id` + `delete=1` removes it entirely (needs Background App Refresh).
Requires Bark v1.5.2 / bark-server v2.2.5+.

**Tested end to end on Kath's phone, 2026-07-26:**

| sent | result |
|---|---|
| ring push, `level=critical call=1 id=misscall-test` | rang continuously |
| same `id`, `title='Missed call' level=passive`, 10s later | **one** notification, replaced, **and the ring stopped** |

The ring stopping is the bigger find and is **not yet used anywhere**: it means a
stray Bark ring over a live call could be killed remotely instead of muting the
call until someone swipes it. That is the session-21 audio-session bug, and this
is a possible fix for it. Not attempted.

⚠️ **The suppression design was deliberately NOT changed.** Recall is a repair,
not a licence to ring first and cancel later: it costs a second round trip to a
third-party relay, and the failure it would have to cover is a Critical Alert
holding the iOS audio session and muting a live call. Hold-and-wait-for-evidence
still wins. Don't re-litigate this from the recall finding alone.

To re-run the test, the Bark key is recoverable from this repo's own git history
(`git show dd498d4`, `git show e66e771` — 22 chars, starts `hMct2EY`). ⚠️ In
PowerShell, `(...)[0]` on a single string indexes its **characters** — wrap the
pipeline in `@(...)` or you send a one-character device key and Bark replies with
a misleading `failed to get [h] device token`.

### Missed-call notifications (new, both platforms, needs testing)

Reported: nothing on Android when a call is missed, and on iOS the Bark ring just
sits there — two stacked criticals reading "Yap Family calling / Tap to answer",
54 minutes and 1 hour old, both offering to answer calls that were long over.

**iOS — kiosk `8209352`, pushed and DEPLOYED to Vercel.** Ring push now carries
`id: yapcall-<callId>`; `notifyCalleeMissed()` pushes again on that id with
"Missed call / Yap Family called at <time>", passive, no `call=1`, and **no
`url`** (the ring push deep-links into the call, and tapping a missed-call note
must not try to join a dead one).

⚠️ **`stopBackendRing()` must run FIRST, and the order is not cosmetic.** The
backend re-evaluates the held push against the phone's heartbeats and
deliberately "rings late" when they stop — and cancelling from the kiosk is what
stops them. Send the note first and the late ring lands on top of it, putting
"Yap Family calling" back on the lock screen for a call that is over, which is
the exact bug being fixed.

**Android — companion `f746e73`, pushed, needs the build.** New
`src/missedCall.js`, posted from the one place in `CallOverlay` that already
detects a call screen going away, and posted **before** `returnToAndroidHome()`
backgrounds the app. Own notification channel so it cannot ring.
`POST_NOTIFICATIONS` added to the Android permission request (required on 13+).
`trigger: { channelId }` is the immediate-delivery form that names a channel —
checked against the Expo SDK 56 docs, not assumed.

**"Missed" is decided by elimination on both sides**: answered if anyone joined
or Accept was pressed, declined on either decline path, otherwise it rang out. A
decline produces nothing — they saw it and said no.

⚠️ expo-notifications returns to the companion after `7873da9` removed it. Not a
regression of that commit: the removed one fired *while* a call was ringing and
raced Bark; this one fires only after a call has ended, on the platform Bark
never touches.

### Still outstanding from session 22

**Priority 2 — the iOS build.** Not touched this session. A `7873da9` iOS build
was running when session 22 ended; it still needs installing on Kath's phone and
confirming that only Bark arrives (answer, hang up, lock the phone immediately,
call again).

⚠️ **`gh` CLI is not installed on this PC.** Builds must be dispatched from
`https://github.com/aslyap/yap-family-companion/actions` in a browser, and their
status cannot be polled from the session.

---

## Session 23 kickoff prompt (completed — see outcomes above)

**iOS calling is finished. Android is the whole job now.**

Read this file and the memory index first.
Companion `main` at `3d400c0`. Kiosk `main` at `078c781`, **deployed to Fly and
verified** (`/health` 200, `/api/ring/stop` → `{"ok":true}`).

Session 22 verified everything session 21 left open and fixed the two cosmetic
items on top of it. Nothing about iOS calling is outstanding except installing a
build that is already pushed. **Do not re-open iOS unless a test says to.**

### Priority 1 — Android

⚠️ **Corrected session 23: the last Android build was `07a124a`, not `43a9261`**
(`43a9261` is an ancestor of it). The only code commits after `07a124a` are
`720afaf` (the `camState()` diagnostic in `IncomingCallScreen`) and `7873da9`
(both hunks behind `Platform.OS === 'ios'`). **Nothing functional has changed for
Android since its last build** — the four tests below can be run on the APK
already on the Oppo. Do not spend 25 minutes rebuilding to test them.

The stale text follows, kept for the reasoning about what to test:
Bark and `camera_facing` are the only things that don't apply — Bark is iOS-only,
and Android's camera was never reported wrong (worth one glance anyway now that
the call type says `front`; it applies to both platforms).

Build `build-android.yml`, install on the Oppo, and test in this order:

1. **Decline.** Open and unretested for **three** sessions — reported broken, then
   the client and publish paths were both rewritten underneath it. Decline on the
   phone must end the kiosk call.
2. **Cold-start ring.** Force-kill the app, screen off, call. It must ring.
3. **Accept, and the b24bb7b guard.** Accept from the app's own screen. Watch for
   the ring screen flapping back after JOINING — that was the iOS bug and the fix
   is platform-independent.
4. **Return home.** The call ends → the phone drops to the Android launcher.

The strip is still in the build; read it before theorising.

### Priority 2 — one iOS build, already running

**Companion `7873da9`** removes the duplicate "Yap Family is calling"
notification on iOS. An iOS build was **running when session 22 ended** — install
it and confirm only Bark arrives now. Reproduce with: answer, hang up, lock the
phone immediately, call again. Before the fix that gave a quiet "Yap Family is
calling" banner instantly and Bark ~5s later; after it, Bark only.

The backend is done: `a6cddca` is **deployed to Fly and verified**, so the log now
reads `[ring] bark sending now` before the push and `[ring] bark accepted, relay
took Nms` after, instead of one line whose timestamp was the relay round trip.

### Priority 3 — strip the debug code

iOS calling is signed off. Remove:
- `src/callTrace.js`, `src/debugLog.js`, and their calls
- `IncomingCallScreen.js`: the `camState()` helper and its five `cam@` call sites
  (added session 22 — they did their job)
- `App.js`: `SHOW_CALL_DEBUG`, `BUILD_TAG`, `CallDebugStrip`, `WaitedSeconds`,
  `DebugLogLines`, `styles.debugStrip`, the no-client strip
- `streamClient.js`: the `connect:` / `token ok` / `[sdk]` lines and `sdkLogger`
- `src/services/callReceiveTrace.js` on the kiosk, and its call in
  `VideoCallOverlay.jsx`
- kiosk `IncomingCallOverlay.jsx` `[IncomingCall]` logs, and
  `VideoCallOverlay.jsx`'s `call.on('all')` + `[call] poll —` line

Also now redundant and removable with it: `IncomingCallScreen`'s two
`selectDirection('front')` calls and the post-join re-assert. The call type opens
the front camera now, and those calls provably never moved the hardware.

**Keep:** `withTimeout` around `join()`, the kiosk's rejection poll itself,
`[call] watching this call:`, the kiosk `[mic]`/`[cam]` lines, `[bark]`/`[ring]`
lines, `src/acceptState.js`, `src/publishTuning.js`, `src/ringHeartbeat.js`, and
the `settings_override` block in the kiosk's `startCall()`.

⚠️ Don't strip until Priority 1 passes — the strip is the only diagnostic surface
the Oppo has.

### Priority 4 — the leftovers

- **Target Resolution is 2160p** on the `default` call type. Every capture reading
  is `2160x3840` while the call actually publishes `720x1280`, so the phone
  captures 4K and throws most of it away. Raised in session 22 and deliberately
  **not** changed — it was not the variable under test.

  ⚠️ **The 720p publish is an accident.** `selectDirection`'s
  `applyConstraints({facingMode})` passes no width/height, and
  react-native-webrtc's `normalizeMediaConstraints` defaults them to 1280x720.
  Strip those `selectDirection` calls (Priority 3) and the publish may jump to
  4K on its own. **Measure before and after, and don't strip and ship in one
  step.**

  **Recommendation: 1920x1080, set deliberately** in the kiosk's
  `settings_override`. Reasoning, so it isn't re-argued from scratch:
  - The kiosk monitor is **3840x2160**, and the phone's video is full-screen. The
    video is portrait, so it pillarboxes and only the monitor's *vertical* pixels
    matter — 2160 of them. So unlike a 1080p screen, this display genuinely could
    consume a 2160-tall source. The screen is not the limit.
  - The network probably is, but **the ceiling has never been measured**. Session
    21 read `Δ5410kbps` at +46s and it was **still climbing** — that is where the
    ramp had reached, not a plateau. 4K30 wants ~20–25Mbps on H.264.
  - The downside of over-reaching is not softness, it is a slideshow: session 21's
    whole "slow video" bug was resolution outrunning bitrate (2.8fps at
    720x1280/185kbps). `publishTuning.js` already starts at half the max bitrate
    by design, so the cliff is closer than it looks.
  - **Kath overseas is the real use case** and will never have 20Mbps. Whatever is
    set here applies to every call.
  - The phone pays in heat — iOS throttles capture framerate under thermal
    pressure, and 4K encode on a video call is what triggers it.

  So: 1080p is a real gain over today's accidental 720p with no cliff. **2160p
  only becomes defensible after a long call shows the bitrate plateauing well
  above 20Mbps** — measure it from the kiosk's `[rx]` samples before touching it.
- **Kiosk never drops finished calls.** `useCalls()` climbed 1 → 2 → 3 → 4 across
  one session. Real, and untouched. The byte counters said it was NOT what
  starved the slow calls, so it is a tidiness/leak issue, not the video bug.
- **Kiosk calls `join()` twice** on one call object (error suppressed).
- Beelink music server down ⇒ `24a7119`'s call-time audio-output switch fails
  (`localhost:5004/audio-output` ERR_CONNECTION_REFUSED in every console dump).
- Retire Yap Dad Companion (`..\yap-dad-companion`).

---

## Session 22 outcomes (2026-07-26)

### Everything session 21 left open is verified on device

| Fix | Evidence |
|---|---|
| `a345bb3` bitrate ramp | "Slow video is fixed. Works well" — first call, no ramp |
| `cd45317`/`9c925c0` Bark suppression | App unlocked and open: **no Bark at all**, call connects |
| the suppression's fail-safe | Phone locked: Bark rings normally. **This must never regress** |
| Fly log confirmation | `holding push for 1200ms` → `suppressed, phone is ringing on screen` |

### The iPhone was filmed by its own back camera — fixed at the call type

Not an app bug at all. The strip named it on a line written **before any app code
ran**:

```
cam@enabled  dir=back  fm=environment  dev=…ideo:0  2160x3840
```

`applyDeviceConfig` does `settings.camera_facing === 'front' ? 'front' : 'back'`,
so anything short of an explicit `front` is back. **The Stream dashboard does not
expose `camera_facing`** — only Video, Camera Enabled by Default, Allow Camera
Permission Request and Target Resolution — but the API takes it, so the kiosk now
sets it in `getOrCreate` via `settings_override` (`078c781`). Kiosk-side: **no app
build was needed**.

Verified: `cam@enabled dir=front fm=user dev=…ideo:1`, the device id moved from
`…ideo:0`, face on screen, and the rotate button now flips on **one** press.

**Why switching afterwards could never work.** `selectDirection('front')` ran
twice per call and both resolved without error while the rear camera stayed live.
On React Native it is `applyConstraints({facingMode})` against the **live** capture
session, and the strip caught the first one landing on `NO TRACK` — the stream was
mid-restart, so it set the SDK's direction to `front` and touched no hardware.
That is also the two-press rotate button: `flip()` toggles from the SDK's tracked
direction, so the first press only corrected the bookkeeping. `select(deviceId)`
is not a fallback — it throws "not supported in React Native".

⚠️ **`settings_override` REPLACES a settings block, it does not merge into it.**
This broke every call twice in a row before it was understood:

| sent | result |
|---|---|
| `camera_facing` only | `target_resolution` 0x0 → `GetOrCreateCall` rejected every call |
| `+ target_resolution` | `enabled`/`camera_default_on` false → phone joined audio-only, `[sdk] Camera init failed — No permission to publish VIDEO`, `me pub=A-` |
| `+ enabled, camera_default_on, access_request_enabled` | works |

That block is now a **copy of dashboard state**. Edit the call type in the
dashboard and you must edit `startCall()` to match, or it silently overrides it.

### The duplicate iOS notification (`7873da9`, pushed, needs a build)

iOS was getting two alerts per call: the app's own local notification ("Yap Family
is calling — tap to open"), then Bark ~5s later. The local one is in-process and
instant; Bark is 1.2s of hold plus the api.day.app relay plus APNs.

It never added reach — its guard was `appState !== 'active'`, which is exactly
when the backend sends Bark too, so it only ever fired alongside one, and as an
ordinary notification it is silent on silent mode. And it could break the call it
announced: tap the early banner, answer, and Bark arrives seconds later and rings
over the live call, holding the iOS audio session. That is `cd45317`'s failure via
a different route. Removed, along with the now-pointless iOS notification
permission request.

⚠️ Accepted cost: if a Bark push is ever rejected outright there is now **no**
second alert. `[ring] bark rejected` in the Fly log is the thing to watch.

### Instrument lessons (this is now the third session running)

1. **`[ring] bark sent` was printing the api.day.app round trip, not the send.**
   The log read `holding push for 1200ms` at 09:40:04 and `bark sent` at 09:40:24
   and looked like a 20-second delay in our own code. Bark's reply carried
   `timestamp=1785058806` — 09:40:06 — so the push left on schedule. A whole
   theory was built and discarded on that. Fixed in `a6cddca` (**needs a Fly
   deploy**): it now logs before the POST and times the relay separately.
2. **`track.getSettings().facingMode` lied.** At `settled10s` both the SDK's state
   and iOS's own capture-controller flag said `fm=user` while the room was on
   screen. It reports `usingFrontCamera`, a flag — not which device the capture
   session is actually running. The **device id** (`…ideo:0` vs `…ideo:1`) and the
   resolution were the honest fields.
3. A wrong theory was published to the user mid-session and retracted after
   reading the log. That is the process working — but check the log *first*.

---

## Session 21 outcomes (2026-07-26)

### Three inherited "facts" that were wrong

1. **"iOS second calls are broken."** No. A *first* call failed and a *second*
   call worked, in the same session. The real variable is whether the SDK's
   `doJoin` succeeds on its first attempt — it retries intermittently, which
   session 20 had already noted but nobody had connected to the symptom. Stop
   treating call ordinal as the variable.
2. **"The iPhone's video reaching the kiosk is a kiosk-side receive or bandwidth
   problem."** No. `rtt=4ms`, audio flowing normally on the same connection,
   subscriptions correct. The kiosk was fine; the phone was publishing at
   300kbps.
3. **"The phone's audio is dead."** No — twice. Once it was the instrument (see
   below), and once it was a quiet room: Opus sends almost nothing on silence, so
   `bytes=100` flat meant nobody was talking. Confirmed by talking for 40s:
   `Δ130kbps` steady, `jbuf≈100ms`.

### The headline finds

**Bark's ring holds the iOS audio session and mutes the call BOTH WAYS.**
Controlled comparison, same call, one variable:

| answered via | Bark after | audio |
|---|---|---|
| tapping Bark | dismissed by the tap | ✅ both ways |
| the app's own screen | still ringing | ❌ dead both ways, `int=A-` |

Swiping the notification away restored audio instantly at 65kbps. `int=A-` is
AUDIO in `interruptedTracks` — an OS-level audio-session interruption. This is
the real explanation for "sound is 5/10 seconds delayed", reported since the
start of the session and blamed on the network for weeks. Fixed by `cd45317` /
`9c925c0`.

**The video "slowness" is a 20-30 second bitrate ramp, not a steady state.**

```
+11s  Δ12.8fps  Δ292kbps   jbuf=88ms
+21s  Δ30.4fps  Δ778kbps
+31s  Δ31.2fps  Δ1722kbps  jbuf=51ms
+46s  Δ30.0fps  Δ5410kbps  jbuf=2ms
```

The first sample is **292kbps** and the SDK's documented default start bitrate is
**300kbps**. Every call began at 300kbps and rediscovered a link that sustains
5.4Mbps at rtt=4ms. Framerate is what collapsed because the resolution stays
pinned at 720x1280 the whole way up — 2.8fps is what 720x1280 looks like at
185kbps. Fixed by `a345bb3`. ⚠️ Dropping the resolution was proposed and
**rejected** — it trades a permanent quality loss for a transient problem.

**The SDK logger had never worked.** `new StreamVideoClient({apiKey, logLevel,
logger})` — the constructor reads options from `apiKeyOrArgs.options`
(index.es.js:17880), so top-level `logLevel`/`logger` were ignored and every SDK
warning went to a console neither phone can produce. `138c24a` had produced
exactly zero lines. Nesting them under `options` (`1a1e36e`) fixed it, and
`[sdk]` lines now appear on the strip. **The absence of `[sdk] Failed to join
call` was nearly read as evidence the join didn't throw** — a fourth wrong theory
built on a broken instrument, caught only by reading the constructor.

### Verified on device (build `b24bb7b`)

| Fix | Evidence |
|---|---|
| `c1d92d8` resume | `resume: 73s bg, keeping client (calls=1)`, ring screen appeared |
| `c2eb17d` repeat Bark tap | `deeplink: already have … (ringing)` |
| `c2eb17d` camera front | `cam front re-asserted 2813ms` |
| `f4432c6` mic detail | `status=enabled [live muted=false enabled=true]` |
| `42a0155` token/connect | `token ok in 101ms`, `connect: ok in 631ms` |
| `b24bb7b` accept guard | accepted from the app screen, `joined ok in 2448ms`, no flap |
| `1a1e36e` SDK logger | `[sdk] [SfuStatsReporter]: …` — first ever `[sdk]` line |

### `b24bb7b` — the bug behind "if she taps Accept in the app, the call fails"

`join()` retries internally and a failed attempt **restores the previous calling
state**, so a joining call drops back to RINGING (measured: `joining +13ms` →
`ringing +6575ms`). `CallOverlay` matched JOINING/JOINED as active and
RINGING/IDLE as incoming, so the flap swapped `ActiveCallScreen` back to
`IncomingCallScreen` — a **remount**, which reset the `busy` flag and re-armed
Accept on a call already mid-join. Tapping it called `join()` twice and the SDK
threw `Illegal State: call.join() shall be called only once`, killing a call that
would have succeeded.

Also found in the same trace: **RECONNECTING matched neither filter**, so the
overlay rendered nothing at all — the call screen vanished mid-answer and the
app's Home tab appeared. That is almost certainly the "sometimes it doesn't
connect at all" report. RECONNECTING and MIGRATING are now active states.

### Instrument lessons (this keeps happening — read this)

Three separate wrong conclusions this session, all from the instrument:

1. **`[sdk]` silence** meant the logger was never installed, not that the SDK
   logged nothing.
2. **`NO inbound-rtp streams` at +6s/+15s** meant the sampling window closed
   before the phone published, not that the call was dead. Those two timings were
   copied from the phone's `callTrace.js`, where they bracket a ~1s join.
   `callReceiveTrace.js` now samples every 5s to 60s.
3. **"The phone's audio is dead"** came from deltas keyed on array position while
   the SFU had replaced the audio SSRC — the tell was `lost` going 14 → 0, and a
   cumulative counter cannot decrease. Now keyed on SSRC, and the SSRC is printed.

Also: **30fps decoded means smooth, not current.** A stream can decode a perfect
30fps while every frame is seconds old. `jitterBufferDelay` is what measures
lateness, and it was missing until `49ceb70`.

### The Bark suppression design, and why it is shaped this way

A second opinion argued for the opposite design — suppress the app's own ring
screen and make Bark the exclusive ingress. **Rejected**, for reasons worth
keeping:
- Bark's notification has exactly one action, so Bark-only ingress leaves **no
  way to decline** a call.
- It requires Bark-tap to mean auto-answer, i.e. an accidental tap on a lock
  screen opens a live camera and microphone into the room.
- It preserves the extra tap in every case, which was the original complaint.

Two of its technical points **were** decisive and are settled:
- **Stream presence is unsafe as a suppression signal.** iOS freezes a
  backgrounded app without closing its socket, so presence stays stale for tens
  of seconds. Independently confirmed here: the coordinator WS died with code
  1006 only well after backgrounding.
- **A delivered Critical Alert cannot be recalled** without the host app's
  cooperation, and we don't control Bark.

Hence: hold, wait for positive evidence, and fail towards ringing.

---

## Session 20 outcomes (2026-07-26)

### The headline: the bug this file was built around does not exist

`src/callTrace.js` writes an unconditional snapshot of every participant's
published/subscribed tracks at **+6s and +15s** after joining. On iOS:

```
#1 settled  +6004ms | family-hub pub=AV sub=av a[live muted=false] v[live muted=false] | me pub=AV
#2 settled  +6004ms | family-hub pub=AV sub=av a[live muted=false] v[live muted=false] | me pub=AV
```

Call 2 is as healthy as call 1 — subscribed to both tracks, nothing muted, both
ends publishing. Android reads identically. **The elimination table in the
session 20 kickoff was answering a question with no failure behind it.**

### Five real bugs, all found from strip readings

| Commit | Bug |
|---|---|
| `894e3c1` | Media waited for `join()` to *resolve*, not for JOINED |
| `42a0155` | Token retry budget (42s) nested inside the connect timeout (20s) |
| `c2eb17d` | Deep-link URL in a ref, never consumed on a repeat tap |
| `c2eb17d` | Camera direction overwritten by the SDK after JOINED |
| `c1d92d8` | Resume reconnect destroyed the client holding the call |

**`894e3c1` — publish at JOINED.** `state joined +2243ms` / `accept: joined ok in
10579ms`: `join()` reached JOINED and kept running for another **8.3s** (13.9s on
iOS), inside `doJoin`'s `initPublisherAndSubscriber()` and `applyDeviceConfig()`.
Camera/mic were enabled after `await join()`, so the phone sat connected and
publishing nothing for that whole tail — the kiosk showed an avatar. On one call
the tail outlived the call and `camera.enable()` threw `InvalidStateError` against
a call that had already left, which read as a camera bug. ⚠️ `callingx` is NOT
this hang, contrary to the obvious session-17 guess: `Call.join` awaits
`callingX.joinCall` **before** `setup()`/`doJoin()`, and JOINING was reached at
+11ms.

**`42a0155` — nested timeouts.** 3 token attempts × 12s plus 2s+4s backoff is a
42s budget inside `CONNECT_TIMEOUT_MS` of 20s, so on a slow radio the outer
timeout always fired mid-retry, tore the client down, and the replacement
restarted the token sequence from scratch — a loop that cannot converge. Now
2 × 8s + 2s = 18s.

**`c2eb17d` — the repeat Bark tap.** From call 2 onward the app is already open,
so the ring screen appears by itself *and* Bark fires (the kiosk cannot cancel a
Bark push). The deep-link URL went into a `useRef` consumed by an effect keyed on
`[readyClient]` alone, so it was only ever read when the client *changed* — once,
on the cold start it was written for. A second tap stored a URL nothing consumed:
the guard never ran, `clearCallPending()` never ran, and `IncomingCallPlaceholder`
sat over the real call screen for its full 25s TTL. **The Accept/Decline buttons
were underneath the cover the whole time.** Measured at 33.8s. Now state, wrapped
in an object so two taps on one call count as two arrivals.

**`c2eb17d` — camera direction.** A regression from `894e3c1`: `doJoin` awaits
`applyDeviceConfig(settings)` *after* setting JOINED, and that applies the call
type's default camera facing, overwriting our `selectDirection('front')`. Now
re-asserted once `join()` returns.

**`c1d92d8` — resume ate the call.** `#2 call seen by=family-hub` at 33:03.223,
`resume: reconnecting after 48s bg` at 33:03.934: 711ms later the handler
destroyed the client that had just delivered the call, and the call object went
with it. Structural, not a threshold to tune — being woken *by* an incoming call
**is** the long-background case, so the >30s rule was guaranteed to fire on the
calls it must not touch. And a client that just delivered a call has already
proven its WebSocket alive, which is all the reconnect was checking.

### Measurements worth keeping

- **Ring → Accept/Decline on Android is ~2s of client connect**, not the debug
  overlay. Every call pays it because the app exits after each call.
- **Backend token endpoint: 29ms from a desk PC** (measured 3×). Any slow token
  fetch is the phone's radio, never a Fly cold boot.
- **`join()` is ~1s when healthy** (`joined ok in 1121ms`), and the tail after
  JOINED is the variable part.
- The SDK's own join retries are **intermittent, not per-call**: one reading
  showed `joining → ringing → joining → ringing → joining → joined` over 7.3s
  (two failed `doJoin` attempts, after which the SDK sets `migrating_from` and
  moves SFU); later readings joined cleanly in ~1s.

### ⚠️ Three of my own misreadings, recorded so they are not repeated

1. **"The phone never subscribes to video."** Wrong — `sub=a- (last)` was
   `traceCall`'s own line cap stopping the trace 1.7s in, while the phone was
   visibly rendering the kiosk's video in the same photograph.
2. **"The kiosk's audio arrives dead"** (`a[live muted=true] int=A-`). Same cause:
   the first ~1.5s of a call that then came up fine.
3. **"callingx is intercepting `join()` on Android."** Formed and killed within
   one tool call by reading `Call.join` — it awaits `callingX.joinCall` before
   `doJoin`, and JOINING was reached at +11ms.

All three came from the same mistake: **a cap that counts emissions truncates the
evidence**, because remote `muted` flaps. The fix is in the file now — changes are
logged on the coarse shape only, and the settled state is logged unconditionally
on a timer.

### Instrumentation added (remove with the strip)

- `src/callTrace.js` — `callSeq()` (process-lifetime `#N` per call, assigned on
  first sighting so a ring-only call still consumes a number) and `traceCall()`
  (`participants$` subscribed **directly**, started before `join()`, disposed on
  `left` — *not* `idle`, because `callingState$` is a BehaviorSubject and a call
  recovered by `queryCalls` is still `idle` at that point).
- `streamClient.js` — `connect: start` / `token ok in Xms` / `connect: ok in Xms`
  / `connect FAILED`, plus the SDK's own warn/error routed to the strip
  (filtered, deduped, capped at 10).
- `App.js` — the no-client strip ticks `waited=Ns` and shows the debugLog tail;
  `CallDebugStrip` now renders **over** the call screens (`pointerEvents="none"`).
- `IncomingCallScreen.js` — `mic ok … status=… [readyState muted= enabled=]`, not
  a bare promise resolution.

### Settled — do NOT re-litigate

- **iOS call 2 is not broken at the media level.** Proven by the settled
  snapshots, both platforms.
- **`call.rejected` is never delivered to the kiosk.** Measured, session 18. The
  kiosk polls `session.rejected_by` instead.
- **Unlock-to-answer on iOS needs a paid Apple account** ($99/yr, declined).
- **Call ends → app stays open on iOS** is normal; only Android returns home, and
  it does so by killing its own process.
- **Stay on GitHub Actions, not EAS.** Public repo ⇒ free unlimited minutes incl.
  `macos-15`; `build-ios.yml` archives **unsigned**, which is what SideStore needs.
- **The desk KVM is not connected to the Beelink.**
- **`localhost:5004` errors are two different things**: `/health` is the music
  server (unrelated), `/audio-output` is the call-time speaker switch.

### Traps (these keep biting)

- **Evidence before theories** — but also: *check the instrument before trusting
  the evidence*. Session 20's three wrong readings were all the instrument
  truncating, not the app misbehaving.
- **A change-triggered log cannot report a state that never changes.** If the
  kiosk's audio never unmutes, nothing changes, so nothing is logged, and silence
  looks identical to not-being-watched. Timed snapshots, not just diffs.
- **Confirm which build a reading came from.** The `#N` prefix does this on the
  phone; the bundle filename (`index-XXXX.js`) does it on the kiosk. Both caught
  a stale build this session.
- A kiosk change needs a push AND a Vercel deploy; **env-var changes need a REDEPLOY**.
- **Never `.catch(() => {})`.** Another one found and removed this session, on the
  resume path.
- Neither phone produces logs — the strip and the kiosk console are the only surfaces.
- **Windows lists each audio device three times** — real plus `Default - …` and
  `Communications - …` aliases. Bind to the real one.
- **Test hardware differs**: confirm whether a kiosk reading came from the Beelink
  or the upstairs PC — device names differ.
- Calling Adrian exercises **zero Bark code** (kiosk maps only `kath`), so it
  cannot test the deep-link path. PowerShell 5.1 mangles emoji. Don't test chat
  (burns the family's daily budget).
- The Beelink's touchscreen died at the Windows lock screen mid-session (password
  `2909`, no keyboard attached). Reseat the display's USB cable or attach a keyboard.

---

### Session 19 outcomes (2026-07-25)

**Kiosk mic was the wrong device — fixed, confirmed on device (`11c6b6e`, `f6fef51`).**
Android surfaced it: the kiosk could hear the phone, the phone could hear nothing.
`call.microphone.enable().catch(() => {})` — a bare catch on the one path that
explains a silent call, right next to a camera path that enumerates devices, selects
explicitly and verifies the resulting track. Replaced with the same treatment. The
mic then proved *healthy* (`live muted: false enabled: true`), so the swallowed error
was not the bug — but the device was: Windows offers `Default - …` and
`Communications - …` aliases alongside real devices, the selector matched an alias,
and the call bound to a Windows preference instead of a microphone. Now prefers the
Baseus Inspire XH1, falls back to eMeet/C960/BRIO, and never selects an alias.

**Camera pointed at the floor — fixed, unverified (`facb8b3`).** `call.camera.flip()`
is a *toggle*, added in `5c7caff` to reach the front camera from a call that opened
on the back one. The iPhone already opens front-facing, so the flip turned it away
from Kath. Now `selectDirection('front')`, which is absolute, in both
`IncomingCallScreen`'s accept and `HomeTab`'s outgoing call.

**iOS placeholder / deep link — VERIFIED (`bbf55b7`, `1bc7734`).** Bark tap → the call
screen appears immediately, no app Home tab. The strip read `onRingingCall ok` and
`accept: joined ok in 1920ms` (`ringing +0ms → joining +8ms → joined +892ms`). iOS
first-call calling is complete end to end.

**iOS second call — root cause NOT found**, but the search space is now small; see
Priority 1 for the full elimination table. The single most useful finding: the kiosk
sees the phone's video while the phone sees nothing, so this is a *receive*-side
failure on a phone that is otherwise joined and publishing normally.

**Not done: the debug-code strip.** Deliberate — see Priority 4.

---

## Earlier sessions

### Session 18 outcomes (2026-07-25)

**Android return-home — VERIFIED.** `f9a5233`'s `BackHandler.exitApp()` works; the
phone drops to the Android launcher when a call ends. Priority 1 of session 18 is
closed. (Not explicitly confirmed as a force-killed cold start, but the app's Home
tab flashed on arrival, which only happens on a launch.)

**iOS Bark delay — fixed, kiosk-side (`c732d2f`).** `notifyCallee()` was the *last*
statement in `startCall()`, so Kath's phone could not ring until the kiosk had
finished mic enable, device enumeration, camera select, camera enable, a 300ms
settle, `applyConstraints` + `grabFrame` and `await call.join()` — all of it the
kiosk wrestling its own webcam, none of it anything the callee needs. Moved to
immediately after `getOrCreate()`, which is its only real prerequisite. Confirmed
quick on device.

**App-Home-screen flash before the call screen — fixed, unverified (`bbf55b7`,
`1bc7734`).** Structural, not a timing tweak: the ring screen needs a call object →
`onRingingCall` → a connected client → a token fetch, and `StreamWrapper` renders
`AppNavigator` for that entire chain, so no call-state matching can cover it. What
*is* known early is that a call is coming — the FCM data message (Android) and the
Bark deep link (iOS). New `src/pendingCall.js` holds that signal;
`IncomingCallPlaceholder` renders a copy of `IncomingCallScreen`'s shell so the
buttons simply appear rather than the screen changing. 25s TTL, cleared on a real
call screen or a failed `onRingingCall`. `1bc7734` then moved the deep-link listener
out of `init()` to mount level — it had only started listening *after* the client
connected, i.e. after the delay it was meant to cover.

**Decline not ending the kiosk call — root-caused, TWO separate bugs.**

1. **The kiosk was not watching its own calls (`2e9ffeb`).** `getOrCreate()` and
   `join()` set a call's `watching` flag **only if
   `streamClient._hasConnectionID()` is already true**, and nothing ever retries it
   (video-client `index.es.js:14223`, `:14751`). Passing `user` to the
   `StreamVideoClient` constructor makes it call `connectUser()` **unawaited**
   (`:17900`), and the kiosk called `startCall()` immediately — so whenever
   `getOrCreate` lost the race with the WebSocket handshake, the kiosk received
   **no server events for that call's entire life**. The SFU connection is separate,
   so the call still connected and the camera still worked, which is why this read
   as a flaky decline rather than a connection bug. Proven with `call.on('all')`: a
   failed decline logged only locally-generated `mic.capture_report`. Fixed by
   connecting explicitly and awaiting it in `startCall()`; a failed connect clears
   the cached promise rather than caching the rejection (the session-14 trap).
2. **`call.rejected` is never delivered even so (`069cf63`, `8080e90`).** With
   `watching: true` and `call.session_participant_count_updated` arriving on the
   same socket, a decline returning a real 200 still produced no `call.rejected`.
   The kiosk now polls `call.get()` while the call is unanswered and ends it when
   the callee appears in `session.rejected_by` — which read `['adrian']` on the
   *first* poll, confirming the server knew all along. Immediate first poll then
   every 1s.
3. **The phone also ends the call itself (`6f2a797`).** `reject()` stays for the
   semantics; `endCall()` after it actually terminates the call, the same call the
   hangup path makes. `call.session_ended` *is* delivered reliably, so this is the
   instant path and the poll is the backstop. Unverified on device — the build was
   still running.

⚠️ **Sequencing note for whoever reads the git log:** `c06add8` and `e5a7a88` are
diagnostic-only commits, and `2e9ffeb` was a real bug fix that did **not** fix the
reported symptom. Don't read "three commits for one decline bug" as thrashing —
they were three different findings.

---

### Session 17 outcomes (2026-07-25)

**iOS Accept delay — root-caused, fixed (`cb76047`) and VERIFIED ON DEVICE.**
Accept is fast, the 5s plateau is gone, and iOS calling is now signed off end to
end: Bark ring → tap → app opens to the call → accept connects promptly → decline
and hangup both end the kiosk call. Nothing iOS-side is outstanding.

The strip measured it: a successful accept sat in `ringing` for **5012ms**, then
reached JOINING and connected to the SFU in **946ms**. 5012 is
`AUDIO_SESSION_TIMEOUT_MS = 5000` to the millisecond.

`StreamVideoRN.setPushConfig` calls `callingx.setup()` **unconditionally**, so
`CallingxModule.isSetup` was true on iOS, which routes `call.join()` through the
CallKit path *before* the join flow starts: `displayIncomingCall()` (no timeout) →
`answerIncomingCall()` (no timeout) → `waitForAudioSessionActivation()` (5000ms
timeout). That last resolves early only on CallKit's `didActivateAudioSession`,
which **cannot fire on the free SideStore cert** (no `aps-environment` ⇒ no
PushKit/CallKit). The known iOS constraint had a consequence nobody had traced:
the app still *asked* for CallKit on every accept and paid 5s — or hung on one of
the untimed steps, which is the 30s first-attempt failure the strip caught.

Fix: call `setPushConfig` **on Android only**. iOS loses nothing (no APNs path, so
the config was Android-only in substance; iOS rings via Bark and opens by deep link
into `client.onRingingCall`). This also fixed a second bug behind the same flag:
`shouldBypassForCallKit()` skips `StreamInCallManager` on iOS whenever `isSetup` is
true, so the app claimed CallKit owned the audio session while CallKit could not
run and **nothing** configured it.

⚠️ **Two earlier explanations were wrong.** Recorded so they are not re-proposed:
(1) expo-audio's `allowsRecording:false` leaving a playback-only session
(`14882a7`); (2) "iOS join legitimately takes 10-15s" — it takes ~1s, and the 30s
timeout raised on that false premise (`8d48f84`) is what let a real hang pass as a
healthy slow join for a session. The warm-up added for theory (1) (`39a6db8`) is
removed. **WebRTC/SFU time was never the problem — it is under a second.**

**How it was found** (`4abf77f`, `5012a8b`) — worth reusing: log
`call.state.callingState$` transitions with elapsed offsets, subscribed *directly*,
not from a React effect (CallOverlay unmounts the ring screen at JOINING, exactly
when the interesting part begins). Timing only *around* an SDK call cannot tell a
pre-join hang from slow negotiation, and that ambiguity sustained both wrong
theories. Also: the warm-up had ended in `.catch(() => {})`, which would have made
"the fix didn't help" and "the fix never ran" look identical on the strip.

**Priority 3 (Bark) — CONFIRMED, no call needed.** The deployed production bundle
contains Kath's Bark key, so the Vercel env var *and* the redeploy both took. The
dispatcher is `if (barkKey[user]) → bark; else if (ntfyTopic[user]) → ntfy`, so
`kath` takes Bark and ntfy is unreachable. Only an api.day.app rejection could
still surprise us, and that would show as `[bark] push rejected` in the console.

**Android return-home — still unverified.** No Android build was made this session.

### Session 16 outcomes (2026-07-25)

**Android — confirmed working**
- Cold-start now RINGS from a killed app. Root cause was NOT the client/connect
  (the three earlier "cold-start" commits chased the wrong layer): non-Expo Android
  requires the app to register the FCM message handlers itself and forward
  `call.ring` to `firebaseDataHandler` — that was missing. Fixed `6302ae2`.
- Accept works; decline ends the kiosk call (the earlier failure was the
  stale-bundle trap). Kiosk "call.join() shall be called only once" error
  suppressed (kiosk `579b0ac`).
- Return-to-Android-home: works when the app was open; on cold-start the HOME
  intent couldn't background an activity pinned by the lockscreen flags. Switched
  to `BackHandler.exitApp()` (`f9a5233`) — **needs an Android build to verify** it
  now backgrounds on cold-start too.

**iOS — mostly working; Bark is the big change**
- Replaced ntfy with **Bark** — see [[project_bark_ios_ring]]. Loud, continuous,
  FaceTime-style ring (`multiwayinvitation`) that bypasses silent mode (Critical
  Alerts), correct "Yap Family calling" title, ONE persistent notification. Best
  achievable without a paid Apple account.
- Cold-open (tap ring → app opens to the call): recovers the exact ringing call
  from the deep-link cid via `onRingingCall` (`025b05d` + kiosk `288f24e`).
  Confirmed.
- Accept connects, decline works. (Session 16 attributed the Accept *delay* to the
  iOS audio session — wrong; see the session 17 outcomes above.)

---

## Session 16 kickoff prompt (completed — see outcomes above)

**Verify Android cold-start, then fix iPhone calling.**

Read this file and the memory index first. Session 15 fixed several things but
left two items unverified, and iPhone calling has never been tested end-to-end.

### Session 15 outcomes (2026-07-25)

| # | Item | Status |
|---|---|---|
| 7 | Hangup on phone doesn't end kiosk call | ✅ Fixed & confirmed — strip read `endCall ok` |
| — | Android black screen on incoming call | ✅ Root-caused (not a code bug) + prompt improved |
| 5 | Cold-start no-client / no ring | 🔧 Fix pushed (`13b5fc1`), **UNVERIFIED** |
| — | SideStore auto-refresh never firing | ✅ Fixed — automation now runs "Refresh All Apps" |

- **#7 hangup → fixed.** The phone `endCall()`s cleanly and the kiosk reacts. The
  end-call permission theory was wrong.
- **Android black screen** wasn't code. Android 14+ (targetSdk 35) makes
  `USE_FULL_SCREEN_INTENT` a manual "special app access" only the user can grant;
  without it the incoming-call full-screen intent is demoted to a heads-up banner,
  MainActivity never launches, and `turnScreenOn` never fires → the call rings but
  the screen stays black. Granting it on the Oppo fixed it live. Commit `a999a0e`
  improves the first-run prompt (explains exactly which toggle to flip, re-fires
  once via key bump `_v2`→`_v3`). **No app can auto-grant this — Android platform
  restriction, don't re-litigate.**
- **Cold-start no-client → fix pushed, needs a build to verify.** The strip caught
  it live on a cold start: `readyClient=no · attempt=1`, frozen. `connectUser()`
  was *hanging* (radio not up when FCM wakes the app), and the retry only fires on
  a *rejection*, so it never recovered. Commit `13b5fc1` adds a 20s connect timeout
  + 12s token-fetch abort → hang becomes rejection → retry works. Backend probed
  warm (74ms), so it's the phone radio, not a Fly cold-boot.
- **SideStore auto-refresh → fixed.** The midnight automation ran "Open App" (only
  foregrounds SideStore, never refreshes). It now runs SideStore's **"Refresh All
  Apps"** Shortcuts action, which brings up LocalDevVPN itself — no manual VPN
  wrapper needed. Manual run confirmed "all apps have been refreshed", no error.

### Priority 1 — verify the Android cold-start fix (`13b5fc1`)

Needs a fresh `build-android.yml` build installed on the Oppo. Kill the app,
screen off, call from the kiosk, watch the strip:
- `attempt=2, 3…` climbing → then ring screen appears = **FIXED**
- climbs forever, never rings = radio genuinely not coming up on wake (harder)
- stuck at `attempt=1` = the hang is outside the 20s timeout's reach

Read the strip before touching code.

### Priority 2 — fix iPhone calling (the last big gap)

Never worked end-to-end. iOS constraints are settled: no APNs/VoIP (free SideStore
cert strips `aps-environment`), so **ntfy is the only background path** — a banner,
tapped to open the app; no native call screen. The entire iOS ring depends on
`IncomingCallScreen` rendering, because `iphone_x.mp3` (expo-audio) is the *only*
sound on iOS — there is no native ring to fall back on. So iOS was silent for the
same reason Android hit the home screen: no client → no `useCalls()` → no ring
screen. The session-15 connect-timeout fix is pure JS and should help iOS too, but
iOS is woken by an **ntfy tap**, not FCM.

Build `build-ios.yml`, install **from inside SideStore** (not iloader), and test
the full flow **calling KATH** (Adrian exercises zero ntfy code — `NTFY_TOPICS`
maps only kath):
1. Kiosk "Call Mum" → ntfy banner arrives (screen off/locked is fine — delivery is proven)
2. Tap banner → app opens → **ring screen renders + `iphone_x.mp3` plays**
3. Answer → connects. Decline → kiosk call ends. Hang up → kiosk call ends.

The debug strip works on iOS too — read it if the ring screen doesn't appear.

### Priority 3 — SideStore locked-refresh reading

Morning after 2026-07-25: did the "ran" notification fire around midnight, and is
the expiry still **7 days** (refreshed while locked → fully hands-off) or **6**
(only works unlocked → retime the automation to an hour Kath's phone is unlocked)?
Then turn **"Notify When Run" OFF**. Must be redone on Kath's real phone.

### Cleanup before any build reaches Kath's phone

Do **not** ship the debug strip. Remove everything behind `SHOW_CALL_DEBUG` in
`App.js` (`CallDebugStrip`, `styles.debugStrip`, the `no client` strip in
`StreamWrapper`), plus `src/debugLog.js` and its calls in `ActiveCallScreen` /
`IncomingCallScreen`. Also unused `assets/ringtone.wav` (replaced by
`iphone_x.mp3`). Keep the strip until BOTH Android cold-start and iPhone calling
are confirmed — it is the only diagnostic surface on these phones.

Then: retire Yap Dad Companion (`..\yap-dad-companion`) once Android is verified.

### Traps (unchanged, still bite)

- Get the evidence before theorising — one debug strip settled in a single test
  what four sessions of inference could not.
- Never `.catch(() => {})` here — three bugs hid behind swallowed errors.
- A kiosk change needs a push AND a Vercel deploy before a hard refresh can test it.
- Neither phone can produce logs (no Mac for the iPhone, adb off on the Oppo) —
  the debug strip and kiosk console are the only diagnostic surfaces.
- Calling Adrian exercises ZERO ntfy code. PowerShell 5.1 mangles emoji in ntfy
  payloads. Don't test chat (burns the family's real daily budget).

---

## Status as of 2026-07-19 (session 14)

### The headline finding: the app had no Stream client at all

An on-screen debug strip (there is no other way to read state off these phones)
showed this on a cold start, on the home screen, while the kiosk was ringing:

```
no client · me=adrian · readyClient=no
```

**No client means no `useCalls()`, so `CallOverlay` never mounts and the incoming
call cannot be shown by any amount of state matching.** This is the real cause of
the cold-start failure that three sessions attributed to call *state*.

`getOrCreateClient()` cleared its `_connecting` promise **only on success**. A
failed connect left the rejected promise cached, and every later caller was
handed that same rejection — the process could never obtain a client again.

The path that trips it is exactly the one that matters: FCM wakes the app,
`index.js` calls `getOrCreateClient` as `setPushConfig`'s
`createStreamVideoClient`, racing the radio coming back up. One failure there and
the app was clientless for good — identically on iOS and Android, because it is
pure JS. That platform-independence was previously read as evidence *for* the
state hypothesis; it was really evidence for this.

Fixed in `615fd29`: clear `_connecting` in a `finally`, and retry `init()` with
backoff instead of logging once and giving up.

⚠️ **`90efe16` (the IDLE fix) was a hypothesis, was shipped, and did not work.**
It is still in the tree and is probably harmless, but it was never the bug. The
lesson is the one already in this file: a well-supported theory that cannot be
observed is still a theory. One debug strip settled in a single test what four
sessions of inference could not.

---

### Session 14 results

| # | Symptom | Status |
|---|---|---|
| 1 | Android played `iphone_x.mp3` over the native ring | ✅ Fixed, confirmed |
| 2 | Kiosk control bar jumped from 1 button to 3 | ✅ Fixed, confirmed |
| 3 | Ring stops ~5s after kiosk cancels | ✅ Not a bug — see below |
| 4 | Decline on phone didn't end the kiosk call | ✅ Fixed, confirmed |
| 5 | Cold start opens to home screen, no ring | 🔄 Root cause found + fixed, **unverified** |
| 6 | Same as 4 with the app closed | ✅ Fixed, confirmed |
| 7 | Hangup on phone doesn't end the kiosk call | ❌ **Open — next session starts here** |

**Commits.** Kiosk: `d997876`. Companion: `c0a09a3`, `cc6aa1d`, `615fd29`,
`cff24d2`. Everything through `cff24d2` is pushed; the Android build for it was
triggered at the end of the session and its results are unknown.

---

### #7 — hanging up on the phone (the open item)

The phone calls `call.endCall()` in `ActiveCallScreen`. If that rejects it falls
back to `leave()`, at which point the kiosk's own 2s participant-drop fallback
should close it. Neither happens, so something in that chain fails silently.

**The live suspect is the `end-call` permission.** The kiosk (`family-hub`)
creates every call, so `adrian`/`kath` may not be allowed to end one. Session 13
raised this and dismissed it as a red herring — but only because `end()` was
throwing `TypeError` before the permission could ever be exercised. With the
method name now correct, it is untested, not disproved.

`cff24d2` records the outcome of `endCall`/`leave`/`reject` into the debug strip.
After the build, answer a call and hang up on the phone; the strip will show one
of:

- `endCall ok` → the phone ended it, the **kiosk** isn't reacting → fix is kiosk-side
- `endCall FAILED: …` then `leave ok` → **permission theory confirmed**. Either grant
  `end-call` to family members in the Stream Dashboard (Call Types → default →
  Roles), or have the kiosk treat a participant drop as a hangup
- `endCall FAILED` then `leave FAILED` → the phone cannot exit the call at all;
  worse and different

### #3 is not a bug

The ~5s delay is the kiosk's deliberate 2s grace window
(`VideoCallOverlay.jsx`, participant-drop fallback) plus Stream's propagation.
It exists to ride out brief network blips. Can be cut to ~800ms if it reads as
broken, but that trades against false hangups on a flaky connection.

### Why #4/#6 were broken — a second SDK guard

Two separate `RINGING`-gated code paths, neither obvious:

1. **Kiosk side** — the SDK's own `call.rejected` handler (`watchCallRejected`,
   video-client) returns early unless the call is still `RINGING`. `startCall()`
   joins immediately so the kiosk can show its camera, so it is always `JOINED`
   when a decline arrives. The SDK logged *"Call is not in ringing mode. Ignoring
   call.rejected event"* and the kiosk sat there forever. **This path never
   worked; it was not a regression.** Handled explicitly in `d997876`.
2. **Phone side** — `call.leave({ reject: true })` only forwards the rejection
   when `callingState === RINGING` (`Call.leave`). `IncomingCallScreen` also
   shows for `IDLE` calls, and declining one of those sent **nothing at all**.
   Now calls `call.reject()` directly, which is an unconditional POST with no
   state guard (`c0a09a3`).

Confirmed by the kiosk console: before the fix, no `call.rejected` ever arrived;
after it, `[call] callee rejected, ending call: adrian` appears and the overlay
closes.

### ⚠️ Trap that cost a test cycle this session

**A kiosk change needs a push and a Vercel deploy before it can be tested.** A
hard refresh only re-fetches whatever Vercel is serving. Testing uncommitted
local edits produced three "fixes don't work" reports that were really one
undeployed commit. Push first, confirm the deploy shows the new commit, *then*
hard refresh.

### Temporary debug code to remove

All gated behind `SHOW_CALL_DEBUG` in `App.js` — **do not ship a build with this
to Kath's phone.**
- `SHOW_CALL_DEBUG` + `CallDebugStrip` + `styles.debugStrip` in `App.js`
- the `no client` strip in `StreamWrapper`
- `src/debugLog.js` and its `debugLog()` calls in `ActiveCallScreen` /
  `IncomingCallScreen`

### Incidental

`[ntfy]` prints nothing when calling Adrian: `NTFY_TOPICS` in the kiosk's
`streamVideo.js` maps only `kath`. Correct — Adrian gets FCM via Stream's own
ring — but an `adrian` call exercises **zero ntfy code** and cannot be used to
test that path.

### Priority 3 — SideStore, still open

Read "7 days" on 2026-07-19, but only hours after install, so it means nothing.
The meaningful read is **after the midnight automation fires**: 7 = refreshing,
6 = opening SideStore without refreshing.

---

## Status as of 2026-07-19 (session 13)

### The headline finding: `call.end()` does not exist

Every hangup path in both repos called `call.end()`. The SDK method is
**`endCall()`** — `Call.d.ts:642` declares `endCall: () => Promise<EndCallResponse>`
and has no `end`. So `call.end()` threw `TypeError: u.end is not a function` on
every single invocation, and the surrounding `catch` fell through to `leave()`,
which removes only the local participant and leaves the other side ringing.

This one typo accounts for:
- kiosk cancels a call → phone keeps ringing
- Android hangup → kiosk stays in the call (`d69ecff`, which could never have worked)
- the long-standing theory that Adrian's Stream user lacked the `end-call`
  permission — a red herring for two sessions

Fixed in kiosk `a5059dd` and companion `4cfd5da`. **Both need retesting** — see
Regression below, the kiosk side got worse after this change.

⚠️ **The recurring theme this session was `.catch(() => {})`.** Three separate
bugs were invisible because the code discarded the answer: the ntfy push
discarded its HTTP response, `end()` discarded its error, `useLiveQuery` threw
uncaught into a white page. Two `console.warn` lines turned a day of guessing
into a two-minute diagnosis. **Do not add a bare catch in this codebase.**

---

### Completed this session ✅

**Kiosk (yap-family-home) — all pushed and deployed**

| Commit | Fix |
|---|---|
| `1c2991c` | White page — `useLiveQuery` channel name collision |
| `a5142aa` | 2 ntfy pushes instead of 6, Answer action, log ntfy's response |
| `e6442c9` | Kiosk no longer rings itself on outgoing calls |
| `0725149` | Cancel path uses end-for-everyone, not leave |
| `5a39d68` | Log why end() falls back to leave() ← **this is what found the bug** |
| `a5059dd` | `endCall()` not `end()` |
| `e4a80ec` | No bare placeholder flash before the calling screen |

**White page (`1c2991c`)** — `useLiveQuery` built its channel as `live:${table}`.
App.jsx and TasksPage both watch `tasks`; App.jsx and MealsPage both watch `meals`.
`supabase.channel()` returns the *existing* channel for a name already in use, so
the second consumer added a `postgres_changes` listener to an already-subscribed
channel, which throws — uncaught, so React never mounted. Now keyed per hook
instance with `useId()`. Also fixed a latent teardown bug where whichever consumer
unmounted first called `removeChannel()` on the channel the other was still using.

**Companion (yap-family-companion) — pushed, NOT yet built**

| Commit | Fix |
|---|---|
| `d78f15a` | Native-style call screen, `iphone_x.mp3` ringtone, accept spinner |
| `90efe16` | Cold-start ring fix (IDLE vs RINGING) |
| `4cfd5da` | `endCall()` not `end()` |

**Cold-start ring (`90efe16`)** — a call recovered by `queryCalls()` after the app
was woken from a killed state arrives as `IDLE`, not `RINGING`: `RINGING` is only
set by the live `call.ring` websocket event, which the app wasn't running to
receive. Two independent places required exactly `RINGING` (CallOverlay's matcher
and IncomingCallScreen's own guard), so the push woke the phone, the app opened on
the home screen, and the caller kept ringing. **Reproduced identically on Android
and iOS**, which is what ruled out anything platform-specific.
🛑 **Session 14: this was wrong.** The app had no Stream client at all, so no
call state of any kind was reachable. The platform-independence was evidence for
a JS-level bug, not against a platform one. See the session 14 section.
⚠️ This is a well-supported hypothesis, **not confirmed** — the `IDLE` state was
never directly observed, because neither phone can produce logs (see below).

---

### ⚠️ REGRESSION — first thing to look at

After `a5059dd` (the `endCall()` fix) the kiosk got **worse**, reported but not
yet diagnosed:

1. Cancel on the kiosk → nothing happens at all (previously it at least closed)
2. Cancel on the phone → nothing happens, can't decline, keeps ringing

Likely `endCall()` throwing a *different* error — e.g. ending a call still in
RINGING rather than JOINED. **The `[call]` console lines added in `5a39d68` will
name it.** Get those before changing anything.

Revert candidate if needed: `a5059dd` (kiosk) and `4cfd5da` (companion).

Note: point 2 was observed on a phone running the **old build**, so it may be
unrelated — the decline path (`call.leave({reject: true})`) was never touched.

---

### Test results

| Scenario | Result |
|---|---|
| Kiosk loads at all | ✅ Fixed (`1c2991c`) |
| Kiosk → iPhone, app open | ✅ Rings, accepts, connects |
| Kiosk → iPhone, app closed/screen off | ❌ Banner arrives, app opens to home screen, can't answer |
| Kiosk → Android, app open | ✅ Works |
| Kiosk → Android, app closed | ❌ Same as iOS — opens to home screen |
| Kiosk cancels → call ends server-side | ✅ Confirmed session 14 (console) |
| Kiosk cancels → phone stops ringing | ✅ Confirmed session 14 (~5s, by design) |
| Phone declines → kiosk call ends | ✅ Confirmed session 14 |
| Phone hangs up → kiosk call ends | ❌ Open — session 14 #7 |
| Cold start → ring screen appears | 🔄 Cause found + fixed, unverified |
| Kiosk rings itself | ✅ Fixed (`e6442c9`) |
| ntfy delivery (screen off, app closed) | ✅ Confirmed working — verified by direct pushes |
| SideStore auto-refresh automation fires | ✅ Confirmed (opened SideStore on schedule) |
| SideStore auto-refresh actually refreshes | 🔄 Check expiry date — see below |

---

## Immediate next steps

1. **Trigger `build-android.yml`** — Android is the faster loop (no SideStore) and
   the cold-start fix applies to both platforms
2. **Hard refresh the kiosk** — PWA serves the cached bundle until it reloads
3. **Diagnose the regression** — console open, cancel a call, read the `[call]` lines
4. **Trigger `build-ios.yml`** once Android confirms the cold-start fix

---

## iOS / SideStore state

**Test device is a spare SIM-less iPhone, not Kath's** (she's overseas). SideStore
is installed on it, companion app installed via SideStore, ntfy installed and
subscribed to `yap-kath-f3k8p2n1`.

**Auto-refresh — SOLVED AND VERIFIED (2026-07-26).** ✅ SideStore reads **"Expires
in 7 days"** the morning after the automation fired. 7 rather than 6 is the whole
test: it refreshed **while the phone was locked overnight**, so LocalDevVPN
activates locked and this is genuinely hands-off. No retiming needed. Turn
**"Notify When Run" OFF** now that it is proven.

⚠️ The action must be SideStore's own **"Refresh All Apps"**, NOT **Open App** —
Open App only foregrounds SideStore and never refreshes, which is why the expiry
had counted down to 1 day. Don't let this regress.

### Repeating all of this on Kath's phone

The automation lives on the device, so **none of it transfers**. Full sequence:

1. Install SideStore via **LocalDevVPN + iloader** (not Sideloadly). Choose
   **SideStore (Stable)** — not Nightly, not LiveContainer.
2. Get the IPA onto the phone: Safari → github.com → Actions → the
   `build-ios.yml` run → Artifacts. The share sheet fails with "doesn't exist";
   use SideStore's own **+** file picker instead.
3. Install the IPA **from inside SideStore**, never via iloader/Sideloadly —
   only apps SideStore manages get refreshed.
4. Shortcuts → Automation → Personal Automation → **Time of Day, 12:00 AM
   daily, Run Immediately** (Ask Before Running OFF) → Do: SideStore
   **"Refresh All Apps"**.
5. Verify it the same way: note the expiry, leave the phone locked on the
   charger overnight, check next morning. **7 days = working. 6 = it only runs
   unlocked**, so retime the automation to an hour the phone is unlocked.
6. Allow the notification permission on first run, then install **Bark** and
   confirm its device key matches the kiosk's Vercel env var (see the Bark
   notes — Bark *is* the ring on iOS, and Critical Alerts must be allowed or it
   won't bypass silent mode). `USE_FULL_SCREEN_INTENT` is Android-only and does
   not apply here.

**Install route:** iloader (not Sideloadly). Current docs are LocalDevVPN + iloader;
`docs.sidestore.io/docs/installation/prerequisites` loads, deeper pages 404.
Pick **SideStore (Stable)** in the installer, not Nightly or LiveContainer.
Install the companion IPA **from inside SideStore**, not via iloader/Sideloadly —
only apps SideStore manages get refreshed.

**Getting the IPA to the phone:** download the artifact on the PC, then Safari on
the phone → github.com → Actions → run → Artifacts. The share sheet fails with
"doesn't exist" — use SideStore's own **+** file picker instead.

---

## Known constraints (do not re-litigate)

**No APNs/VoIP on iOS.** The free SideStore cert strips the `aps-environment`
entitlement, so PushKit/CallKit are unavailable. This means:
- no native incoming-call screen, no answer-from-lockscreen, no ringer-volume ring
- ntfy is the *only* background path, not a nice-to-have
- the notification is an ntfy banner: only title, body and action label are
  controllable. Icon, colour and layout are ntfy's/iOS's.
- answering from cold requires unlock → tap → app launch

A paid Apple Developer account ($99/yr) would fix all of that *and* the 7-day
expiry. **Raised and declined** — Kath can unlock with Face ID, it's acceptable.
Don't keep suggesting it.

**Neither phone can produce logs.** iPhone has no Mac to attach to; Android `adb`
is deliberately disabled because banking apps flag it. So anything needing
on-device diagnosis requires either an on-screen debug readout in the app, or
inference. Budget for this — it's why the cold-start fix is unconfirmed.

---

## ntfy — settled facts

Topic: **`yap-kath-f3k8p2n1`** (Vercel env `VITE_NTFY_TOPIC_KATH`)

Delivery was extensively tested by pushing directly to the topic. **ntfy delivery
works** with the screen off, the phone locked, no SIM, and the ntfy app closed —
six rapid pushes all arrived. Content, volume and priority were each ruled out as
causes of the earlier failures.

- Read the topic's history: `https://ntfy.sh/yap-kath-f3k8p2n1/json?poll=1&since=10m`
  (this is how we proved the kiosk was publishing while the phone showed nothing)
- ⚠️ PowerShell 5.1 **mangles emoji** in the payload — a test push with a corrupted
  emoji is a *different message* and invalidates any comparison. Title is now pure
  ASCII with the phone icon supplied via `tags`, partly for this reason.
- The ntfy iOS app renders the `view` action as text, not a button, but tapping
  the banner does now open the app directly.
- iOS notification sound is fixed — not adjustable from ntfy.

---

## Remaining items

### Calling
- [x] ~~Cancel/decline regression~~ — not a regression (session 14)
- [x] ~~Decline on the phone ends the kiosk call~~ — fixed, confirmed (session 14)
- [x] ~~Hangup on the phone ends the kiosk call (#7)~~ — fixed, confirmed (session 15)
- [x] ~~Android cold-start ring~~ — fixed `6302ae2`, confirmed (session 16)
- [x] ~~iOS ring / cold-open~~ — Bark + deep-link cid recovery, confirmed (session 16)
- [x] ~~iOS Accept delay~~ — fixed `cb76047`, **verified on device** (session 17).
      iOS calling is complete.
- [x] ~~Kiosk uses Bark, not ntfy~~ — confirmed from the deployed bundle (session 17)
- [x] ~~Android return-home on a cold-started call~~ — `f9a5233` **verified on
      device** (session 18): the phone drops to the Android launcher
- [x] ~~Bark push arrives slowly after "Call Mum"~~ — fixed `c732d2f`, confirmed
      (session 18): the push was queued behind the kiosk's own camera setup
- [x] ~~Decline doesn't end the kiosk call~~ — two root causes, both fixed
      (session 18): the kiosk wasn't watching its calls (`2e9ffeb`) and
      `call.rejected` is never delivered anyway (`069cf63`/`8080e90` poll
      `session.rejected_by`); the phone also `endCall()`s now (`6f2a797`)
- [x] ~~app-Home-screen flash on iOS~~ — `bbf55b7`/`1bc7734` **verified on device**
      (session 19): Bark tap → call screen immediately
- [x] ~~Kiosk publishes no audio~~ — wrong device, not a failure: the selector matched
      a Windows `Default - …` alias. Fixed `11c6b6e`/`f6fef51`, **confirmed** (s19)
- [x] ~~🔴 iOS: only the FIRST call per app launch works~~ — **not a real bug**
      (session 20). The `settled` snapshots at +6s/+15s show call 2 as healthy as
      call 1 on both platforms: `pub=AV sub=av`, nothing muted. The symptoms behind
      it were the five bugs listed in the session 20 outcomes.
- [x] ~~Call-screen placeholder on Android~~ (`bbf55b7`) — confirmed session 20
- [x] ~~Verify `c1d92d8` on both phones~~ — **all five VERIFIED on iOS** (session
      21, build `b24bb7b`). ⚠️ Still unverified on **Android**, which has not been
      rebuilt since `43a9261`.
- [x] ~~🔴 iPhone video reaching the kiosk is slow/unusable~~ — **root-caused
      (session 21): a 20-30s bitrate ramp from a 300kbps start**, not kiosk-side
      at all (`rtt=4ms`, audio fine on the same connection). Fixed `a345bb3`,
      needs a build to verify.
- [x] ~~Verify `a345bb3` (bitrate ramp) and `cd45317`/`9c925c0` (Bark
      suppression)~~ — **both verified on iOS** (session 22), including the
      fail-safe: a locked phone still gets Bark
- [x] ~~iPhone films with the back camera / rotate needs two presses~~ — not an
      app bug: the call type's `camera_facing`. Fixed kiosk-side (`078c781`),
      **verified on device** (session 22)
- [x] ~~Two notifications per call on iOS~~ — the app's own local notification
      removed (`7873da9`). Pushed, **needs an iOS build**
- [ ] **Retest decline on Android** — reported broken, never retested after the
      client and publish paths were fixed underneath it. Open three sessions.
      **Session 23 Priority 1.**
- [x] ~~Deploy the backend~~ — `a6cddca` (honest `[ring] bark` timing) **deployed
      and verified** end of session 22
- [ ] **Target Resolution is 2160p** on the `default` call type — the phone
      captures 4K and publishes 720p. See Priority 4; the 720p publish is
      currently an accident of `selectDirection`'s constraint defaults
- [ ] ~2s ring delay on Android: every call is a cold start because the app exits
      after each one; ~1.2s of it is the token fetch and is cacheable (optional)
- [x] ~~Bark keeps ringing after the call is answered~~ — far worse than a
      lingering banner: the ring **holds the iOS audio session and mutes the call
      in both directions** (`int=A-`; swiping it away restored audio instantly).
      Addressed by not sending the push at all when the app is already showing the
      call (`cd45317`/`9c925c0`). Unverified.
- [ ] Kiosk calls `join()` twice on one call object (error suppressed, cause unknown)
- [ ] Kiosk client never drops finished calls — `useCalls()` count climbs all session
- [ ] Beelink music server down ⇒ `24a7119`'s call-time audio-output switch fails
- [ ] Remove the debug code once calling is signed off — now also `src/callTrace.js`
      and the `connect:` / `token` / `[sdk]` lines in `streamClient.js`, the
      `WaitedSeconds` / `DebugLogLines` components in `App.js`, and `CallDebugStrip`
      rendering over the call screens
- [x] ~~Confirm SideStore refresh moved the expiry date~~ — **VERIFIED 2026-07-26**
      on the spare test iPhone: reads "Expires in 7 days" the morning after the
      automation fired, which means it refreshed **while locked**. Hands-off.
      Turn "Notify When Run" OFF. Still to be redone on **Kath's** phone — see
      the iOS / SideStore section below for the full sequence.
- [ ] Retire Yap Dad Companion
      (`C:\Users\user\Desktop\Digital Dashboard\yap-dad-companion`)

### Cleanup
- [ ] Remove `[IncomingCall]` debug console.logs from kiosk `IncomingCallOverlay.jsx`
      (keep the `[call]` and `[bark]` ones — they earned their place)
- [ ] Kiosk `VideoCallOverlay.jsx`: remove the `call.on('all')` logging and the
      `[call] poll —` line, but **keep the poll itself** (it is the decline fix) and
      **keep `[call] watching this call:`** (names the session-18 failure mode)
- [ ] Companion `assets/iphone_x.mp3` and `assets/ringtone.wav` are both unused —
      the in-app ringtone was dropped in `39a6db8` (Bark rings on iOS, the
      notification channel on Android)
- [ ] Kiosk: the ntfy path in `src/services/streamVideo.js` is now unreachable —
      the dispatcher prefers Bark for `kath`, the only mapped user
- [ ] Keep the kiosk `[mic]` lines when stripping — they found a real bug and they
      name the device the call actually bound to
- [ ] Kiosk `useRealtimeTable` replaced by `useLiveQuery` — no callers remain

### Backlog
- [ ] Screenshot → calendar feature
- [ ] Calendar holds **dummy data** (June has 35 events, July/Aug empty — expected)

---

## Backend — chat rate limits (unchanged this session)

**Groq is primary, Gemini is the overflow valve.**

| | Groq | Gemini (this account) |
|---|---|---|
| Requests/day | 1,000 | **20** |
| Tokens/day | **100,000** ← the real limit | not the constraint |
| Tokens/min | 12,000 | 250,000 |

⚠️ `/api/chat/limits` reads only Groq's **per-minute** buckets. The actual
constraint is **tokens-per-day**, which appears nowhere in those headers — it
showed 999/1000 requests free while every call was failing. TPD surfaces only in
the 429 text.

⚠️ Gemini's free quota here is **20 requests/day**, not the 250 guides claim.
`gemini-3-flash` and `2.5-flash-lite` 404; `2.0-flash` returns quota=0. Only
`gemini-2.5-flash` works.

**Capacity:** ~4,300 tokens/message ⇒ **~20–25 messages/day**. Chat testing burns
the family's real budget — don't test it repeatedly.

Calendar pre-loading injects today−1..+14 into the system prompt and is
self-tuning: above `PRELOAD_TOKEN_BUDGET` (1,000 tokens, ~26 events) the block is
dropped in favour of `get_calendar_events`. ⚠️ Deployed but **not verified
end-to-end**.

---

## Key constants & URLs
- Supabase: https://ygwpigynmxhavqucvwbp.supabase.co (Realtime on `tasks`, `meals`)
- Backend: https://yap-calendar-backend.fly.dev
- Kiosk: https://yap-family-home.vercel.app
- Chat: Groq `llama-3.3-70b-versatile` primary, Gemini `gemini-2.5-flash` overflow
- Stream API key: `5azqrwjz9fra` · push provider: `firebase` · kiosk user `family-hub`
- Firebase project for FCM: `yap-family-home-9a2b7` (both apps)
- ntfy topic (Kath): `yap-kath-f3k8p2n1`
- flyctl (this PC): `C:\Users\user\.fly\bin\flyctl.exe` (ayap@post.com)
- flyctl (Beelink): `C:\Users\Yap Family Dashboard\.fly\bin\flyctl.exe`
- GitHub: `aslyap` — `gh` CLI is **not installed** on this PC; builds are triggered
  manually in the Actions UI

## Key files
- `index.js` — `StreamVideoRN.setPushConfig()` (FCM background calling, `isExpo: false`)
- `App.js` — `StreamWrapper` (client init, `queryCalls`, permissions) + `CallOverlay`
- `plugins/withLockScreenCall.js` — MainActivity lockscreen flags (Android screen wake)
- `src/screens/IncomingCallScreen.js` — native-style incoming call UI
- `src/screens/ActiveCallScreen.js` — active call + hangup
- `src/streamClient.js` — Stream client singleton; identity defaults to `kath`
- Kiosk: `src/services/streamVideo.js` (startCall + ntfy), `src/components/widgets/VideoCall/`
- Kiosk: `src/hooks/useSupabase.js` (`useLiveQuery`)

## Useful diagnostic endpoints
- `GET /health` — backend + calendar auth status
- `GET /api/chat/test` — smoke-tests Groq and Gemini
- `GET /api/chat/limits` — Groq per-minute buckets (**does not show TPD**)
- `GET /api/chat/gemini-test` — probes which Gemini models work

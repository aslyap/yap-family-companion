# yap-family-companion — Session Handoff

## Session 19 kickoff prompt

**Verify the two builds, then sign off calling and strip the debug code.**

Read this file and the memory index first. Nothing is known to be broken. Every
issue raised in session 18 has a fix pushed; two of them have never run on a
device, and that is the whole job.

### Priority 1 — build both apps and verify

Nothing here needs diagnosis, just a build and a look.

**Android** — `build-android.yml` at `1bc7734` or later. The build triggered at the
end of session 18 was `6f2a797` and its result was never reported.
1. Force-kill the app. Call from the kiosk. → the phone must go **straight to a
   call screen** (dark grey, "Yap Family / incoming video call", spinner, then the
   Accept/Decline buttons appear). Seeing the app's **Home tab first is the bug**
   that `bbf55b7` fixes.
2. Decline without answering → the kiosk must close **immediately** (not after ~1s).
   Immediate = the phone's own `endCall()` did it; ~1s = the kiosk's poll backstop.
3. End a call → phone drops to the Android launcher. Already verified in session 18,
   just don't let it regress.

**iOS** — `build-ios.yml` at `1bc7734` or later, installed **from inside SideStore**.
No iOS build has been made since session 17, so both `bbf55b7` and `1bc7734` are
unverified there. Call Kath, let the phone lock/idle first, then **tap the Bark
notification** (not the app icon — the icon carries no deep link and takes the slow
path by design).
- Straight to the call screen, no app Home screen. That is the fix.
- If it still lingers, the strip now measures the remaining cost: the gap between
  `resume: reconnecting after Ns bg` and `onRingingCall ok`. That reconnect is a
  full client teardown + re-init on any resume after >30s backgrounded, and it has
  never been timed. **Get that number before touching the reconnect logic** — it is
  load-bearing for the Android cold-start ring.

### Priority 2 — sign off and strip the debug code

Once Priority 1 looks right, the calling feature is done. Remove:
- `App.js` — everything behind `SHOW_CALL_DEBUG`: `CallDebugStrip`,
  `styles.debugStrip`, the no-client strip in `StreamWrapper`, and the `debugLog`
  calls (`deeplink:`, `onRingingCall`, `resume:`)
- `src/debugLog.js` and every `debugLog()` call — `IncomingCallScreen`,
  `ActiveCallScreen`, `src/returnHome.js`, `src/pendingCall.js`'s callers.
  **Keep `withTimeout` around `join()`** — error handling, not instrumentation, and
  it is what surfaced the 30s hang.
- unused `assets/iphone_x.mp3` and `assets/ringtone.wav`
- kiosk: `call.on('all')` event logging and the `[call] poll —` line in
  `VideoCallOverlay.jsx` (**keep the poll itself** — it is the fix, not a probe),
  the `[IncomingCall]` logs in `IncomingCallOverlay.jsx`, and the now-unreachable
  ntfy path in `src/services/streamVideo.js`
- **Keep** `[call] watching this call:` — one line that names the failure mode that
  cost most of session 18.

Then retire Yap Dad Companion (`..\yap-dad-companion`).

### Settled — do NOT re-litigate

- **`call.rejected` is not delivered to the kiosk.** Not a handler bug, not a
  filter, not a stale bundle. Measured: `watching: true`, other server events
  arriving on the same socket, phone reports a real 200 from `reject()`, and the
  event never comes. The kiosk polls `session.rejected_by` instead. Don't go back
  to depending on that event.
- **Unlock-to-answer on iOS needs a paid Apple account** ($99/yr, declined).
- **Call ends → app stays open on iOS** is normal; only Android returns home.
- **WebRTC/SFU connect is 946ms.** Never "near the floor for a sideloaded build".
- **Stay on GitHub Actions, not EAS.** Checked in session 18: EAS free is 15+15
  builds/month (resets monthly, so the old exhaustion is long gone) on a
  low-priority queue; the repo is **public**, so Actions minutes are free and
  unlimited including the `macos-15` runner. And `build-ios.yml` deliberately
  archives **unsigned** (`CODE_SIGNING_ALLOWED=NO`) and hand-zips the IPA, which is
  what SideStore needs — EAS's device path wants real Apple credentials. The one
  thing worth stealing later is `eas update` for JS-only changes.
- **The desk KVM is not connected to the Beelink.** Never an explanation for kiosk
  or touchscreen problems.

### Traps (these keep biting)

- **Evidence before theories.** Session 18 again: the decline bug was invisible
  until `call.on('all')` showed the kiosk receiving *only* locally-generated
  events. Two console screenshots did what a session of inference could not.
- **Distinguish "didn't happen" from "happened and was ignored."** Logging only on
  the action path made those identical, and that ambiguity was the bug's cover.
- **Never `.catch(() => {})`.**
- **Check which commit a build came from before trusting a reading.** Session 18
  wasted a cycle on an APK that predated the instrumentation — the giveaway was a
  missing strip line.
- A kiosk change needs a push AND a Vercel deploy (confirm the commit on the
  deployment) before a hard refresh can test it; **env-var changes need a REDEPLOY**.
- Neither phone produces logs — the strip and the kiosk console are the only
  diagnostic surfaces.
- Calling Adrian exercises zero Bark code (kiosk maps only kath). PowerShell 5.1
  mangles emoji. Don't test chat (burns the family's daily budget).
- The Beelink's touchscreen died at the Windows lock screen mid-session (password
  `2909`, no keyboard attached). If it recurs: reseat the display's USB cable, or
  plug in a USB keyboard.

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

## Earlier sessions

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

**Auto-refresh is set up** — Shortcuts → Automation → Time of Day, 12:00 AM daily,
Run Immediately, action **Open App → SideStore**. The iCloud shortcut from earlier
sessions was broken ("an action could not be found") and is unused; the stock
Open App action does the job with no third-party dependency.
- ✅ Confirmed it fires (set the time 2 min ahead, SideStore opened by itself)
- 🔄 **Not confirmed it actually refreshes.** Both SideStore and Yap Family read
  "expires in 7 days" as of 2026-07-19. If they still read 7 days the next day,
  refresh works. If 6, the automation opens the app but isn't refreshing.
- ⚠️ Must be redone on Kath's actual phone — the automation lives on the device.

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
- [ ] **Verify the app-Home-screen flash is gone** (`bbf55b7`, `1bc7734`) — needs an
      Android build AND an iOS build; neither has run on a device
- [ ] **Verify decline is instant on the new APK** (`6f2a797`) — the build was still
      running when session 18 ended
- [ ] Remove the debug code once those verify (list in the session 19 kickoff)
- [ ] Confirm SideStore refresh moved the expiry date (must be Kath's real phone)
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

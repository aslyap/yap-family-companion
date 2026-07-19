# yap-family-companion — Session Handoff

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
- [x] ~~Diagnose the cancel/decline regression~~ — not a regression (session 14)
- [x] ~~Decline on the phone ends the kiosk call~~ — fixed, confirmed (session 14)
- [ ] **Verify the cold-start ring on the `cff24d2` Android build** — kill the
      app, call from the kiosk, watch the strip. Ring screen should appear.
      `attempt=N` climbing means the connect keeps failing (a second, separate
      problem); `attempt=1` stuck means the retry isn't scheduling.
- [ ] **#7 — hangup on the phone doesn't end the kiosk call.** Read the strip;
      the three outcomes and what each means are in the session 14 section.
- [ ] Then iOS: build, install via SideStore, repeat both tests. `iphone_x.mp3`
      should ring again once the call screen actually renders — its absence on
      iOS was a *symptom* of the no-client bug, not a separate fault.
- [ ] Remove the debug code (list in the session 14 section) before any build
      that goes to Kath's phone
- [ ] Confirm SideStore refresh moved the expiry date
- [ ] Retire Yap Dad Companion once Android is verified
      (`C:\Users\user\Desktop\Digital Dashboard\yap-dad-companion`)

### Cleanup
- [ ] Remove `[IncomingCall]` debug console.logs from kiosk `IncomingCallOverlay.jsx`
      (keep the `[call]` and `[ntfy]` ones — they earned their place)
- [ ] `assets/ringtone.wav` in the companion is now unused (`iphone_x.mp3` replaced it)
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

# yap-family-companion — Session Handoff

## Session 23 kickoff prompt

**iOS calling is finished. Android is the whole job now.**

Read this file and the memory index first.
Companion `main` at `3d400c0`. Kiosk `main` at `078c781`, **deployed to Fly and
verified** (`/health` 200, `/api/ring/stop` → `{"ok":true}`).

Session 22 verified everything session 21 left open and fixed the two cosmetic
items on top of it. Nothing about iOS calling is outstanding except installing a
build that is already pushed. **Do not re-open iOS unless a test says to.**

### Priority 1 — Android

Android has not been rebuilt since `43a9261`. Everything since is unverified on
it, which is eight commits' worth of calling changes plus this session's two.
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

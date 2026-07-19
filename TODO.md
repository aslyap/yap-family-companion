# yap-family-companion — Session Handoff

## Status as of 2026-07-19 (session 12)

### Completed this session ✅

**Android lockscreen wake — FIXED and confirmed working**
- Root cause was NOT the `USE_FULL_SCREEN_INTENT` permission. callingx already builds the
  notification correctly (`setFullScreenIntent`, `CATEGORY_CALL`, `PRIORITY_MAX` —
  `CallNotificationManager.kt:164`). The intent it launches is
  `getLaunchIntentForPackage()` i.e. MainActivity, and **a full-screen intent only wakes the
  screen if the launched Activity is flagged for it**. Neither callingx nor the Expo template
  sets those flags.
- Fix: config plugin `plugins/withLockScreenCall.js` adds `android:showWhenLocked` and
  `android:turnScreenOn` to MainActivity. Must be a plugin — CI runs `expo prebuild --clean`,
  which discards hand-edited manifests.
- Secondary bug: the previous build set `setup_full_screen_intent` in AsyncStorage immediately
  before calling `Linking.sendIntent`, which **silently opens nothing** in this Expo build.
  The fixed code checked the same key, found it set, and never prompted. Keys bumped to `_v2`.
- `Linking.sendIntent` does not work here — use `expo-intent-launcher`. These settings intents
  also take a `package:` **data URI**, not extras.

**Android hangup → kiosk teardown**
- `ActiveCallScreen.handleHangUp()` used `call.leave()`, which removes only that participant,
  leaving the kiosk in the call. Now `try call.end() / catch call.leave()`, matching the
  kiosk's own hangup. ⚠️ **Untested** — see below.

**Chat error UX**
- Error bubble always claimed "wait 60 seconds" and printed 120 chars of raw API error on a
  family-facing screen. Now shows the real wait and no debug output.

### Kiosk / backend (yap-family-home repo) — all deployed ✅
- Tasks/Meals/Home tabs now update live via Supabase realtime (`useLiveQuery` hook).
  Required `alter publication supabase_realtime add table tasks, meals` — **note the Realtime
  service takes ~1 min to pick up an ALTER**, so an immediate retest gives a false negative.
- Singapore timezone fix committed (was deployed but never committed — would have regressed
  on any clean-checkout deploy).
- Chat token reductions + self-tuning calendar pre-loading (see Backend section below).

### Test results

| Scenario | Result |
|---|---|
| Kiosk → Android (foreground) | ✅ Working |
| Kiosk → Android (killed / after restart) | ✅ Working |
| Android → Kiosk | ✅ Working |
| **Android locked screen wake** | ✅ **FIXED — confirmed by user** |
| Android hangup ends call on kiosk | 🔄 Committed, **not yet tested** |
| Kiosk Tasks/Meals live update | ✅ Confirmed (needs hard refresh after deploy) |
| Kiosk → iOS Kath (all directions) | 🔄 Untested with latest IPA |
| iOS SideStore auto-refresh | 🔄 Not set up |

---

## Immediate next steps

1. **Trigger `build-android.yml`** — APK includes `fc1bffd`, `d69ecff`, `284d0d4`, `801df75`
2. **Hard refresh the kiosk** — PWA service worker serves the old bundle until it reloads
3. **Test the hangup fix** — hang up on the phone, confirm the kiosk drops the call too.
   If it doesn't, Adrian's Stream user likely lacks the `end-call` permission, which makes
   `end()` fall back to `leave()` and reproduces the original symptom.

---

## iOS (Kath's iPhone) — the next focus

Nothing iOS has been retested since session 10. All of these fixes are committed but unverified
on device:

- [ ] Front camera on call start (`flip()` fix)
- [ ] `IncomingCallScreen` layout (`useWindowDimensions` — was clipping Accept/Decline)
- [ ] Video in `ActiveCallScreen` (`useWindowDimensions` — was a permanent spinner)
- [ ] Kiosk → Kath from background via ntfy deep link → `queryCalls` finds the ring
- [ ] Kath → Kiosk (camera/mic + `NSCameraUsageDescription`)
- [ ] Background calling when locked — `IOSBackgroundKeepAlive` was removed after a crash;
      needs a valid `silence.wav` (the PowerShell-generated one was malformed).
      ntfy is the current workaround.

### SideStore auto-refresh (IPA expires every 7 days without it)
1. Safari on Kath's iPhone → https://www.icloud.com/shortcuts/46e9ca6015094e0b868233816b575c2e
2. Shortcuts → Automation → **+** → Time of Day → 12:00 AM, Daily
3. Select the SideStore shortcut → **disable "Ask Before Running"** ← critical

### ntfy (background calling)
- ntfy app installed ✅ — subscribe to the topic in `VITE_NTFY_TOPIC_KATH` (Vercel env)
- Kiosk call → ntfy push with `yapfamily://` deep link → app opens → `queryCalls` finds ring
- Requires Stream ring timeout ≥ 60s (now 90s ✅)

---

## Backend — chat rate limits (yap-family-home repo)

**Groq is primary, Gemini is the overflow valve.** Their free tiers are constrained on opposite
axes, so they cover each other:

| | Groq | Gemini (this account) |
|---|---|---|
| Requests/day | 1,000 | **20** |
| Tokens/day | **100,000** ← the real limit | not the constraint |
| Tokens/min | 12,000 | 250,000 |

⚠️ **Diagnosing rate limits:** `/api/chat/limits` reads Groq's `x-ratelimit-*` headers, but
those cover **only the per-minute buckets**. The actual constraint is **tokens-per-day**, which
appears nowhere in the headers — it showed 999/1000 requests free while every call was failing.
TPD surfaces only in the 429 error text. Don't trust the headers alone.

⚠️ Gemini's free quota here is **20 requests/day**, not the 250 published guides claim. Verify
with `/api/chat/gemini-test` before relying on any number. `gemini-3-flash` and
`2.5-flash-lite` 404 on this account; `2.0-flash` returns quota=0. Only `gemini-2.5-flash` works.

**Capacity:** ~4,300 tokens/message ⇒ **~20–25 messages/day** on the free tier.
Paid Groq is pay-as-you-go, no monthly fee: ~**$1–3/month** at this volume
($0.59/M input, $0.79/M output). Decision: **try free first**.

**Calendar pre-loading** injects today−1..+14 into the system prompt so reads/edits resolve in
one API call instead of two. It is **self-tuning**: above `PRELOAD_TOKEN_BUDGET` (1,000 tokens,
~26 events) the block is dropped and the model uses `get_calendar_events` instead.
Break-even is `budget = R * FLOOR / (1 - R)` where R = share of messages needing a lookup
(questions + edits + deletes; plain additions don't). Retune the constant if the mix differs.
⚠️ Deployed but **not verified end-to-end** — Groq's daily budget was exhausted during testing.

---

## Remaining items

### Calling
- [ ] Test Android hangup → kiosk teardown
- [ ] All iOS scenarios (above)
- [ ] Retire Yap Dad Companion once Android is fully verified
      (`C:\Users\user\Desktop\Digital Dashboard\yap-dad-companion`)

### Cleanup
- [ ] Remove `[IncomingCall]` debug console.logs from kiosk `IncomingCallOverlay.jsx`
- [ ] Kiosk `useRealtimeTable` was replaced by `useLiveQuery` — no callers remain

### Backlog
- [ ] Screenshot → calendar feature
- [ ] Calendar currently holds **dummy data** (June has 35 events, July/Aug empty — expected)

---

## Key constants & URLs
- Supabase: https://ygwpigynmxhavqucvwbp.supabase.co (Realtime enabled on `tasks`, `meals`)
- Backend: https://yap-calendar-backend.fly.dev
- Kiosk: https://yap-family-home.vercel.app
- Chat: Groq `llama-3.3-70b-versatile` primary, Gemini `gemini-2.5-flash` overflow
- Stream API key: `5azqrwjz9fra` · push provider: `firebase`
- Firebase project for FCM: `yap-family-home-9a2b7` (both apps)
- flyctl (this PC): `C:\Users\user\.fly\bin\flyctl.exe` (logged in as ayap@post.com)
- flyctl (Beelink): `C:\Users\Yap Family Dashboard\.fly\bin\flyctl.exe`

## Key files
- `index.js` — `StreamVideoRN.setPushConfig()` (FCM background calling, `isExpo: false`)
- `App.js` — `StreamWrapper` (client init, queryCalls, permission prompts) + `CallOverlay`
- `plugins/withLockScreenCall.js` — MainActivity lockscreen flags (**the screen-wake fix**)
- `src/screens/IncomingCallScreen.js` / `ActiveCallScreen.js` — call UI
- `src/tabs/HomeTab.js` — outgoing call (`startCall`)
- `src/tabs/ChatTab.js` — chat UI + error handling
- `src/streamClient.js` — Stream client singleton
- `.github/workflows/build-android.yml` / `build-ios.yml` — both `workflow_dispatch`
- Kiosk: `src/hooks/useSupabase.js` (`useLiveQuery`), `calendar_backend.py` (chat/calendar API)

## Useful diagnostic endpoints
- `GET /health` — backend + calendar auth status
- `GET /api/chat/test` — smoke-tests both Groq and Gemini
- `GET /api/chat/limits` — Groq per-minute buckets (**does not show TPD**)
- `GET /api/chat/gemini-test` — probes which Gemini models work on this key

## SideStore setup reference
- iloader used for install (sidestore.io/installation)
- Pairing file: `C:\Users\user\Desktop\pairing.mobiledevicepairing` (keep — needed if re-pairing)
- pymobiledevice3 (Python 3.14): `python -m pymobiledevice3 lockdown save-pair-record`

# yap-family-companion — Session Handoff

## Status as of 2026-06-22 (session 10)

### Completed this session ✅

**Calling — layout fixes**
- `IncomingCallScreen`: replaced `flex:1` with `useWindowDimensions` — StreamCall SDK does not
  propagate flex, so the Accept/Decline buttons were clipped off-screen on iOS
- `ActiveCallScreen`: same fix — `CallContent` had zero dimensions and showed a permanent spinner

**Calling — camera/mic fixes**
- `startCall()` (outgoing): added `call.camera.enable()` + `call.microphone.enable()` after join.
  Previously neither was called for outgoing calls, causing Android spinner and iOS crash.
- `accept()` (incoming): reordered to enable camera/mic BEFORE `call.join()` so `CallContent`
  has a local video track ready when it mounts.
- Both: added `call.camera.flip()` after enable — Stream SDK defaults to back camera.

**Calling — iOS permissions**
- Added `NSCameraUsageDescription` + `NSMicrophoneUsageDescription` to `ios.infoPlist` in
  `app.json`. Missing entries cause iOS to terminate the app on first camera access.

**Calling — call teardown**
- Remotes fallback in `ActiveCallScreen` now calls `call.leave()` before `onLeft()`. When the
  kiosk calls `leave()` (not `end()`), Android/iOS stayed JOINED indefinitely. Now the phone
  also leaves, transitioning to LEFT so CallOverlay tears down cleanly.

**Calling — iOS background (queryCalls)**
- `StreamWrapper` now calls `queryCalls({ ringing: true })` right after client connects AND on
  every short-background → foreground transition. Fetches rings that arrived while iOS had the
  app suspended (WebSocket was killed).

**Calling — Android background from killed state (setPushConfig)**
- `index.js` already existed with a partial `setPushConfig`. Completed it with
  `incomingChannel` + `notificationTexts` and removed incorrect `ios.pushProviderName`.
- Root cause: `useInitAndroidTokenAndRest` (inside StreamVideo) only registers the FCM device
  token with Stream when `pushConfig` is set. Without a token, Stream can't deliver FCM pushes
  and the phone never wakes when the kiosk calls from a killed state.
- Stream Dashboard push provider name confirmed as `firebase` ✅

### Test results from session 10

| Scenario | Result |
|---|---|
| Android → Kiosk (foreground) | ✅ Connects — no more spinner |
| Android front camera | 🔄 Fix committed (flip()), not yet retested |
| Call ending when kiosk hangs up | 🔄 Fix committed, not yet retested |
| Kiosk → Android (foreground) | 🔄 Not yet retested with latest build |
| Kiosk → Android (killed state) | 🔄 Needs test — FCM token fix just deployed |
| Kiosk → Kath iOS (foreground) | 🟡 IncomingCallScreen now visible, accept working but video still spinning |
| Kath → Kiosk (iOS) | 🔄 Needs retest — camera/mic fix + NSCameraUsageDescription added |
| Kiosk → Kath (ntfy from background) | 🔄 queryCalls fix committed, not yet retested |

---

## Immediate next steps

1. **Trigger Android build** (setPushConfig / FCM fix) — iOS build also if you have a new IPA
2. **Install + test in order:**
   a. Android → Kiosk: confirm front camera + call ends properly when kiosk hangs up
   b. Kiosk → Android foreground: confirm IncomingCallScreen + video works
   c. Kiosk → Android killed state: close app fully, have kiosk call — should wake the phone
   d. Kath → Kiosk: confirm no crash, front camera works, video both directions
   e. Kiosk → Kath foreground: accept + video
   f. Kiosk → Kath from background/locked: ntfy still needed while IOSBackgroundKeepAlive is out

---

## SideStore Auto-Refresh (still pending on Kath's iPhone)

**Step 1 — Install shortcut:**
Open Safari on Kath's iPhone → navigate to:
```
https://www.icloud.com/shortcuts/46e9ca6015094e0b868233816b575c2e
```
Tap "Add Shortcut".

**Step 2 — Create automation:**
1. Shortcuts app → Automation tab → **+**
2. Time of Day → 12:00 AM, Daily
3. Next → select SideStore shortcut
4. **Disable "Ask Before Running"** ← critical
5. Done

---

## ntfy setup on Kath's iPhone (for background calling)

1. Install **ntfy** app (free, App Store) — already done ✅
2. Subscribe to the topic set in `VITE_NTFY_TOPIC_KATH` on Vercel env vars
3. When kiosk calls Kath, ntfy sends a push notification with `yapfamily://` deep link
4. Tapping opens the app → `queryCalls` finds the ring → IncomingCallScreen appears
5. Requires Stream ring timeout ≥ 60s (now 90s ✅)

---

## Remaining items

### Calling — both platforms
- [ ] Verify front camera works on both Android and iOS after flip() fix
- [ ] Verify call ends on phone when kiosk hangs up (call.leave() fallback fix)
- [ ] Consider making the kiosk call `call.end()` instead of `call.leave()` so all participants
      get a LEFT event — cleaner than the remotes-fallback approach

### iOS (Kath's iPhone)
- [ ] Test all calling directions with latest IPA
- [ ] Set up SideStore auto-refresh shortcut (instructions above)
- [ ] Background calling when phone is locked — `IOSBackgroundKeepAlive` was removed
      due to crash. Needs re-investigation with a valid `silence.wav` (the
      PowerShell-generated one was malformed). ntfy is the current workaround.
- [ ] Once calling stable: remove `[IncomingCall]` debug logs from kiosk `IncomingCallOverlay.jsx`

### Android (Adrian's Oppo)
- [ ] Test kiosk → Android from killed state (FCM token fix)
- [ ] Once calling stable: retire Yap Dad Companion app

### Yap Dad Companion → Yap Family merge
- [ ] Fold Adrian's `yap-dad-companion` calling into `yap-family-companion` (one app for all)
- Repo: `C:\Users\user\Desktop\Digital Dashboard\yap-dad-companion`
- Adrian identity already exists in yap-family. Once Android calling is verified, retire Yap Dad.

### UX tweaks (backlog)
- [ ] Screenshot → calendar feature (photo of schedule → auto-add events)
- [ ] Any other UX tweaks identified during testing

### Kiosk
- [ ] Remove `[IncomingCall]` debug console.log lines from `IncomingCallOverlay.jsx`
      once calling is confirmed stable on both devices

### Backend
- [x] Groq retry fix deployed ✅

---

## Key constants & URLs
- Supabase URL: https://ygwpigynmxhavqucvwbp.supabase.co
- Fly.io backend: https://yap-calendar-backend.fly.dev
- Chat AI: Groq `llama-3.3-70b-versatile` (GROQ_API_KEY set as Fly secret)
- Kiosk: https://yap-family-home.vercel.app
- Stream API key: `5azqrwjz9fra`
- Stream Dashboard push provider name: `firebase` ✅
- flyctl (this PC): `C:\Users\user\.fly\bin\flyctl.exe`
- flyctl (Beelink): `C:\Users\Yap Family Dashboard\.fly\bin\flyctl.exe`
- `HOUR_HEIGHT = 26` (HomeTab), `HOUR_H = 30` (CalendarTab)

## Key files
- `index.js` — entry point: `StreamVideoRN.setPushConfig()` + `registerRootComponent`
- `App.js` — `StreamWrapper` (client init, queryCalls) + `CallOverlay` (incoming/active UI)
- `src/tabs/HomeTab.js` — outgoing call: `startCall()`, camera.enable/flip, outgoingCallStore
- `src/screens/IncomingCallScreen.js` — incoming call UI, accept() enables camera before join
- `src/screens/ActiveCallScreen.js` — active call UI, remotes fallback calls leave()
- `src/outgoingCallStore.js` — bridges outgoing call from HomeTab to CallOverlay
- `src/streamClient.js` — Stream client singleton, reads identity from AsyncStorage
- `.github/workflows/build-android.yml` — Android APK (workflow_dispatch only)
- `.github/workflows/build-ios.yml` — iOS IPA (workflow_dispatch only)
- Kiosk call overlay: `src/components/widgets/VideoCall/IncomingCallOverlay.jsx`
- `yap-dad-companion/` — Adrian's old single-purpose call app (to be retired)

## SideStore setup reference
- iloader used for install (sidestore.io/installation)
- Pairing file: `C:\Users\user\Desktop\pairing.mobiledevicepairing` (keep — needed if re-pairing)
- pymobiledevice3 installed (Python 3.14): `python -m pymobiledevice3 lockdown save-pair-record`

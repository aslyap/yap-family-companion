# yap-family-companion — Session Handoff

## Status as of 2026-06-21 (session 9)

### Completed this session ✅

**Stream Dashboard**
- Ring timeouts updated to 90000ms (Auto-Cancel, Incoming Call, Missed Call)
- Target Video Resolution set to 2160p (cosmetic, no real impact on phone cameras)

**Companion app (builds triggered — pending install)**
- Android calling fix v2 — `CallOverlay` now detects outgoing call via three sources:
  1. `outgoingRinging`: `useCalls()` RINGING call where `createdBy === identity`
  2. `outgoingCall`: store-based fallback (outgoingCallStore.js)
  3. `active`: JOINED/JOINING call from `useCalls()`
  Debug log now shows all four sources on every state change.
- Hour label alignment fix — removed `Math.max` clamp on 6am label in both
  `HomeTab.js` and `CalendarTab.js`. Label now sits at `top: -5/-6px` above
  the grid line (matching kiosk's `margin-top: -5px`), visible via
  `overflow: visible` on both containers. Applies to Home, Calendar Day, Calendar Week.

### Confirmed working ✅
- Android → Kiosk: call connects, kiosk shows video (spinner fix still pending install)
- Kiosk → Android: works when app is open
- Kiosk ring timeout: 90s (was 15s)

---

## Immediate next steps

1. **Trigger builds** (both are `workflow_dispatch` — push does NOT auto-trigger)
   - GitHub Actions → "Build Android APK" → Run workflow
   - GitHub Actions → "Build iOS IPA (SideStore)" → Run workflow
2. **Install new APK** on Adrian's Oppo
3. **Install new IPA** on Kath's iPhone via SideStore
4. **Test calling** — if still broken, share logcat (`[CallOverlay]` lines) to diagnose

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

1. Install **ntfy** app (free, App Store)
2. Subscribe to the topic set in `VITE_NTFY_TOPIC_KATH` on Vercel env vars
3. When kiosk calls Kath, ntfy sends a push notification with `yapfamily://` deep link
4. Tapping opens the app → IncomingCallScreen appears
5. Requires Stream ring timeout ≥ 60s (now 90s ✅)

---

## Remaining items

### iOS (Kath's iPhone)
- [ ] Trigger + install new IPA via SideStore
- [ ] Set up SideStore auto-refresh shortcut (instructions above)
- [ ] Install ntfy app and subscribe to topic
- [ ] Test kiosk → Kath calling (foreground)
- [ ] Test Kath → Kiosk calling
- [ ] Background calling when phone is locked — `IOSBackgroundKeepAlive` was removed
      due to crash. Needs re-investigation with a valid `silence.wav` (the
      PowerShell-generated one was malformed). ntfy is the current workaround.

### Android (Adrian's Oppo)
- [ ] Trigger + install new APK
- [ ] Test Adrian → Kiosk calling (ActiveCallScreen should now overlay)
- [ ] Test Kiosk → Adrian calling
- [ ] Verify video works both directions
- [ ] If still broken: share logcat `[CallOverlay]` lines to diagnose which
      detection source (outgoingRinging / outgoingCall / active) fires

### Kiosk
- [ ] Remove `[IncomingCall]` debug console.log lines from `IncomingCallOverlay.jsx`
      once calling is confirmed stable on both devices

### Backend
- [x] Groq retry fix deployed ✅

### Yap Dad Companion → Yap Family merge
- [ ] Fold Adrian's `yap-dad-companion` calling into `yap-family-companion` (one app for all family members)
- Repo is at `C:\Users\user\Desktop\Digital Dashboard\yap-dad-companion`
- Key difference: yap-dad-companion is a single-purpose full-screen call app; yap-family is a tab navigator with call overlay
- Adrian's identity is already in yap-family-companion — just needs the same Android Stream calling to work reliably
- Once calling is verified working on both devices, retire yap-dad-companion

---

## Key constants & URLs
- Supabase URL: https://ygwpigynmxhavqucvwbp.supabase.co
- Fly.io backend: https://yap-calendar-backend.fly.dev
- Chat AI: Groq `llama-3.3-70b-versatile` (GROQ_API_KEY set as Fly secret)
- Kiosk: https://yap-family-home.vercel.app
- Stream API key: `5azqrwjz9fra`
- flyctl (this PC): `C:\Users\user\.fly\bin\flyctl.exe`
- flyctl (Beelink): `C:\Users\Yap Family Dashboard\.fly\bin\flyctl.exe`
- `HOUR_HEIGHT = 26` (HomeTab), `HOUR_H = 30` (CalendarTab)

## Key files
- `src/tabs/ChatTab.js` — AI chat (Groq), keyboard fix here
- `src/tabs/HomeTab.js` — Home tab, layout constants HOUR_HEIGHT/GRID_HEIGHT/TIMELINE_W
- `src/tabs/CalendarTab.js` — Calendar, HOUR_H = 30, TimelineLabels component
- `src/screens/IncomingCallScreen.js` — incoming call UI (iOS/Android)
- `src/screens/ActiveCallScreen.js` — active call UI
- `src/outgoingCallStore.js` — bridges outgoing call from HomeTab to CallOverlay
- `App.js` — StreamWrapper + CallOverlay (incoming/active call UI)
- `src/streamClient.js` — Stream Video singleton client + token provider
- `.github/workflows/build-android.yml` — Android APK build (workflow_dispatch only)
- `.github/workflows/build-ios.yml` — iOS IPA build (workflow_dispatch only)
- Kiosk stream service: `src/services/streamVideo.js` (in yap-family-home repo)
- Kiosk call overlay: `src/components/widgets/VideoCall/IncomingCallOverlay.jsx`
- Kiosk screensaver: `src/components/ArtScreensaver.jsx`
- Backend: `calendar_backend.py` (in yap-family-home repo)

## SideStore setup reference
- iloader used for install (sidestore.io/installation)
- Pairing file: `C:\Users\user\Desktop\pairing.mobiledevicepairing` (keep — needed if re-pairing)
- pymobiledevice3 installed (Python 3.14): `python -m pymobiledevice3 lockdown save-pair-record`

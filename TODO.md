# yap-family-companion — Session Handoff

## Status as of 2026-06-21 (session 8)

### Completed this session ✅

**Kiosk (yap-family-home — live on Vercel)**
- IncomingCallOverlay accept race condition fixed — `onActive(call)` now called before camera/mic enable
- Kiosk ring sound — office phone MP3 (Pixabay) via HTML `<audio>` element, loops at full volume
- Screensaver auto-dismisses on incoming call (`yap-incoming-call` CustomEvent)
- Screensaver z-index raised to 10001 (was 400, below screensaver's 9999)
- ntfy re-added to `startCall()` with `yapfamily://` deep link, 6 notifications over 20s
- Backend deployed on Fly.io (Groq retry fix — retries on 400/429/502/503)
- Debug logging in IncomingCallOverlay (can remove once stable)

**Companion app (builds triggered, pending install)**
- iOS crash fix — removed `IOSBackgroundKeepAlive` which crashed on identity selection
- IncomingCallScreen safe area fix — buttons no longer cut off on iPhone
- Chat keyboard fix — `insets.top + 52` offset
- Home tab layout — gap between col headers and 6am removed, 6am/8pm labels visible, Meal Plan always visible at bottom, Tasks uses `flex:1` with per-column scroll
- Calendar tab — 6am label no longer clipped
- Android calling fix — `outgoingCallStore.js` bridges outgoing call to `CallOverlay` (was invisible to `useCalls()`)
- Local notification in `CallOverlay` when ring arrives while iOS app is backgrounded

### Confirmed working ✅
- Android → Kiosk: call screen appears, screensaver dismisses, ring plays, Accept works
- Kiosk → Android: works when app is open

---

## Immediate next steps (do before testing)

1. **Install new APK** on Adrian's Oppo (build triggered, check GitHub Actions)
2. **Install new IPA** on Kath's iPhone via SideStore (build triggered)
3. **Set Stream ring timeout to 60s**
   - Stream Dashboard → Video → Call Types → `default` → Ring Timeout → set to 60
   - Required so ntfy has time to alert Kath before call expires
4. **Deploy backend on Beelink** (already done this session ✅)

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
5. Requires Stream ring timeout ≥ 60s (see above)

---

## Remaining items

### iOS (Kath's iPhone)
- [ ] Install new IPA via SideStore
- [ ] Set up SideStore auto-refresh shortcut (instructions above)
- [ ] Install ntfy app and subscribe to topic
- [ ] Test kiosk → Kath calling (foreground)
- [ ] Test Kath → Kiosk calling
- [ ] Background calling when phone is locked — `IOSBackgroundKeepAlive` was removed due to crash. Needs re-investigation with a valid silence.wav (the PowerShell-generated one was malformed). ntfy is the current workaround.

### Android (Adrian's Oppo)
- [ ] Install new APK
- [ ] Test Adrian → Kiosk calling (spinner fix — `ActiveCallScreen` should now show)
- [ ] Test Kiosk → Adrian calling
- [ ] Verify video works both directions

### Kiosk
- [ ] Set Stream ring timeout to 60s in Stream Dashboard
- [ ] Remove `[IncomingCall]` debug console.log lines from `IncomingCallOverlay.jsx` once calling is stable

### Backend
- [x] Groq retry fix deployed ✅

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
- `src/tabs/CalendarTab.js` — Calendar, HOUR_H = 30
- `src/screens/IncomingCallScreen.js` — incoming call UI (iOS/Android)
- `src/screens/ActiveCallScreen.js` — active call UI
- `src/outgoingCallStore.js` — bridges outgoing call from HomeTab to CallOverlay
- `App.js` — StreamWrapper + CallOverlay (incoming/active call UI)
- `src/streamClient.js` — Stream Video singleton client + token provider
- `.github/workflows/build-android.yml` — Android APK build
- `.github/workflows/build-ios.yml` — iOS IPA build
- Kiosk stream service: `src/services/streamVideo.js` (in yap-family-home repo)
- Kiosk call overlay: `src/components/widgets/VideoCall/IncomingCallOverlay.jsx`
- Kiosk screensaver: `src/components/ArtScreensaver.jsx`
- Backend: `calendar_backend.py` (in yap-family-home repo)

## SideStore setup reference
- iloader used for install (sidestore.io/installation)
- Pairing file: `C:\Users\user\Desktop\pairing.mobiledevicepairing` (keep — needed if re-pairing)
- pymobiledevice3 installed (Python 3.14): `python -m pymobiledevice3 lockdown save-pair-record`

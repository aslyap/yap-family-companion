# yap-family-companion — Session Handoff

## Status as of 2026-06-20 (session 6)

### Completed this session ✅
- **Three calling bugs fixed** (commits `ee04a78` + `d1ca3b4` kiosk)
  1. **Self-ring bug** (App.js `CallOverlay`): when Adrian calls the kiosk, his own call enters RINGING briefly between `getOrCreate()` and `join()`. This caused `IncomingCallScreen` to appear on HIS OWN phone (with vibration + ringtone). Fixed by checking `createdBy.id !== identity` before showing IncomingCallScreen.
  2. **Kiosk accept bug** (kiosk `IncomingCallOverlay.jsx`): when the kiosk user tapped Accept, `call.join()` transitioned the call from RINGING → JOINED, causing `useCalls()` to stop finding the ringing call, which unmounted the entire overlay before `IncomingActiveCall` could render. Fixed by lifting `activeCall` state to `IncomingCallOverlay` (parent), with `acceptingRef` guard to prevent premature dismiss during the join transition.
  3. **Stuck spinner bug** (`CallHomeButton`): after call ends, the 📹 button stayed frozen as a spinner. Fixed by subscribing to `call.state.callingState$` after `join()` and resetting to idle when state → `'left'` or `'idle'`.
- Kiosk deployed to Vercel (auto-deploy via push to main)
- Code pushed — **APK build must be triggered manually** (GitHub Actions → Build Android APK → Run workflow)

### Still needed ⚠️
- **Trigger APK build** — go to GitHub Actions → Build Android APK → Run workflow
- **Verify hour label fix on Adrian's phone** — new APK has the f5843a5 fix (`top = i * HOUR_H - 5`). Check Home + Calendar tabs.
- **Test end-to-end calling with new APK**:
  1. Open kiosk (yap-family-home.vercel.app) DevTools → should see `[Stream] creating kiosk client` + `[Stream] token received for family-hub`
  2. Adrian taps 📹 → should see spinner (no self-ring) → kiosk should show "Dad is calling…" overlay
  3. Kiosk taps Accept → both sides should show active call video
  4. Either side taps hang up → both return to normal; Adrian's 📹 button resets to emoji

---

## Next session priorities

### (i) Test end-to-end call flow 🔴
Trigger APK build manually (GitHub Actions → Build Android APK → Run workflow), install on Adrian's phone, and verify:
- No self-ring on Adrian's phone when he taps 📹
- Kiosk shows incoming ring overlay ("Dad is calling…")
- Accepting on kiosk shows active call video
- Hanging up resets both sides

### (ii) Hour label verification 🟡
Same APK. Check Home tab (6am–8pm) and Calendar tab (Day/Week views).

---

## Key constants & URLs
- `COLORS.adrian = '#5A80A0'`
- `HOUR_HEIGHT = 26` (HomeTab), `HOUR_H = 30` (CalendarTab)
- `GRID_HEIGHT = 364` (14 * 26) — HomeTab full grid height
- `GRID_H = 420` (14 * 30) — CalendarTab grid height
- Supabase URL: https://ygwpigynmxhavqucvwbp.supabase.co
- Fly.io backend: https://yap-calendar-backend.fly.dev
- Chat AI: Groq `llama-3.3-70b-versatile`
- Kiosk: https://yap-family-home.vercel.app
- flyctl: `C:\Users\user\.fly\bin\flyctl.exe`
- Stream API key: `5azqrwjz9fra`

## Key files
- `src/tabs/HomeTab.js` — home screen (calendar grid + tasks + meal plan + Call Home button)
- `src/tabs/CalendarTab.js` — full calendar (Day/Week/Month)
- `src/tabs/ChatTab.js` — AI chat (Groq)
- `src/streamClient.js` — Stream Video singleton client + token provider
- `App.js` — StreamWrapper (Stream client init) + CallOverlay (incoming/active call UI)
- `.github/workflows/build-android.yml` — Android APK build
- Kiosk backend: `c:\Users\user\Desktop\Digital Dashboard\yap-family-home\calendar_backend.py`
- Kiosk call overlay: `c:\Users\user\Desktop\Digital Dashboard\yap-family-home\src\components\widgets\VideoCall\IncomingCallOverlay.jsx`
- Kiosk stream service: `c:\Users\user\Desktop\Digital Dashboard\yap-family-home\src\services\streamVideo.js`

## SideStore setup (completed 2026-06-20)
- iloader used for install (sidestore.io/installation)
- Pairing file at `C:\Users\user\Desktop\pairing.mobiledevicepairing` (keep for re-pairing if needed)
- pymobiledevice3 installed (Python 3.14) — command: `python -m pymobiledevice3 lockdown save-pair-record`
- Apple Mobile Device Service runs via Sideloadly (no iTunes needed day-to-day)

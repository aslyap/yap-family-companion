# yap-family-companion — Session Handoff

## Status as of 2026-06-20 (session 5)

### Completed this session ✅
- **SideStore installed on Kath's iPhone** — certificate now auto-renews forever
  - Used iloader (sidestore.io) + pymobiledevice3 to generate pairing file
  - SideStore signed in, Yap IPA installed via SideStore
  - LocalDevVPN "Connect On Demand" enabled → VPN auto-connects for refresh
  - Background App Refresh enabled for SideStore
  - Kath doesn't need to do anything — refresh is fully automatic
- **Hour label alignment fixed** (HomeTab + CalendarTab)
  - Labels now uniformly centered on their hour lines: `top = i * HOUR_H - lineHeight/2`
  - Re-enabled 6am grid line, added `overflow: 'visible'` to parent rows
  - APK build #43 triggered — install on Adrian's phone to verify
- **Call Home debug logging added** (commit `f5843a5`)
  - `CallHomeButton.startCall()` now catches + logs errors and shows `Alert.alert`
  - Kiosk `streamVideo.js` logs client init and token fetches (deployed to Vercel)

### Still needed ⚠️
- **Verify hour label fix** — install APK #43 on Adrian's phone, check Home + Calendar tabs
- **Fix app-to-kiosk calling** — debug logging now live on both sides:
  1. Open kiosk DevTools (F12 → Console) — should see `[Stream] creating kiosk client, apiKey: 5azqrwjz9fra`
  2. Adrian taps 📹 → if error: Alert shows exact message
  3. Watch kiosk for incoming ring overlay

---

## Next session priorities

### (i) Verify hour label fix on Adrian's phone 🟡
Install APK from GitHub Actions Run #43. Check Home and Calendar tabs:
- 6am label centered on top grid line
- 8pm label centered on bottom grid line
- All hour gaps consistent

### (ii) Fix app-to-kiosk calling 🔴
Debug logging is now live on both sides. To diagnose:
- Open kiosk in browser → DevTools console → should see `[Stream]` logs on page load
- Adrian taps 📹 → if error: Alert shows exact message → fix that error
- If no error on app but kiosk doesn't ring: Stream routing/membership issue

**Relevant files:**
- App: `src/tabs/HomeTab.js` — `CallHomeButton` (~line 427)
- App: `src/streamClient.js` — singleton client + token provider
- App: `App.js` — `StreamWrapper` + `CallOverlay`
- Kiosk: `src/components/widgets/VideoCall/IncomingCallOverlay.jsx`
- Kiosk: `src/services/streamVideo.js`
- Backend: `GET /api/stream/token?user_id=<id>`

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

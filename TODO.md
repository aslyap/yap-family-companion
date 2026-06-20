# yap-family-companion — Session Handoff

## Status as of 2026-06-20 (session 4)

### Completed this session ✅
- **iOS IPA installed on Kath's iPhone** via Sideloadly
  - AltServer couldn't be used (iTunes/iCloud version hell on Windows)
  - Sideloadly worked — installed the Run #5 IPA directly
  - App launches, identity picker works, all tabs load
  - **Problem: certificate expires in 7 days** — needs permanent fix (see next priorities)
- **Call Home bug identified and partially fixed** (commit `8ccc1dd`)
  - Root cause: `useStreamVideoClient()` returns null because `HomeTab` renders outside
    the `<StreamVideo>` context in App.js (intentional, to prevent NavigationContainer remount)
  - Fix: replaced with `getOrCreateClient()` singleton from `streamClient.js`
  - **Calling still broken** — fix is committed but not yet tested end-to-end;
    deeper investigation needed next session
- **Chat AI switched to Groq** — `llama-3.3-70b-versatile` (session 3)
- **UI layout fixes** committed and on main (commits `ff0b860`, `3f973ea`)

### Still needed ⚠️
- **Android APK build** — manually trigger "Build Android APK" in GitHub Actions (main).
  Includes all UI fixes + calling fix.
- **Push latest commits to main** — pending user approval

---

## Next session priorities

### (i) Fix 7-day certificate expiry on Kath's iPhone 🔴
Sideloadly-signed apps expire every 7 days. Need a permanent solution.

**Plan: AltStore + AltServer (start fresh)**
Previous attempt failed due to wrong iTunes/iCloud versions. Starting clean next session:
1. Uninstall ALL Apple software (iTunes MS Store, iCloud MS Store, Apple Devices)
   - Also delete `C:\Program Files (x86)\Common Files\Apple` if it exists
2. Install in this exact order:
   a. iTunes `.exe` from apple.com (NOT Microsoft Store) — scroll down on the iTunes page for the direct download link
   b. iCloud `.exe` from apple.com (NOT Microsoft Store) — look for "Older versions" or direct download
   c. AltServer from altstore.io
3. Connect Kath's iPhone via USB → AltServer tray → Install AltStore
4. In AltStore on iPhone → "+" → install Yap IPA
5. AltStore auto-refreshes every few days while on same Wi-Fi as AltServer

**Alternative if AltServer still fails:**
- Tailscale on Beelink + AltServer on Beelink → Kath's iPhone sees it over Tailscale
- Or accept weekly manual re-sign via Sideloadly (30 seconds, annoying but works)

**Note:** Do NOT pay $99/year Apple Developer account.

### (ii) Fix app-to-kiosk calling 🔴
Both Kath (iPhone) and Adrian (Oppo Android) need to be able to call the kiosk.

**Code fix is committed** (`8ccc1dd`) but calling is still broken. Need to investigate:

**Debugging steps for next session:**
1. Open kiosk in browser → open DevTools console → watch for Stream connection errors
2. On app: add `console.log` / `Alert` in `CallHomeButton.startCall()` to confirm
   `getOrCreateClient()` succeeds and the call is created without error
3. Test the token endpoint directly:
   `curl https://yap-calendar-backend.fly.dev/api/stream/token?user_id=kath`
4. Check Stream dashboard (getstream.io) — can see connected users and call logs
5. Verify kiosk's `VITE_STREAM_API_KEY` matches the app's `STREAM_API_KEY = '5azqrwjz9fra'`
   (check Vercel env vars for yap-family-home)

**Relevant files:**
- App: `src/tabs/HomeTab.js` — `CallHomeButton` (line ~427), uses `getOrCreateClient()`
- App: `src/streamClient.js` — singleton client, token from `/api/stream/token?user_id=`
- App: `App.js` — `StreamWrapper` + `CallOverlay` (detects active/ringing calls)
- App: `src/screens/ActiveCallScreen.js` — full-screen call UI shown by CallOverlay
- Kiosk: `src/components/widgets/VideoCall/IncomingCallOverlay.jsx` — watches `useCalls()` for RINGING
- Kiosk: `src/services/streamVideo.js` — kiosk Stream client (family-hub user)
- Backend: `GET /api/stream/token?user_id=<id>` — mints JWT tokens

**Known architecture:**
- App creates call with `ring: true`, members = `[identity, 'family-hub']`, then joins
- Kiosk's IncomingCallOverlay picks up RINGING state via `useCalls()`
- After kiosk accepts, app's CallOverlay detects JOINED and shows ActiveCallScreen
- Backend allows: kath, adrian, family-hub (all confirmed in STREAM_ALLOWED_USERS)

---

## Key constants & URLs
- `COLORS.adrian = '#5A80A0'`
- `HOUR_HEIGHT = 26` (HomeTab), `HOUR_H = 30` (CalendarTab)
- `GRID_HEIGHT = 364` (14 * 26) — HomeTab full grid height
- `GRID_H = 420` (14 * 30) — CalendarTab grid height
- Supabase URL: https://ygwpigynmxhavqucvwbp.supabase.co
- Fly.io backend: https://yap-calendar-backend.fly.dev
- Chat AI: Groq `llama-3.3-70b-versatile` (GROQ_API_KEY set as Fly secret)
- Kiosk: https://yap-family-home.vercel.app
- flyctl: `C:\Users\user\.fly\bin\flyctl.exe`
- Stream API key: `5azqrwjz9fra`

## Key files
- `src/tabs/HomeTab.js` — home screen (calendar grid + tasks + meal plan + Call Home button)
- `src/tabs/CalendarTab.js` — full calendar (Day/Week/Month)
- `src/tabs/TasksTab.js` — tasks tab
- `src/tabs/MealsTab.js` — meals tab
- `src/tabs/ChatTab.js` — AI chat (Groq); 60s cooldown on error
- `src/services/calendarWriteService.js` — calendar CRUD + Supabase broadcast
- `src/streamClient.js` — Stream Video singleton client + token provider
- `App.js` — StreamWrapper (Stream client init) + CallOverlay (incoming/active call UI)
- `.github/workflows/build-android.yml` — Android APK build
- `.github/workflows/build-ios.yml` — iOS IPA build (SideStore, unsigned)
- Kiosk backend: `c:\Users\user\Desktop\Digital Dashboard\yap-family-home\calendar_backend.py`
- Kiosk app: `c:\Users\user\Desktop\Digital Dashboard\yap-family-home\src\App.jsx`
- Kiosk call overlay: `c:\Users\user\Desktop\Digital Dashboard\yap-family-home\src\components\widgets\VideoCall\IncomingCallOverlay.jsx`
- Kiosk stream service: `c:\Users\user\Desktop\Digital Dashboard\yap-family-home\src\services\streamVideo.js`

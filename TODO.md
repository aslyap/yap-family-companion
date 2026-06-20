# yap-family-companion — Session Handoff

## Status as of 2026-06-20 (session 5)

### Completed this session ✅
- **Hour label alignment fixed** (HomeTab + CalendarTab)
  - Labels now uniformly centered on their hour lines: `top = i * HOUR_H - lineHeight/2`
  - Removed broken first/last special-case hacks
  - Re-enabled 6am grid line (was skipped as workaround for wrong label pos)
  - Added `overflow: 'visible'` to parent rows so 6am label isn't clipped
  - CalendarTab: added explicit `lineHeight: 12` to hourLabel style
  - APK build #43 triggered — install on Adrian's phone to verify
- **Call Home debug logging added** (commit `f5843a5`)
  - `CallHomeButton.startCall()` now catches + logs errors and shows `Alert.alert`
  - `tokenProvider()` logs each attempt/failure
  - Kiosk `streamVideo.js` logs client init (prints apiKey) and token fetches
  - Kiosk changes deployed to Vercel (commit `37415cc` on yap-family-home)
- **SideStore chosen** over AltStore for Kath's iPhone auto-renewal
  - `pymobiledevice3` installed via pip (Python 3.14 on this PC)
  - Next step: connect Kath's iPhone via USB and generate pairing file

### Still needed ⚠️
- **Verify hour label fix** on Adrian's phone once APK #43 is installed
- **Fix app-to-kiosk calling** — debug logging now in place; test by:
  1. Open kiosk DevTools (F12 → Console) — watch for `[Stream]` logs on page load
  2. Adrian taps 📹 on app — watch for Alert (error) or `[Call] joined` in logs
  3. Watch kiosk for incoming ring overlay
- **SideStore setup for Kath's iPhone** (see prompt below)

---

## Next session priorities

### (i) SideStore setup for Kath's iPhone 🔴
`pymobiledevice3` is already installed. Steps remaining:

1. Connect Kath's iPhone via USB (trust the computer on phone if prompted)
2. Generate pairing file:
   ```powershell
   python -m pymobiledevice3 usbmux pair
   python -m pymobiledevice3 usbmux get-pairing-record
   ```
   This outputs a `.mobiledevicepairing` file — note the path.
3. Download SideStore IPA from `sidestore.io`
4. Install SideStore IPA via Sideloadly (same Apple ID as before)
5. Transfer pairing file to iPhone (AirDrop from PC, or email to self)
6. Open SideStore on iPhone → Settings → Pairing File → import the file
7. SideStore sets up WireGuard automatically
8. In SideStore → "+" → install the Yap IPA (Run #5 from GitHub Actions)
9. From now on SideStore auto-refreshes the certificate — no PC needed

**Note:** SideStore uses community anisette servers (occasionally down but reliable).
Pairing file may need regenerating every few months (quick, just USB + PC).

### (ii) Verify hour label fix on Adrian's phone 🟡
Install APK from GitHub Actions Run #43. Check Home and Calendar tabs:
- 6am label centered on top grid line
- 8pm label centered on bottom grid line
- All hour gaps consistent

### (iii) Fix app-to-kiosk calling 🔴
Debug logging is now live on both sides. To diagnose:
- Open kiosk in browser → DevTools console → should see `[Stream] creating kiosk client, apiKey: 5azqrwjz9fra` and `[Stream] token received for family-hub`
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

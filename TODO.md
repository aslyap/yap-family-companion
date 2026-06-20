# yap-family-companion — Session Handoff

## Status as of 2026-06-20 (session 3)

### Completed this session ✅
- **Chat AI switched to Groq** — `llama-3.3-70b-versatile` (30 RPM / 14,400 req/day free tier)
  - Previous Gemini model was hitting rate limits unexpectedly
  - `openai/gpt-oss-120b` was tried first but broke on tool calling history accumulation
  - `llama-3.3-70b-versatile` has full tool calling support and 128k context window
  - Deployed to Fly.io; GROQ_API_KEY set as Fly secret
- **Kiosk real-time calendar sync** ✅ (from previous session, deployed)
- **UI layout fixes** (multiple rounds):
  - Home tab: 6am label at `top:0` (flush with grid), 8pm at `top: i*26-10`, tasks section fixed to `height:110` so Meal Plan never pushed off-screen
  - Calendar Day/Week: 6am label at `top:0` (no longer clipped at scroll top), 8pm at `top: i*30-12`
  - Calendar Month/Week: Legend row top padding removed; weekday header gets 5px top margin
  - Meals tab: Date banner height fixed to 48px (matches Tasks tab)

### APK build needed ⚠️
All UI fixes are on `main` (commits `ff0b860` and `3f973ea`). Manually trigger
**"Build Android APK"** in GitHub Actions to get an APK with all fixes.

---

## Next session priorities

### (i) iOS IPA — install on Kath's iPhone 🔴
Run #5 of "Build iOS IPA (SideStore)" succeeded. Artifact: `yap-family-companion-ipa` (~18.6 MB), **expires 2026-07-19**.
Download: GitHub Actions → "Build iOS IPA (SideStore)" → Run #5 → Artifacts.

**Installation steps (SideStore):**
1. Install SideStore on Kath's iPhone (sidestore.io)
2. Run SideServer on a Mac/PC on the same Wi-Fi network as the iPhone
3. In SideStore, pair with SideServer, then sideload the `.ipa`
4. Sign in as Kath once app opens

**What to test on iOS:**
- App launches, identity picker shows
- Home tab: calendar grid, tasks, meal plan load
- Calendar tab: Day/Week/Month views, Add Event
- Tasks tab, Meals tab, Chat tab
- Call Home button (video call to kiosk)

### (ii) Fix app-to-kiosk calling 🔴
The "Call Home" button in the app (📹 in the Home tab header) uses Stream Video SDK.
It rings the `family-hub` user on the kiosk. The kiosk has an `IncomingCallOverlay` component
that should pop up when a call comes in.

**Known state:** The calling function is broken — the exact failure mode is unknown.
Needs investigation: check if Stream tokens are valid, whether the kiosk is subscribed to
incoming calls, and whether the overlay actually fires.

**Relevant files:**
- App: `src/tabs/HomeTab.js` — `CallHomeButton` component (line ~427)
- App: `src/contexts/IdentityContext.js` — Stream client setup
- Kiosk: `c:\Users\user\Desktop\Digital Dashboard\yap-family-home\src\components\IncomingCallOverlay.jsx`
- Backend: `GET /api/stream-token?userId=<id>` — issues Stream tokens
- Stream project: check `STREAM_API_KEY` / `STREAM_API_SECRET` in Fly secrets

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

## Key files
- `src/tabs/HomeTab.js` — home screen (calendar grid + tasks + meal plan + Call Home button)
- `src/tabs/CalendarTab.js` — full calendar (Day/Week/Month)
- `src/tabs/TasksTab.js` — tasks tab
- `src/tabs/MealsTab.js` — meals tab
- `src/tabs/ChatTab.js` — AI chat (Groq); 60s cooldown on error
- `src/services/calendarWriteService.js` — calendar CRUD + Supabase broadcast
- `src/contexts/IdentityContext.js` — Stream Video client init + identity
- `.github/workflows/build-android.yml` — Android APK build
- `.github/workflows/build-ios.yml` — iOS IPA build (SideStore, unsigned)
- Kiosk backend: `c:\Users\user\Desktop\Digital Dashboard\yap-family-home\calendar_backend.py`
- Kiosk app: `c:\Users\user\Desktop\Digital Dashboard\yap-family-home\src\App.jsx`
- Kiosk call overlay: `c:\Users\user\Desktop\Digital Dashboard\yap-family-home\src\components\IncomingCallOverlay.jsx`

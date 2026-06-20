# yap-family-companion — Session Handoff

## Status as of 2026-06-20

### All phases complete ✅
- D.1 App shell + identity
- D.2 Home tab + Call Home + kiosk IncomingCallOverlay
- D.3 Tasks tab
- D.4 Meals tab
- D.5 Calendar tab (Month/Week/Day + Add Event)
- D.6 Chat tab (Gemini 2.5 Flash, voice, confirmation cards)

---

## Next session work items

### (i) Vercel kiosk refinements (TBD by user)
- Kiosk repo: `c:\Users\user\Desktop\Digital Dashboard\yap-family-home`
- Deployed to Vercel (auto-deploys on push to main)
- Recent fix: events past 8pm now clipped at grid boundary (overflow:hidden + height clamped)

### (ii) APK refinements
Recent fixes committed (need new APK build via GitHub Actions):
- HomeTab: calendar grid fixed to GRID_HEIGHT (no more gap between 8pm and Tasks)
- HomeTab: whole home screen is now a ScrollView (days with many events scroll rather than clip)
- HomeTab: 6am label now visible (8px top padding added to grid area)
- HomeTab: event blocks clipped at 8pm via overflow:hidden on gridCol
- TasksTab: gap between avatar banner and first task reduced (paddingTop 8→4)

To build new APK: GitHub Actions → "Build Android APK" → Run workflow

### (iii) iOS IPA build — in progress
- GitHub Actions workflow: `.github/workflows/build-ios.yml`
- Scheme detection fixed (ls -d, scheme = YapFamily)
- Runner changed to macos-15 + latest-stable Xcode (fixes Swift tools version 6.2 SPM error)
- Last run (#4) failed with Swift tools version mismatch — new workflow should fix this
- To test: GitHub Actions → "Build iOS IPA (SideStore)" → Run workflow
- If build succeeds: download IPA artifact → install via SideStore on Kath's iPhone
- SideStore requires: pairing file from SideServer running on a Mac/PC on same network

---

## Key constants & URLs
- `COLORS.adrian = '#5A80A0'` — nav arrows/labels across all tabs
- `HOUR_HEIGHT = 26` — HomeTab grid row height
- `HOUR_H = 30` — CalendarTab Day/Week grid row height
- `GRID_HEIGHT = 364` (14 * 26) — HomeTab full grid height
- Supabase URL: https://ygwpigynmxhavqucvwbp.supabase.co
- Fly.io backend: https://yap-calendar-backend.fly.dev
- Chat AI: Gemini 2.5 Flash (GEMINI_API_KEY set as Fly secret)

## Key files
- `src/tabs/HomeTab.js` — home screen (calendar grid + tasks + meal plan)
- `src/tabs/TasksTab.js` — tasks tab
- `src/tabs/CalendarTab.js` — full calendar
- `src/tabs/ChatTab.js` — AI chat (Gemini)
- `.github/workflows/build-android.yml` — Android APK build
- `.github/workflows/build-ios.yml` — iOS IPA build (SideStore, unsigned)
- Kiosk: `c:\Users\user\Desktop\Digital Dashboard\yap-family-home\src\components\PersonColumn.jsx`

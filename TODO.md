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

### (i) APK — trigger new build
Run #39 (2026-06-19) missed the last HomeTab fix (`90be81e` — clip events at 8pm).
All fixes are now on main. Manually trigger "Build Android APK" in GitHub Actions.

### (ii) iOS IPA ✅
Run #5 succeeded. Artifact: `yap-family-companion-ipa` (~18.6 MB), expires 2026-07-19.
Download: GitHub Actions → "Build iOS IPA (SideStore)" → Run #5 → Artifacts.
Next step: install via SideStore on Kath's iPhone (needs SideServer on same network).

### (iii) Kiosk real-time calendar sync ✅ (deployed)
Fixed: companion app now broadcasts a Supabase signal after every calendar create/edit/delete.
Kiosk listens on `calendar-updates` channel → clears gcal sessionStorage cache → re-fetches immediately.
No more 1-minute delay after adding events in the app.

### (iv) Chat rate limiting ✅
Root cause: Gemini 2.5 Flash free tier (10 RPM). Agentic loop can use up to 6 calls per message,
so a successful event-add followed immediately by a second message could hit the limit.
Frontend fixes applied:
- Input is preserved on error (not cleared before API call) — user doesn't have to retype
- 60-second client-side cooldown after a 429; send button shows "…" during cooldown
Backend fix still needed: add retry-with-backoff in the Fly.io chat handler for Gemini 429s.
The backend code is on Fly.io (not in any local repo directory on this machine).

---

## Key constants & URLs
- `COLORS.adrian = '#5A80A0'` — nav arrows/labels across all tabs
- `HOUR_HEIGHT = 26` — HomeTab grid row height
- `HOUR_H = 30` — CalendarTab Day/Week grid row height
- `GRID_HEIGHT = 364` (14 * 26) — HomeTab full grid height
- Supabase URL: https://ygwpigynmxhavqucvwbp.supabase.co
- Fly.io backend: https://yap-calendar-backend.fly.dev
- Chat AI: Gemini 2.5 Flash (GEMINI_API_KEY set as Fly secret, free tier, 10 RPM)
- Kiosk calendar broadcast channel: `calendar-updates` (Supabase real-time)

## Key files
- `src/tabs/HomeTab.js` — home screen (calendar grid + tasks + meal plan)
- `src/tabs/TasksTab.js` — tasks tab
- `src/tabs/CalendarTab.js` — full calendar
- `src/tabs/ChatTab.js` — AI chat (Gemini); cooldown state + input-preserve on error
- `src/services/calendarWriteService.js` — calendar CRUD + Supabase broadcast
- `.github/workflows/build-android.yml` — Android APK build
- `.github/workflows/build-ios.yml` — iOS IPA build (SideStore, unsigned)
- Kiosk: `c:\Users\user\Desktop\Digital Dashboard\yap-family-home\src\App.jsx`
- Kiosk: `c:\Users\user\Desktop\Digital Dashboard\yap-family-home\src\components\PersonColumn.jsx`

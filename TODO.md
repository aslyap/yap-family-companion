# yap-family-companion — Session Handoff

## Status as of 2026-06-20 (session 7)

### Completed this session ✅
- **iOS companion app working on Kath's iPhone** via SideStore
  - Stream Video calling works when app is open (foreground)
  - Kiosk "Call Mum" now uses `ring: true` for Kath (ntfy removed)
- **Groq `tool_use_failed` retry fix** — backend retries on 400/429/502/503 with exponential backoff
- **Keyboard fix (iOS Chat)** — `keyboardVerticalOffset` now `insets.top + 52` (was flat 52, covered input)
- **IncomingCallScreen safe area fix** — padding respects notch/home indicator on iPhone
- **Kiosk ntfy removed** — `notifyCallee()` call deleted from `startCall()` in `streamVideo.js`

### Still needs to be done before next session ⚠️
1. **Trigger GitHub Actions builds** (both):
   - Go to `github.com/aslyap/yap-family-companion` → Actions
   - Run **"Build Android APK"** → Run workflow
   - Run **"Build iOS IPA"** → Run workflow
2. **Install new IPA on Kath's phone** via SideStore once build completes
3. **Deploy backend** on Beelink (Groq retry fix):
   ```powershell
   cd "C:\Users\Yap Family Dashboard\Desktop\Digital Dashboard\yap-family-home"
   git pull
   & "C:\Users\Yap Family Dashboard\.fly\bin\flyctl.exe" deploy
   ```
4. **Set up SideStore auto-refresh shortcut on Kath's iPhone** (see below)

---

## SideStore Auto-Refresh Setup (do on Kath's iPhone)

SideStore needs a daily refresh to prevent the 7-day Apple cert from expiring.
An iOS Shortcuts automation handles this silently at midnight.

**Step 1 — Install the shortcut:**
Open Safari on Kath's iPhone and navigate to:
```
https://www.icloud.com/shortcuts/46e9ca6015094e0b868233816b575c2e
```
Tap "Add Shortcut".

**Step 2 — Create the automation:**
1. Open **Shortcuts** app → **Automation** tab → tap **+**
2. Choose **Time of Day** → set to **12:00 AM**, repeat **Daily**
3. Tap **Next** → find and select the **SideStore** shortcut
4. **Disable "Ask Before Running"** ← critical, otherwise it prompts Kath every night
5. Tap **Done**

Kath never needs to manually open SideStore again. Source: https://github.com/orgs/SideStore/discussions/1096

---

## Next session priorities

### (i) 2-way calling — both iOS and Android 🔴
Current state:
- **App → Kiosk** (Adrian taps 📹): being debugged in a separate session. Stream ring + kiosk overlay should work. Verify with new APK.
- **Kiosk → App (foreground)**: works when app is open — `ring: true` now set for both `kath` and `adrian`
- **Kiosk → App (background/closed)**: NOT YET DONE — needs APNs VoIP push for iOS, FCM for Android
  - For iOS: requires APNs VoIP certificate uploaded to Stream dashboard + PushKit in the app
  - For Android: FCM push may already work via Stream SDK (test with new APK)
  - Adrian's Yap Dad Companion APK has the "must open app first" issue — same root cause

### (ii) SideStore auto-refresh ✅ (pending setup on Kath's phone)
Instructions above. Once done, verify by checking the automation ran the next morning.

### (iii) UX tweaks — kiosk and both apps 🟡
Gather list of UX issues from testing the new builds. Known issues:
- IncomingCallScreen button layout cut off (fixed in new build — verify)
- Chat keyboard covering input on iOS (fixed in new build — verify)
- Any other UX issues discovered during call testing

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
- `src/screens/IncomingCallScreen.js` — incoming call UI, safe area fix here
- `src/streamClient.js` — Stream Video singleton client + token provider
- `App.js` — StreamWrapper + CallOverlay (incoming/active call UI)
- `.github/workflows/build-android.yml` — Android APK build
- `.github/workflows/build-ios.yml` — iOS IPA build
- Kiosk stream service: `src/services/streamVideo.js` (in yap-family-home repo)
- Kiosk call overlay: `src/components/widgets/VideoCall/VideoCallOverlay.jsx`
- Backend: `calendar_backend.py` (in yap-family-home repo)

## SideStore setup reference
- iloader used for install (sidestore.io/installation)
- Pairing file: `C:\Users\user\Desktop\pairing.mobiledevicepairing` (keep — needed if re-pairing)
- pymobiledevice3 installed (Python 3.14): `python -m pymobiledevice3 lockdown save-pair-record`

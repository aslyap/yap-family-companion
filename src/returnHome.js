import { Platform, BackHandler } from 'react-native';
import { debugLog } from './debugLog';

// Send the app to the background / Android home screen when a call ends.
//
// This companion is mostly a passive call receiver: an incoming call wakes it —
// often from a killed state, straight onto the call screen — and once the call is
// over the user wants their normal phone back, not the app's calendar tab left in
// the foreground.
//
// This previously launched the HOME intent (ACTION_MAIN + CATEGORY_HOME). That
// worked when the app was already open, but NOT when the call had cold-started the
// app: a cold start launches MainActivity with showWhenLocked/turnScreenOn (set by
// the withLockScreenCall plugin so the screen wakes for a call), and launching HOME
// could not background an activity pinned on top by those flags.
//
// BackHandler.exitApp() invokes the activity's *default back behaviour* instead —
// the same thing the system back gesture does at the task root, which moves the
// task to the background and reveals the launcher. That finishes/backgrounds the
// activity regardless of the lockscreen flags, so it works on a cold start too.
// (It does not hard-kill the process; FCM re-wakes the app for the next call.)
//
// iOS is intentionally a no-op: apps may not background themselves on iOS, and it
// doesn't matter there — the call screen simply dismisses back to wherever we were.
export function returnToAndroidHome() {
  // TEMPORARY (strip with SHOW_CALL_DEBUG): exitApp() only backgrounds the app, it
  // does not kill the process, so these lines survive and are readable by reopening
  // the app. That distinguishes "never reached" from "reached but didn't background".
  debugLog(`returnHome: called (${Platform.OS})`);
  if (Platform.OS !== 'android') return;
  try {
    BackHandler.exitApp();
    debugLog('returnHome: exitApp returned');
  } catch (err) {
    debugLog(`returnHome: exitApp FAILED: ${err?.message ?? err}`);
    console.warn('[returnHome] exitApp failed:', err);
  }
}

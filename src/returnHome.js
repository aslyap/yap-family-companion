import { Platform } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';

// Send the app to the background and show the Android home screen.
//
// Called when a call ends. This companion is mostly a passive call receiver: an
// incoming call wakes it (often from a killed state, straight onto the call
// screen), and once the call is over the user wants their normal phone back, not
// the app's calendar tab left sitting in the foreground.
//
// There is no JS API to "background the current app", but launching the launcher's
// own HOME intent has the same visible effect — our activity drops behind the home
// screen. FLAG_ACTIVITY_NEW_TASK (0x10000000) is required to start an activity
// that isn't part of our own task.
//
// iOS is intentionally a no-op: apps may not background themselves on iOS, and it
// doesn't matter there — the call screen simply dismisses back to wherever we were.
export function returnToAndroidHome() {
  if (Platform.OS !== 'android') return;
  IntentLauncher.startActivityAsync('android.intent.action.MAIN', {
    category: 'android.intent.category.HOME',
    flags: 0x10000000, // FLAG_ACTIVITY_NEW_TASK
  }).catch(err => console.warn('[returnHome] failed to background app:', err));
}

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

// "The kids called and nobody picked up."
//
// Android only, and that asymmetry is deliberate. On iOS the ring arrives as a
// Bark Critical Alert, and the kiosk rewrites that same notification into a
// missed-call line by pushing again with the same `id` (notifyCalleeMissed in the
// kiosk's streamVideo.js) — which both records the missed call AND clears the
// stale "Tap to answer" alert that would otherwise sit on the lock screen for
// hours offering to answer a call that ended long ago. Android has no such
// notification to rewrite: Stream's own incoming-call notification goes away with
// the call and leaves nothing behind, so the phone shows no trace that anyone
// rang. This fills that gap, from the app itself.
//
// ⚠️ expo-notifications was removed from this app in 7873da9, which deleted a local
// notification that competed with Bark on iOS. This is not that notification
// coming back. That one fired WHILE a call was ringing, duplicating an alert the
// backend was already sending and racing it; this one fires only after a call has
// ended unanswered, on the platform Bark never touches.
//
// Posted BEFORE returnToAndroidHome(): that backgrounds the app via
// BackHandler.exitApp(), and handing the notification to the OS first means it
// does not depend on this process still being alive a moment later.

const CHANNEL_ID = 'missed-calls';

let channelReady = false;

async function ensureChannel() {
  if (channelReady || Platform.OS !== 'android') return;
  // Its own channel rather than the default one: the incoming-call channel is
  // loud and full-screen by design, and a missed call must not ring. A separate
  // channel also lets it be silenced independently without touching the ring.
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Missed calls',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 200],
    enableVibrate: true,
  });
  channelReady = true;
}

/**
 * Post a missed-call notification. Safe to call on any platform; a no-op off
 * Android.
 *
 * Errors are reported, never swallowed — a missed-call note that silently fails
 * to post is indistinguishable from a call that never rang, which is the exact
 * confusion this exists to remove.
 */
export async function postMissedCall(at = new Date()) {
  if (Platform.OS !== 'android') return;
  try {
    await ensureChannel();
    const when = at.toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit' });
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Missed call',
        body: `Yap Family called at ${when}`,
        // No sound: the phone has already rung for this call.
        sound: false,
      },
      // ChannelAwareTriggerInput: delivered immediately, on this channel. Not
      // `trigger: null` — that is also immediate but names no channel, so Android
      // would fall back to the default one (Expo SDK 56 notifications docs).
      trigger: { channelId: CHANNEL_ID },
    });
    console.log('[missed] posted missed-call notification');
  } catch (err) {
    console.warn('[missed] failed to post missed-call notification:', err);
  }
}

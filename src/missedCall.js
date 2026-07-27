import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { debugLog } from './debugLog';

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
const DATA_TAG = 'yapMissedCall';

// ⚠️ Session 25: without this handler the notification was posted and never seen.
// expo-notifications drops a notification delivered while the app is FOREGROUND
// unless a handler says to show it — "the default behavior when the handler is not
// set or does not respond in time is not to show the notification" (Expo SDK 56
// notifications docs). And foreground is exactly when ours arrives: CallOverlay
// posts it and calls returnToAndroidHome() in the same tick, so delivery lands
// during the activity's exit transition, while the app still counts as active.
// The channel was created, the post succeeded, and nothing appeared.
//
// Deliberately scoped to OUR notification by `data` tag. A handler is global, and
// returning "show" for everything would change how every other notification behaves
// in the foreground — including anything Stream posts for an incoming call, where an
// extra banner over a live ring is the iOS bug 7873da9 removed. Everything else
// keeps today's behaviour explicitly.
Notifications.setNotificationHandler({
  handleNotification: async notification => {
    const mine = notification?.request?.content?.data?.[DATA_TAG] === true;
    return {
      shouldShowBanner: mine,
      shouldShowList: mine,
      // Never a sound: the phone has already rung for this call.
      shouldPlaySound: false,
      shouldSetBadge: false,
    };
  },
});

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
        // Read by the notification handler above, which shows only our own.
        data: { [DATA_TAG]: true },
      },
      // ChannelAwareTriggerInput: delivered immediately, on this channel. Not
      // `trigger: null` — that is also immediate but names no channel, so Android
      // would fall back to the default one (Expo SDK 56 notifications docs).
      trigger: { channelId: CHANNEL_ID },
    });
    // TEMPORARY (strip with SHOW_CALL_DEBUG). console.log/warn go NOWHERE on this
    // phone — no adb, and debugLog is a separate buffer that does not capture the
    // console — so the two lines below were the only report this had, and a post
    // that succeeded, a post that threw, and a post that was never reached all read
    // identically: nothing on the lock screen. Session 25 lost a call to that.
    debugLog(`missed: posted for ${when}`);
    console.log('[missed] posted missed-call notification');
  } catch (err) {
    debugLog(`missed: FAILED: ${err?.message ?? err}`);
    console.warn('[missed] failed to post missed-call notification:', err);
  }
}

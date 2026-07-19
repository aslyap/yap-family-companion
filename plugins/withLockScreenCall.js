const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Lets an incoming call wake the device and show over the lockscreen.
 *
 * @stream-io/react-native-callingx builds the incoming-call notification with
 * setFullScreenIntent(...), CATEGORY_CALL and PRIORITY_MAX, and the intent it
 * launches is getLaunchIntentForPackage() — this app's MainActivity.
 *
 * A full-screen intent only wakes the screen if the Activity it launches is
 * flagged to do so. Neither callingx nor Expo's default template sets those
 * flags, so on a locked phone the call rings but the display stays black.
 *
 * showWhenLocked — allow the Activity to display above the keyguard.
 * turnScreenOn   — power the display on when the Activity starts.
 *
 * Both are Android 8.1+ (API 27); minSdkVersion here is 24, but older versions
 * simply ignore unknown manifest attributes, so no guard is needed.
 *
 * This is a manifest mod because the project has no committed android/ dir —
 * CI runs `expo prebuild --clean`, which would discard any hand-edit.
 */
const withLockScreenCall = config =>
  withAndroidManifest(config, cfg => {
    const app = cfg.modResults.manifest.application?.[0];
    const mainActivity = app?.activity?.find(
      a => a.$?.['android:name'] === '.MainActivity',
    );

    if (!mainActivity) {
      throw new Error(
        '[withLockScreenCall] .MainActivity not found in AndroidManifest — ' +
          'cannot enable lockscreen wake for incoming calls.',
      );
    }

    mainActivity.$['android:showWhenLocked'] = 'true';
    mainActivity.$['android:turnScreenOn'] = 'true';

    return cfg;
  });

module.exports = withLockScreenCall;

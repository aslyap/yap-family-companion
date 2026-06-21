import { registerRootComponent } from 'expo';
import { StreamVideoRN } from '@stream-io/video-react-native-sdk';

import App from './App';
import { getOrCreateClient } from './src/streamClient';

// Must be called before registerRootComponent so the push config is in place
// when the native callingx module wakes the app from a killed/background state.
//
// isExpo: false — use @react-native-firebase/messaging directly.
// pushProviderName must match the Firebase provider name in the Stream Dashboard
// (Settings → Push Notifications). The default is 'firebase'.
//
// getOrCreateClient reads yap_identity from AsyncStorage so the FCM background
// handler and App.js share the same client instance — useCalls() sees the
// active ring call immediately when the app opens from a notification tap.
StreamVideoRN.setPushConfig({
  isExpo: false,
  android: {
    pushProviderName: 'firebase',
    incomingChannel: {
      id: 'stream_incoming_call_notifications',
      name: 'Incoming Calls',
    },
    notificationTexts: {
      title: 'Yap Family calling',
      body: 'Tap to answer',
    },
  },
  createStreamVideoClient: getOrCreateClient,
});

registerRootComponent(App);

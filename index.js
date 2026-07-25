import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import {
  StreamVideoRN,
  firebaseDataHandler,
  isFirebaseStreamVideoMessage,
} from '@stream-io/video-react-native-sdk';

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

// Android FCM ring handlers — REQUIRED, and previously missing.
//
// setPushConfig alone is not enough on non-Expo Android: it registers the client
// factory and the notification channel, but nothing forwards the incoming FCM
// `call.ring` message to the SDK. The app must do that itself by calling
// firebaseDataHandler, which runs client.onRingingCall(call_cid) and thereby puts
// the call into useCalls() so CallOverlay can show the ring screen.
//
// Without these handlers, a call that arrives while the app is killed/backgrounded
// was never turned into a call the JS layer knew about: the client connected but
// useCalls() stayed empty, and the app woke onto its Home screen instead of ringing
// (the Oppo strip read exactly this — `me=adrian calls=0` on a cold start). The
// app-open case worked only because the live WebSocket delivers call.ring directly.
//
// Android-only: iOS has no data-message background path here (no APNs/VoIP on the
// free SideStore cert), so there is nothing for these handlers to do there.
if (Platform.OS === 'android') {
  // Background/terminated: this headless handler is the only JS that runs when a
  // data FCM message arrives with the app not in the foreground.
  messaging().setBackgroundMessageHandler(async message => {
    if (isFirebaseStreamVideoMessage(message)) {
      await firebaseDataHandler(message.data);
    }
  });
  // Foreground: the WebSocket usually delivers call.ring first, but forward the
  // push too so a ring is never dropped if the socket is mid-reconnect.
  messaging().onMessage(message => {
    if (isFirebaseStreamVideoMessage(message)) {
      firebaseDataHandler(message.data);
    }
  });
}

registerRootComponent(App);

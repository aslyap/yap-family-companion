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
import { markCallPending } from './src/pendingCall';

// ANDROID ONLY — deliberately not called on iOS. This is what made iOS Accept slow.
//
// setPushConfig unconditionally calls callingx.setup() (StreamVideoRN/index.js),
// which sets CallingxModule.isSetup = true on whatever platform it runs on. On iOS
// that flag puts call.join() onto the CallKit path, and every incoming call then
// awaits, before the join flow even starts:
//   1. CallingxModule.displayIncomingCall()  — no timeout
//   2. CallingxModule.answerIncomingCall()   — no timeout
//   3. waitForAudioSessionActivation()       — 5000ms timeout
// Step 3 only resolves early on CallKit's didActivateAudioSession, which CANNOT
// fire here: the free SideStore cert has no aps-environment entitlement, so
// PushKit/CallKit never function. The debug strip measured exactly this — a
// successful accept sat in `ringing` for 5012ms (the 5000ms timeout) before
// reaching JOINING, and the actual SFU connect that followed took 946ms. A first
// accept after cold start hung the full 30s instead, because steps 1-2 have no
// timeout at all.
//
// A second, quieter effect of the same flag: shouldBypassForCallKit()
// (registerSDKGlobals.js) skips StreamInCallManager on iOS whenever isSetup is
// true, on the assumption CallKit owns the audio session. It doesn't here, so
// nothing was configuring the iOS audio session for calls. Leaving callingx
// un-set-up on iOS hands that job back to StreamInCallManager, where it belongs.
//
// Nothing is lost on iOS: there is no APNs/VoIP path on this cert, so the push
// config's payload is Android-only anyway (the android block, plus
// createStreamVideoClient for FCM wake-ups). iOS is rung by Bark and opened by the
// yapfamily:// deep link, which App.js recovers via client.onRingingCall — none of
// that goes through StreamVideoRN.
//
// Must be called before registerRootComponent so the config is in place when the
// native module wakes the app from a killed/background state.
//
// isExpo: false — use @react-native-firebase/messaging directly.
// pushProviderName must match the Firebase provider name in the Stream Dashboard
// (Settings → Push Notifications). The default is 'firebase'.
//
// getOrCreateClient reads yap_identity from AsyncStorage so the FCM background
// handler and App.js share the same client instance — useCalls() sees the
// active ring call immediately when the app opens from a notification tap.
if (Platform.OS === 'android') {
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
      // Session 29: REVERTED after a live test. Was set to `true` to fix a
      // reported duplicate (heads-up banner + full-screen call UI both
      // showing when the app is foregrounded) — see git history / TODO.md
      // for the reasoning, which was sound as far as it went. But live
      // testing turned up THREE regressions all specific to that exact
      // scenario (foregrounded call), strong evidence this flag caused them:
      // (1) no ringtone sound at all — Android's ring sound is played BY the
      // notification channel itself (this app's own IncomingCallScreen.js
      // has a comment confirming this: "Android still plays its native
      // incoming-call ring via the notification channel — this screen only
      // adds a buzz"), and this flag suppresses that notification entirely
      // in foreground, silently killing the sound along with the visual
      // duplicate it was meant to fix; (2) Accept did nothing — the debug
      // strip's green text (only ever absent when IncomingCallPlaceholder is
      // showing instead of the real IncomingCallScreen — see App.js) was
      // missing, meaning the app was stuck on the pre-call placeholder cover
      // with no real call object behind it to accept; (3) presumably tied to
      // the same root cause as (2). A silent, unjoinable call is a much
      // worse failure than a redundant banner — reverting outright rather
      // than trying to patch around it blind. If this is revisited, the
      // right next step is understanding WHY skipping the notification also
      // breaks call.join()/the ring-sound path, not just re-flipping this
      // flag and hoping.
      skipIncomingPushInForeground: false,
    },
    createStreamVideoClient: getOrCreateClient,
  });
}

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
      // Flag the call BEFORE awaiting the handler, not after. This is the earliest
      // moment anything in JS knows a call is coming, and the whole point of the
      // flag is to cover the seconds that follow (token fetch, connectUser,
      // onRingingCall) during which App.js would otherwise show its Home tab.
      // The cid comes along for the ride: it is what lets the cover show working
      // Accept/Decline buttons during the connect instead of a spinner (see
      // src/callIntent.js).
      //
      // Session 29: gated on type === 'call.ring', matching firebaseDataHandler's
      // OWN internal check one line below (it does nothing for any other type).
      // This used to fire unconditionally for ANY Stream video FCM message —
      // isFirebaseStreamVideoMessage() only checks data.sender === 'stream.video',
      // not the event type. Stream's dashboard can independently enable pushes for
      // call.missed (and others) alongside call.ring (GetStream's own docs:
      // "You can enable/disable push notifications for the call.ring and
      // call.missed events" separately) — a call.missed push for a call that just
      // ended would carry its own cid and, unfiltered, would re-raise the pending-
      // call cover / re-trigger firebaseDataHandler for a call that is already
      // over. Investigated as a live suspect for the ~10s-later reappearing call
      // screen (see yap-family-companion/TODO.md) — not confirmed as THE cause,
      // but tightening this to match firebaseDataHandler's own contract is correct
      // regardless of whether it turns out to be it.
      if (message.data?.type === 'call.ring') {
        markCallPending(message.data?.call_cid);
      }
      await firebaseDataHandler(message.data);
    }
  });
  // Foreground: the WebSocket usually delivers call.ring first, but forward the
  // push too so a ring is never dropped if the socket is mid-reconnect.
  messaging().onMessage(message => {
    if (isFirebaseStreamVideoMessage(message)) {
      if (message.data?.type === 'call.ring') {
        markCallPending(message.data?.call_cid);
      }
      firebaseDataHandler(message.data);
    }
  });
}

registerRootComponent(App);

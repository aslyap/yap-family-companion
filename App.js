import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ActivityIndicator, AppState, Platform, PermissionsAndroid, StyleSheet, Alert, Linking } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import { useFonts } from 'expo-font';
import {
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
  Figtree_700Bold,
} from '@expo-google-fonts/figtree';
import {
  StreamVideo,
  StreamCall,
  useCalls,
  CallingState,
} from '@stream-io/video-react-native-sdk';

import { SafeAreaProvider } from 'react-native-safe-area-context';
import { IdentityProvider, useIdentity } from './src/contexts/IdentityContext';
import AppNavigator from './src/navigation/AppNavigator';
import IncomingCallScreen from './src/screens/IncomingCallScreen';
import IncomingCallPlaceholder from './src/screens/IncomingCallPlaceholder';
import ActiveCallScreen from './src/screens/ActiveCallScreen';
import { getOrCreateClient, clearClient } from './src/streamClient';
import { onOutgoingCallChange, getOutgoingCall } from './src/outgoingCallStore';
import { getDebugLines, onDebugLog, debugLog } from './src/debugLog';
import { callSeq } from './src/callTrace';
import { markCallPending, clearCallPending, useCallPending, isCallPending, getPendingCid } from './src/pendingCall';
import { isAccepting, pruneAccepting } from './src/acceptState';
import { returnToAndroidHome } from './src/returnHome';
import { postMissedCall } from './src/missedCall';
import { COLORS } from './src/theme';

// TEMPORARY — set to false (or delete CallDebugStrip) once the cold-start ring works.
const SHOW_CALL_DEBUG = true;

// TEMPORARY — which build this reading came from.
//
// Twice in session 20 a conclusion was drawn from a phone running the previous
// APK. The `#N` prefix cannot catch that: it is a per-process call counter and
// reads identically in every build. The workflows set this to the short SHA they
// built, so the strip names its own commit; `dev` means a local Metro bundle.
const BUILD_TAG = process.env.EXPO_PUBLIC_BUILD_TAG ?? 'dev';

const PACKAGE = 'com.yapfamily.companion';

// These settings intents take a `package:` data URI — not extras. Linking.sendIntent
// does not fire them in this Expo build, so go through expo-intent-launcher.

// Opens the system dialog asking Android to exempt this app from battery optimisation,
// so the FCM handler isn't killed while the app is backgrounded/killed.
function openBatteryOptimizationSettings() {
  return IntentLauncher.startActivityAsync(
    'android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
    { data: `package:${PACKAGE}` },
  ).catch(() => {
    // Fallback: the battery optimisation list, so the user can find the app manually.
    IntentLauncher.startActivityAsync(
      'android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS',
    ).catch(() => {});
  });
}

// Opens the Android 14+ "Use full-screen intents" page for this app — required for the
// screen to wake on an incoming call. Pre-Android 14 the permission is auto-granted and
// this page doesn't exist, so fall back to App Info.
function openFullScreenIntentSettings() {
  return IntentLauncher.startActivityAsync(
    'android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENT',
    { data: `package:${PACKAGE}` },
  ).catch(() => {
    IntentLauncher.startActivityAsync(
      'android.settings.APPLICATION_DETAILS_SETTINGS',
      { data: `package:${PACKAGE}` },
    ).catch(() => {});
  });
}

// Lives inside <StreamVideo> — detects ring/active calls and overlays them above the
// tab navigator using absoluteFillObject. Returns null when no call is active.
function CallOverlay() {
  const calls = useCalls();
  const { identity } = useIdentity();

  // Calls we initiated — useCalls() may track them as RINGING (before kiosk accepts)
  // or JOINED/JOINING (after kiosk accepts).
  const outgoingRinging = calls.find(
    c =>
      c.state.callingState === CallingState.RINGING &&
      c.state.createdBy?.id === identity,
  );
  // RECONNECTING and MIGRATING count as active.
  //
  // Measured on the failing second call: `state reconnecting +18922ms`, mid-accept.
  // Neither state matched here and neither matches the incoming-ring filter below,
  // so the overlay rendered NOTHING — the call screen vanished and the app's own
  // Home tab appeared while the call was still being joined. The SDK reconnects and
  // migrates SFUs as normal parts of a join (it sets `migrating_from` after two
  // failed attempts), so these are ordinary states of a live call, not end states.
  //
  // A call we have started accepting is active for the whole of its join, whatever
  // the SDK's state momentarily says. Without that clause the RINGING flap matches
  // neither this filter nor the incoming one below, and the overlay renders nothing
  // at all — a blank app in the middle of answering a call. LEFT/endedAt still win,
  // so an accept that genuinely fails cannot pin a dead call on screen.
  const isLive = c =>
    c.state.callingState !== CallingState.LEFT && !c.state.endedAt;
  const active = calls.find(
    c =>
      c.state.callingState === CallingState.JOINED ||
      c.state.callingState === CallingState.JOINING ||
      c.state.callingState === CallingState.RECONNECTING ||
      c.state.callingState === CallingState.MIGRATING ||
      (isAccepting(c.cid) && isLive(c)),
  );
  // Incoming ring: a call someone ELSE created that we have not joined or left.
  //
  // Deliberately accepts IDLE as well as RINGING. RINGING is only set by the live
  // `call.ring` websocket event — a call recovered by queryCalls() after the app
  // was woken from a killed state never saw that event, so it arrives as IDLE.
  // Matching only RINGING meant a push woke the phone, the app opened, and the
  // caller sat ringing with the callee looking at the home screen.
  // endedAt guards against surfacing a call that has already finished.
  //
  // A call we have already started accepting is never an incoming ring again, even
  // when it flaps back to RINGING. join() restores the previous calling state when
  // an attempt fails, so a call being joined re-enters RINGING for a second or two;
  // without this the overlay swaps back to the ring screen mid-join and offers
  // Accept on a call that cannot be joined twice. See src/acceptState.js.
  const incomingRingCall = calls.find(
    c =>
      (c.state.callingState === CallingState.RINGING ||
        c.state.callingState === CallingState.IDLE) &&
      c.state.createdBy?.id !== identity &&
      !c.state.endedAt &&
      !isAccepting(c.cid),
  );

  const userDeclinedRef = useRef(false);
  // Belt-and-suspenders store: catches the call even if useCalls() misses it.
  const [outgoingCall, setOutgoingCallState] = useState(() => getOutgoingCall());
  useEffect(() => onOutgoingCallChange(call => setOutgoingCallState(call)), []);

  useEffect(() => {
    // Number every call the moment it is first seen, not at accept: a call that
    // merely RANG and was cancelled from the kiosk poisons the next one exactly as
    // much as an answered one does, so it has to consume an ordinal or the numbers
    // stop lining up with what was actually done to the phone. Numbering only —
    // participant state is watched by traceCall, never from an effect.
    calls.forEach(callSeq);
    // Forget accept flags for calls the client no longer holds, so the set cannot
    // grow for the life of the process.
    pruneAccepting(calls.map(c => c.cid));
    console.log('[CallOverlay] calls:', calls.map(c => `${c.id.slice(-8)}:${c.state.callingState}:createdBy=${c.state.createdBy?.id}`).join(', ') || '(none)');
    console.log('[CallOverlay] active:', active?.id?.slice(-8) ?? 'null', '| outgoingRinging:', outgoingRinging?.id?.slice(-8) ?? 'null', '| outgoingCallStore:', outgoingCall?.id?.slice(-8) ?? 'null', '| incomingRing:', incomingRingCall?.id?.slice(-8) ?? 'null');
  }, [calls, outgoingCall]);

  // When a call screen was showing and then goes away, the call has ended
  // (declined, hung up, cancelled by the kiosk, or the remote dropped). Background
  // the app so the phone returns to the normal Android home screen rather than
  // sitting on the app's own Home tab. One place catches every end path.
  const showingCall = !!(active || outgoingRinging || outgoingCall || incomingRingCall);
  const wasShowingCallRef = useRef(false);

  // Was the call that is currently on screen an incoming ring nobody has dealt
  // with yet? Tracked as a ref rather than derived at teardown because by the time
  // the screen goes away the call is already gone from useCalls() — there is
  // nothing left to inspect.
  //
  // 'answered' the moment it becomes active or Accept is pressed, 'declined' when
  // Decline is. Still 'ringing' when the screen disappears means it rang out:
  // either the kiosk gave up or the caller hung up. That is a missed call.
  const ringOutcomeRef = useRef(null);
  if (incomingRingCall) ringOutcomeRef.current = 'ringing';
  if (active || (incomingRingCall && isAccepting(incomingRingCall.cid))) {
    ringOutcomeRef.current = 'answered';
  }
  if (userDeclinedRef.current && ringOutcomeRef.current === 'ringing') {
    ringOutcomeRef.current = 'declined';
  }

  useEffect(() => {
    if (wasShowingCallRef.current && !showingCall) {
      // Before returnToAndroidHome(), which backgrounds the app — hand the
      // notification to the OS while this process is still definitely alive.
      //
      // ⚠️ AWAITED, not fire-and-forget. postMissedCall() awaits channel creation
      // first, so the unawaited version reliably lost the race with exitApp() and
      // did its actual posting mid-exit-transition. postMissedCall never rejects
      // (it reports its own errors), so this cannot strand the app on the call
      // screen.
      const missed = ringOutcomeRef.current === 'ringing';
      ringOutcomeRef.current = null;
      if (missed) postMissedCall().finally(returnToAndroidHome);
      else returnToAndroidHome();
    }
    wasShowingCallRef.current = showingCall;
  }, [showingCall]);

  // A real call screen is up, so the "call is coming" placeholder has done its job.
  // Also covers the end of the call: without this, the flag would still be inside
  // its TTL and the placeholder would flash back up as the call screen unmounts.
  useEffect(() => {
    if (showingCall) clearCallPending();
  }, [showingCall]);

  // The app used to post its own local notification here whenever a ring arrived
  // while it was not foreground. Removed: on iOS it was a second, competing alert
  // for the same call, and it could break the call it announced.
  //
  // It never added reach. Its guard was `appState !== 'active'`, which is exactly
  // the condition under which the backend also sends Bark — so it only ever fired
  // alongside Bark, and being an ordinary notification it stays silent on silent
  // mode, which is the case Bark's Critical Alert exists for.
  //
  // What it cost: measured on device, the local notification is in-process and
  // instant while Bark is 1.2s of deliberate hold plus the api.day.app relay and
  // APNs — about 5s apart. Tapping the early one opens the app and the call is
  // answered, and then Bark rings over the live call, holds the iOS audio session
  // and mutes it in BOTH directions until it is swiped away. That is the failure
  // cd45317 exists to prevent, arriving by a different route.
  //
  // ⚠️ The one thing this gives up: if a Bark push is ever rejected outright (bad
  // device key, Bark down) there is now no second alert at all. Accepted
  // deliberately — a silent banner was never going to be the thing that reached
  // her, and `[ring] bark rejected` in the Fly log is the signal to watch for.

  // Show active screen for: joined call, our outgoing ring (waiting for kiosk to accept),
  // or store-tracked call (belt-and-suspenders if useCalls() missed it).
  const displayActive = active || outgoingRinging || outgoingCall;
  if (displayActive) {
    return (
      <View style={StyleSheet.absoluteFillObject}>
        <StreamCall call={displayActive}>
          <ActiveCallScreen onLeft={() => setOutgoingCallState(null)} />
        </StreamCall>
        {/* TEMPORARY — the strip used to render only on the no-call branch, so the
            participant/track lines could not be read until the call was over. The
            broken second call sits on a spinner indefinitely, which is precisely
            when the reading is wanted. pointerEvents="none", so Hang Up still
            works underneath it. */}
        <CallDebugStrip calls={calls} identity={identity} />
      </View>
    );
  }
  if (incomingRingCall) {
    return (
      <View style={StyleSheet.absoluteFillObject}>
        <StreamCall call={incomingRingCall}>
          <IncomingCallScreen
            onAccepted={() => {}}
            onDeclineStart={() => { userDeclinedRef.current = true; }}
            onDeclined={() => { userDeclinedRef.current = false; }}
          />
        </StreamCall>
        <CallDebugStrip calls={calls} identity={identity} />
      </View>
    );
  }
  // TEMPORARY — remove once the cold-start ring is confirmed.
  // Neither phone can produce logs (no Mac for the iPhone, adb off on the Oppo),
  // so the [CallOverlay] console lines above are unreadable on device. This puts
  // the same information on screen: if a push wakes the app and it lands here on
  // the home screen instead of ringing, this strip says what state the call was
  // actually in, which is the one fact the IDLE hypothesis needs and never had.
  return <CallDebugStrip calls={calls} identity={identity} />;
}

// TEMPORARY — seconds since this mounted, ticking.
//
// `attempt=1` is true of a connect that is two seconds in and of one that will
// never finish, and the placeholder in front of it looks identical either way. A
// frozen number is the difference between "slow" and "stuck", and it is the one
// thing the strip could never say. Session 17 lost a cycle to exactly this
// ambiguity on the join; this is the same fix on the connect.
function WaitedSeconds() {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const t0 = Date.now();
    const id = setInterval(() => setSecs(Math.round((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  return <>{secs}</>;
}

// TEMPORARY — the debugLog tail, shared by both strips.
function DebugLogLines() {
  const [logLines, setLogLines] = useState(getDebugLines);
  useEffect(() => onDebugLog(setLogLines), []);
  return logLines.map(line => (
    <Text key={line} style={styles.debugText}>{line}</Text>
  ));
}

// TEMPORARY — see above.
function CallDebugStrip({ calls, identity }) {
  if (!SHOW_CALL_DEBUG) return null;
  return (
    <View style={styles.debugStrip} pointerEvents="none">
      <Text style={styles.debugText}>
        b={BUILD_TAG} me={identity ?? '?'} calls={calls.length}
        {calls.length > 0 && ' · '}
        {calls
          .map(c => `${c.id.slice(-6)}:${c.state.callingState}:by=${c.state.createdBy?.id ?? '?'}${c.state.endedAt ? ':ended' : ''}`)
          .join(' | ')}
      </Text>
      {/* Survives the call ending, so a hangup failure is still readable after
          the call screen has gone. */}
      <DebugLogLines />
    </View>
  );
}

// TEMPORARY — styles for CallDebugStrip. Pinned to the bottom so it clears the
// status bar and the tab bar's own labels stay readable underneath it.
const styles = StyleSheet.create({
  debugStrip: {
    position: 'absolute',
    // Above the tab bar and the iPhone home indicator, which would otherwise
    // sit on top of the text.
    left: 0, right: 0, bottom: 92,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  debugText: { color: '#0f0', fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
});

// Recovers the exact ringing call named by a yapfamily:// deep link (the Bark tap on
// iOS). Simply connecting the client does not surface a call that is already
// ringing — the strip read `me=kath calls=0` after a cold open, and queryCalls
// returned nothing — but onRingingCall(cid) registers that exact call so it lands in
// useCalls() and CallOverlay shows the ring screen.
//
// Module-level rather than defined inside init(): the deep link has to be *noticed*
// before a client exists (that is the whole delay being covered), so the listener and
// the recovery cannot live in the same scope.
async function recoverCallFromUrl(client, url) {
  const match = url?.match(/[?&]cid=([^&]+)/);
  if (!match) { debugLog(`deeplink: no cid (${url?.slice(0, 24)})`); return; }
  const cid = decodeURIComponent(match[1]);

  // If we already have this call, do nothing.
  //
  // On the second call onwards the app is already open, so the ring screen appears
  // by itself AND Bark fires — and the kiosk cannot cancel a Bark push. Tapping
  // that banner ran onRingingCall on a call that was already ringing, joining or
  // joined, putting a second call screen over the first and re-entering the accept
  // flow on a call that was mid-join. That is the "another Yap Family call screen,
  // then the wheel spins for about 30 seconds" report — 30s being withTimeout's
  // budget around join() in IncomingCallScreen, which is exactly what a second
  // join() on an already-joining call would burn.
  //
  // Only a call we have never seen, or one sitting IDLE, needs recovering.
  try {
    const existing = client.state?.calls?.find(c => c.cid === cid);
    const state = existing?.state?.callingState;
    if (existing && state !== CallingState.IDLE) {
      debugLog(`deeplink: already have ${cid.slice(-10)} (${state})`);
      clearCallPending();
      return;
    }
  } catch (err) {
    // Never swallow: if this check throws we fall through to onRingingCall, which
    // is the old behaviour, but the strip must say the guard didn't run.
    console.warn('[StreamWrapper] existing-call check failed:', err);
    debugLog(`deeplink: guard FAILED: ${err?.message ?? err}`);
  }

  try {
    await client.onRingingCall(cid);
    debugLog(`onRingingCall ok: ${cid.slice(-10)}`);
  } catch (err) {
    console.warn('[StreamWrapper] onRingingCall from deep link failed:', err);
    debugLog(`onRingingCall FAILED: ${err?.message ?? err}`);
    // The call will never appear, so drop the placeholder now rather than leaving a
    // "Connecting…" screen up for the rest of the TTL.
    clearCallPending();
  }
}

// Initialises the Stream client and wraps children in <StreamVideo>.
// Re-initialises whenever the identity changes (clearIdentity → new identity choice).
function StreamWrapper({ children }) {
  const { identity } = useIdentity();
  const [readyClient, setReadyClient] = useState(null);
  const clientRef = useRef(null);
  const [retryCount, setRetryCount] = useState(0);
  const callPending = useCallPending();
  // A deep link waiting to be handled.
  //
  // STATE, not a ref, and wrapped in an object so an identical URL still counts as
  // a new arrival. It was a ref consumed by an effect keyed on [readyClient]
  // alone, which meant it was only ever read when the client *changed* — i.e.
  // exactly once, on the cold start it was written for. From the second call
  // onwards the client is already connected, so tapping the Bark banner stored a
  // URL that nothing ever consumed: the guard below never ran, clearCallPending()
  // never ran, and IncomingCallPlaceholder sat on top of the real call screen for
  // its full 25s TTL. That is the "another Yap Family screen, then 15 seconds
  // before Accept/Decline appear" report — the buttons were underneath the cover
  // the whole time.
  const [pendingUrl, setPendingUrl] = useState(null);

  // iOS's "a call is coming" signal is the Bark deep link, and this must NOT wait
  // for the client: the deep link is read again inside init() below, but only after
  // connectUser() has finished — which is the very delay the placeholder exists to
  // cover. Reading it here, on mount, means the call screen is up almost as soon as
  // the app is.
  // Registered on MOUNT, and watching both the cold launch (getInitialURL) and the
  // warm one (the 'url' event). This listener used to live inside init(), i.e. it only
  // started listening once the client was connected — so a Bark tap on a phone that
  // had been idle was noticed only after the slowest part was already over. The whole
  // point is to know a call is coming *before* that.
  useEffect(() => {
    const note = url => {
      if (!url || !/[?&]cid=/.test(url)) return;
      // Fresh object every time: two taps on the same call produce the same URL
      // string, and a plain string in state would not re-render for the second.
      setPendingUrl({ url, at: Date.now() });
      // Name the call on the cover as well as in the URL: with a cid, the cover
      // can offer real Accept/Decline buttons during the connect instead of a
      // spinner (see src/callIntent.js).
      const cid = /[?&]cid=([^&]+)/.exec(url)?.[1];
      markCallPending(cid && decodeURIComponent(cid));
    };
    Linking.getInitialURL()
      .then(note)
      .catch(err => console.warn('[StreamWrapper] getInitialURL failed:', err));
    const sub = Linking.addEventListener('url', ({ url }) => note(url));
    return () => sub.remove();
  }, []);

  // Recover the call as soon as there is a client to recover it with — which may be
  // well after the link arrived, and may be a *replacement* client after a resume
  // reconnect.
  useEffect(() => {
    if (!readyClient || !pendingUrl) return;
    setPendingUrl(null);
    recoverCallFromUrl(readyClient, pendingUrl.url);
  }, [readyClient, pendingUrl]);

  // The iOS notification-permission request went with the local notification above:
  // this app no longer posts one, and Bark holds its own permission (including the
  // Critical Alert entitlement, which this app cannot obtain on a free cert
  // anyway). Asking for a permission nothing uses is a prompt Kath has to dismiss
  // for no benefit.

  useEffect(() => {
    if (!identity) {
      // Identity cleared — disconnect and tear down.
      if (clientRef.current) {
        clientRef.current.__appStateSub?.remove();
        clientRef.current.disconnectUser().catch(() => {});
        clientRef.current = null;
        clearClient();
      }
      setReadyClient(null);
      return;
    }

    let cancelled = false;
    let retryTimer = null;

    async function init() {
      try {
        const c = await getOrCreateClient();
        clientRef.current = c;
        if (cancelled) { c.disconnectUser(); clearClient(); return; }

        // Reconnect after long background stint (Android kills WS after ~30s).
        let bgAt = null;
        const appSub = AppState.addEventListener('change', nextState => {
          if (nextState === 'background') {
            bgAt = Date.now();
          } else if (nextState === 'active' && bgAt !== null && !cancelled) {
            const bgSecs = Math.round((Date.now() - bgAt) / 1000);
            // Never tear the client down while it holds a call.
            //
            // Measured: `#2 call seen by=family-hub` at 33:03.223, then
            // `resume: reconnecting after 48s bg` at 33:03.934 — 711ms later this
            // handler destroyed the very client that had just delivered the call,
            // and the call object went with it. The replacement connected fine and
            // knew nothing about the call, so no ring screen ever appeared.
            //
            // The trap is structural, not a tuning problem: being woken BY an
            // incoming call is precisely the case where the app has been in the
            // background for a long time, so the >30s rule fires on exactly the
            // calls it must not touch. A client that has just delivered a call has
            // also just proven its WebSocket is alive, which is the only thing the
            // reconnect was ever checking for.
            const heldCalls = c.state?.calls?.length ?? 0;
            if (Date.now() - bgAt > 30000 && heldCalls === 0 && !isCallPending()) {
              // This full teardown + reconnect is the remaining cost of unlocking a
              // phone that has been idle, and it is unmeasured. If the placeholder
              // still sits on "Connecting…" for a long time, the gap between this
              // line and `onRingingCall ok` is the number to look at.
              debugLog(`resume: reconnecting after ${bgSecs}s bg`);
              setRetryCount(n => n + 1);
            } else {
              if (bgSecs > 30) debugLog(`resume: ${bgSecs}s bg, keeping client (calls=${heldCalls})`);
              // WebSocket presumed alive, but it may have missed ring events.
              //
              // Also reconciles IncomingCallPlaceholder here for the same reason as
              // the cold-connect site below — this is the OTHER path that can leave
              // it covering a call that already ended: isCallPending() being true is
              // exactly what routes execution into this branch instead of the
              // teardown-and-reconnect one above, so a pending cover and a call that
              // ended while backgrounded can both be true at once here.
              c.queryCalls({ filter_conditions: { ringing: true }, limit: 5, watch: true })
                .then(res => {
                  const pendingCid = getPendingCid();
                  if (pendingCid && !res.calls.some(call => call.cid === pendingCid)) {
                    debugLog(`pending cid ${pendingCid.slice(-10)} not in ringing calls on resume — clearing cover`);
                    clearCallPending();
                  }
                })
                .catch(err => console.warn('[Stream] resume queryCalls failed:', err));
            }
            bgAt = null;
          }
        });
        c.__appStateSub = appSub;

        if (Platform.OS === 'android') {
          await PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.CAMERA,
            PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
            // Android 13+ requires this before the app may post anything, which
            // includes the missed-call note (src/missedCall.js). Older versions
            // return 'never_ask_again' for an unknown permission and carry on, so
            // no version guard is needed.
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
          ]);
          // Request battery optimisation exclusion so Android doesn't kill the FCM
          // handler when the app is in the background/killed state. Android skips the
          // dialog if the exemption is already granted.
          const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
          // Detached: these open settings screens and only resolve once the user comes
          // back, so awaiting here would hold up connecting to Stream. Sequential inside
          // so the second screen doesn't launch over the first.
          // The keys are suffixed _v2 deliberately. The previous build set the
          // unsuffixed keys immediately before calling Linking.sendIntent, which
          // silently failed to open anything — so every device that ran it has the
          // old keys set and would never be prompted again, even after the intent
          // code was fixed. Bumping the key re-prompts those installs once.
          //
          // Anything that changes whether these prompts are still needed must bump
          // the suffix again; there is no way to read the grant state back from JS.
          (async () => {
            const batteryAsked = await AsyncStorage.getItem('setup_battery_opt_v2');
            if (!batteryAsked) {
              await AsyncStorage.setItem('setup_battery_opt_v2', '1');
              await openBatteryOptimizationSettings();
            }
            // Android 14+ (targetSdk 34+) makes USE_FULL_SCREEN_INTENT a special app
            // access the user must toggle by hand — there is no API to grant it, and
            // no way to read its state back from JS. Without it, Android demotes the
            // incoming-call full-screen intent to a heads-up banner, MainActivity
            // never launches, and turnScreenOn never fires: the call rings but the
            // screen stays black (confirmed on the Oppo, session 15).
            //
            // The most we can do is guide the user to the page. Just launching it
            // dropped them on a settings screen with no idea what to flip, so gate it
            // behind an Alert that says exactly which toggle to turn on, and only open
            // the page once they acknowledge. Key bumped to _v3 so installs that
            // already burned _v2 (before this explanatory step existed) get one more
            // prompt.
            const done = await AsyncStorage.getItem('setup_full_screen_intent_v3');
            if (!done) {
              await AsyncStorage.setItem('setup_full_screen_intent_v3', '1');
              await new Promise(resolve => {
                Alert.alert(
                  'Let calls wake your phone',
                  'On the next screen, turn ON "Allow full-screen notifications" ' +
                    '(sometimes called "Full-screen intents") for Yap Family.\n\n' +
                    'Without it, calls ring but the screen stays black.',
                  [{ text: 'Open settings', onPress: resolve }],
                  { cancelable: false },
                );
              });
              await openFullScreenIntentSettings();
            }
          })();
        }

        if (cancelled) return;
        setReadyClient(c);

        // Deep-link recovery is handled by the mount-level listener above, which is
        // watching from before this client existed.

        // Fetch any ringing calls we missed while the client was offline (e.g. app
        // was killed/suspended by iOS and woken by an ntfy notification).
        //
        // Session 28, Android: reconciles IncomingCallPlaceholder against this
        // fresh client's own truth, rather than leaving it to run out its full
        // 25s TTL. The placeholder is driven purely by pendingCall's flag+timer
        // and has no way to learn the call already ended — reported live as the
        // full-screen cover sitting for ~20s after reopening the app on a call
        // that had already been hung up on the kiosk. Confirmed on-device via
        // the debug strip: `calls=0` immediately on reconnect (this client
        // already knows there is nothing live) while the placeholder, driven by
        // its own independent timer, was still showing Accept/Decline. This is
        // the earliest point that truth is available, so check it here instead
        // of waiting on the TTL or on CallOverlay ever seeing a real call object
        // for this cid (which never happens if the call is already gone).
        c.queryCalls({ filter_conditions: { ringing: true }, limit: 5, watch: true })
          .then(res => {
            const pendingCid = getPendingCid();
            if (pendingCid && !res.calls.some(call => call.cid === pendingCid)) {
              debugLog(`pending cid ${pendingCid.slice(-10)} not in ringing calls on reconnect — clearing cover`);
              clearCallPending();
            }
          })
          .catch(err => console.warn('[StreamWrapper] queryCalls failed:', err));
      } catch (err) {
        // Retry rather than giving up. A cold start woken by a push routinely
        // races the network coming back, and a single failure used to leave the
        // app permanently without a client — no client, no useCalls(), no ring.
        // Backs off 2s, 4s, 8s… capped, and keeps trying: the caller is still
        // ringing at the other end, so there is no point stopping early.
        console.warn(`[Stream] init failed (attempt ${retryCount + 1}), retrying:`, err);
        if (!cancelled) {
          const delay = Math.min(2000 * 2 ** retryCount, 15000);
          retryTimer = setTimeout(() => {
            if (!cancelled) setRetryCount(n => n + 1);
          }, delay);
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      setReadyClient(null);
      if (clientRef.current) {
        clientRef.current.__appStateSub?.remove();
        clientRef.current.disconnectUser().catch(() => {});
        clientRef.current = null;
        clearClient();
      }
    };
  }, [identity, retryCount]);

  // Always render children at a stable position in the tree so NavigationContainer
  // is never remounted when readyClient arrives (would reset nav to Home).
  return (
    <>
      {children}
      {/* A call is on its way but there is no call object to render yet. Covers the
          app's own UI so a cold-started call goes straight to a call screen instead
          of flashing the Home tab for the length of the connect. Rendered BEFORE the
          StreamVideo block so that on the one frame where both could be mounted, the
          real ring screen paints on top of this one, never the reverse.
          Gated on identity: with no identity chosen nothing can progress, and the
          identity picker must stay reachable. */}
      {identity && callPending && (
        <View style={StyleSheet.absoluteFillObject}>
          <IncomingCallPlaceholder />
        </View>
      )}
      {identity && readyClient ? (
        <StreamVideo client={readyClient}>
          <CallOverlay />
        </StreamVideo>
      ) : (
        // TEMPORARY — CallOverlay carries the debug strip, but it only mounts once
        // the client is connected, so a missing strip was ambiguous: old build, no
        // identity, or a client that never connected. Render the reason instead.
        SHOW_CALL_DEBUG && (
          <View style={styles.debugStrip} pointerEvents="none">
            <Text style={styles.debugText}>
              no client · b={BUILD_TAG} · me={identity ?? 'none'} · readyClient={readyClient ? 'yes' : 'no'} · attempt={retryCount + 1} · waited=<WaitedSeconds />s
            </Text>
            {/* The connect phases land here too — a strip that shows `connect: start`
                and then nothing has told you where it stopped. */}
            <DebugLogLines />
          </View>
        )
      )}
    </>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Figtree_400Regular,
    Figtree_500Medium,
    Figtree_600SemiBold,
    Figtree_700Bold,
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={COLORS.kath} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <IdentityProvider>
        <StreamWrapper>
          <AppNavigator />
        </StreamWrapper>
      </IdentityProvider>
    </SafeAreaProvider>
  );
}

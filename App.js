import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ActivityIndicator, AppState, Platform, PermissionsAndroid, StyleSheet, Alert, Linking } from 'react-native';
import * as Notifications from 'expo-notifications';
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
import { markCallPending, clearCallPending, useCallPending } from './src/pendingCall';
import { returnToAndroidHome } from './src/returnHome';
import { COLORS } from './src/theme';

const CALL_NOTIF_ID = 'yap-incoming-call';

// TEMPORARY — set to false (or delete CallDebugStrip) once the cold-start ring works.
const SHOW_CALL_DEBUG = true;

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
  const active = calls.find(
    c =>
      c.state.callingState === CallingState.JOINED ||
      c.state.callingState === CallingState.JOINING,
  );
  // Incoming ring: a call someone ELSE created that we have not joined or left.
  //
  // Deliberately accepts IDLE as well as RINGING. RINGING is only set by the live
  // `call.ring` websocket event — a call recovered by queryCalls() after the app
  // was woken from a killed state never saw that event, so it arrives as IDLE.
  // Matching only RINGING meant a push woke the phone, the app opened, and the
  // caller sat ringing with the callee looking at the home screen.
  // endedAt guards against surfacing a call that has already finished.
  const incomingRingCall = calls.find(
    c =>
      (c.state.callingState === CallingState.RINGING ||
        c.state.callingState === CallingState.IDLE) &&
      c.state.createdBy?.id !== identity &&
      !c.state.endedAt,
  );

  const userDeclinedRef = useRef(false);
  const appStateRef = useRef(AppState.currentState);
  // Belt-and-suspenders store: catches the call even if useCalls() misses it.
  const [outgoingCall, setOutgoingCallState] = useState(() => getOutgoingCall());
  useEffect(() => onOutgoingCallChange(call => setOutgoingCallState(call)), []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', s => { appStateRef.current = s; });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    // Number every call the moment it is first seen, not at accept: a call that
    // merely RANG and was cancelled from the kiosk poisons the next one exactly as
    // much as an answered one does, so it has to consume an ordinal or the numbers
    // stop lining up with what was actually done to the phone. Numbering only —
    // participant state is watched by traceCall, never from an effect.
    calls.forEach(callSeq);
    console.log('[CallOverlay] calls:', calls.map(c => `${c.id.slice(-8)}:${c.state.callingState}:createdBy=${c.state.createdBy?.id}`).join(', ') || '(none)');
    console.log('[CallOverlay] active:', active?.id?.slice(-8) ?? 'null', '| outgoingRinging:', outgoingRinging?.id?.slice(-8) ?? 'null', '| outgoingCallStore:', outgoingCall?.id?.slice(-8) ?? 'null', '| incomingRing:', incomingRingCall?.id?.slice(-8) ?? 'null');
  }, [calls, outgoingCall]);

  // When a call screen was showing and then goes away, the call has ended
  // (declined, hung up, cancelled by the kiosk, or the remote dropped). Background
  // the app so the phone returns to the normal Android home screen rather than
  // sitting on the app's own Home tab. One place catches every end path.
  const showingCall = !!(active || outgoingRinging || outgoingCall || incomingRingCall);
  const wasShowingCallRef = useRef(false);
  useEffect(() => {
    if (wasShowingCallRef.current && !showingCall) {
      returnToAndroidHome();
    }
    wasShowingCallRef.current = showingCall;
  }, [showingCall]);

  // A real call screen is up, so the "call is coming" placeholder has done its job.
  // Also covers the end of the call: without this, the flag would still be inside
  // its TTL and the placeholder would flash back up as the call screen unmounts.
  useEffect(() => {
    if (showingCall) clearCallPending();
  }, [showingCall]);

  useEffect(() => {
    if (!incomingRingCall) {
      Notifications.dismissNotificationAsync(CALL_NOTIF_ID).catch(() => {});
      return;
    }
    if (Platform.OS === 'ios' && appStateRef.current !== 'active') {
      Notifications.scheduleNotificationAsync({
        identifier: CALL_NOTIF_ID,
        content: {
          title: '📹 Incoming video call',
          body: 'Yap Family is calling — tap to open',
          sound: true,
        },
        trigger: null,
      }).catch(() => {});
    }
  }, [incomingRingCall]);

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
        me={identity ?? '?'} calls={calls.length}
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
  // A deep link that arrived before there was a client to hand it to.
  const pendingUrlRef = useRef(null);

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
      pendingUrlRef.current = url;
      markCallPending();
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
    if (!readyClient || !pendingUrlRef.current) return;
    const url = pendingUrlRef.current;
    pendingUrlRef.current = null;
    recoverCallFromUrl(readyClient, url);
  }, [readyClient]);

  // Ask for notification permission on iOS so background ring alerts can appear.
  useEffect(() => {
    if (Platform.OS === 'ios' && identity) {
      Notifications.requestPermissionsAsync().catch(() => {});
    }
  }, [identity]);

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
            if (Date.now() - bgAt > 30000) {
              // This full teardown + reconnect is the remaining cost of unlocking a
              // phone that has been idle, and it is unmeasured. If the placeholder
              // still sits on "Connecting…" for a long time, the gap between this
              // line and `onRingingCall ok` is the number to look at.
              debugLog(`resume: reconnecting after ${Math.round((Date.now() - bgAt) / 1000)}s bg`);
              setRetryCount(n => n + 1);
            } else {
              // Short background: WebSocket still alive but might have missed ring events.
              c.queryCalls({ filter_conditions: { ringing: true }, limit: 5, watch: true })
                .catch(() => {});
            }
            bgAt = null;
          }
        });
        c.__appStateSub = appSub;

        if (Platform.OS === 'android') {
          await PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.CAMERA,
            PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
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
        c.queryCalls({ filter_conditions: { ringing: true }, limit: 5, watch: true })
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
              no client · me={identity ?? 'none'} · readyClient={readyClient ? 'yes' : 'no'} · attempt={retryCount + 1} · waited=<WaitedSeconds />s
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

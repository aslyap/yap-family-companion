import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ActivityIndicator, AppState, Platform, PermissionsAndroid, StyleSheet } from 'react-native';
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
import ActiveCallScreen from './src/screens/ActiveCallScreen';
import { getOrCreateClient, clearClient } from './src/streamClient';
import { onOutgoingCallChange, getOutgoingCall } from './src/outgoingCallStore';
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
    console.log('[CallOverlay] calls:', calls.map(c => `${c.id.slice(-8)}:${c.state.callingState}:createdBy=${c.state.createdBy?.id}`).join(', ') || '(none)');
    console.log('[CallOverlay] active:', active?.id?.slice(-8) ?? 'null', '| outgoingRinging:', outgoingRinging?.id?.slice(-8) ?? 'null', '| outgoingCallStore:', outgoingCall?.id?.slice(-8) ?? 'null', '| incomingRing:', incomingRingCall?.id?.slice(-8) ?? 'null');
  }, [calls, outgoingCall]);

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

// Initialises the Stream client and wraps children in <StreamVideo>.
// Re-initialises whenever the identity changes (clearIdentity → new identity choice).
function StreamWrapper({ children }) {
  const { identity } = useIdentity();
  const [readyClient, setReadyClient] = useState(null);
  const clientRef = useRef(null);
  const [retryCount, setRetryCount] = useState(0);

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
            // Open USE_FULL_SCREEN_INTENT settings once — Android 14+ requires this
            // to be explicitly granted so the screen wakes on an incoming call.
            const done = await AsyncStorage.getItem('setup_full_screen_intent_v2');
            if (!done) {
              await AsyncStorage.setItem('setup_full_screen_intent_v2', '1');
              await openFullScreenIntentSettings();
            }
          })();
        }

        if (cancelled) return;
        setReadyClient(c);

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
              no client · me={identity ?? 'none'} · readyClient={readyClient ? 'yes' : 'no'} · attempt={retryCount + 1}
            </Text>
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

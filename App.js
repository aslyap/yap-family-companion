import React, { useState, useEffect, useRef } from 'react';
import { View, ActivityIndicator, AppState, Platform, PermissionsAndroid, StyleSheet } from 'react-native';
import * as Notifications from 'expo-notifications';
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

// Lives inside <StreamVideo> — detects ring/active calls and overlays them above the
// tab navigator using absoluteFillObject. Returns null when no call is active.
function CallOverlay() {
  const calls = useCalls();
  const { identity } = useIdentity();
  const ringing = calls.find(c => c.state.callingState === CallingState.RINGING);
  const active = calls.find(
    c =>
      c.state.callingState === CallingState.JOINED ||
      c.state.callingState === CallingState.JOINING,
  );
  const userDeclinedRef = useRef(false);
  const appStateRef = useRef(AppState.currentState);
  // Outgoing calls created in HomeTab are not tracked by useCalls() because
  // they are created outside the <StreamVideo> context. Subscribe to the store.
  const [outgoingCall, setOutgoingCallState] = useState(() => getOutgoingCall());
  useEffect(() => onOutgoingCallChange(call => setOutgoingCallState(call)), []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', s => { appStateRef.current = s; });
    return () => sub.remove();
  }, []);

  // When the current user placed the outgoing call, their own call briefly enters
  // RINGING state between getOrCreate() and join(). Guard against showing the
  // IncomingCallScreen (with vibration + ringtone) to the caller themselves.
  const isIncomingRing = ringing && ringing.state.createdBy?.id !== identity;

  useEffect(() => {
    console.log('[CallOverlay] calls:', calls.map(c => `${c.id.slice(-8)}:${c.state.callingState}`).join(', ') || '(none)');
    console.log('[CallOverlay] active:', active?.id?.slice(-8) ?? 'null', '| isIncomingRing:', !!isIncomingRing);
  }, [calls]);

  // When backgrounded and a ring arrives, post a local notification so the user
  // can tap through to the app. The ringtone plays via expo-audio even in background
  // (because IOSBackgroundKeepAlive set shouldPlayInBackground: true on the session).
  useEffect(() => {
    if (!isIncomingRing) {
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
  }, [isIncomingRing]);

  const displayActive = active || outgoingCall;
  if (displayActive) {
    return (
      <View style={StyleSheet.absoluteFillObject}>
        <StreamCall call={displayActive}>
          <ActiveCallScreen onLeft={() => setOutgoingCallState(null)} />
        </StreamCall>
      </View>
    );
  }
  if (isIncomingRing) {
    return (
      <View style={StyleSheet.absoluteFillObject}>
        <StreamCall call={ringing}>
          <IncomingCallScreen
            onAccepted={() => {}}
            onDeclineStart={() => { userDeclinedRef.current = true; }}
            onDeclined={() => { userDeclinedRef.current = false; }}
          />
        </StreamCall>
      </View>
    );
  }
  return null;
}

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
            if (Date.now() - bgAt > 30000) setRetryCount(n => n + 1);
            bgAt = null;
          }
        });
        c.__appStateSub = appSub;

        if (Platform.OS === 'android') {
          await PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.CAMERA,
            PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          ]);
        }

        if (cancelled) return;
        setReadyClient(c);
      } catch (err) {
        console.error('Stream init error:', err);
      }
    }

    init();

    return () => {
      cancelled = true;
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
      {identity && readyClient && (
        <StreamVideo client={readyClient}>
          <CallOverlay />
        </StreamVideo>
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

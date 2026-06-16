import React, { useState, useEffect, useRef } from 'react';
import { View, ActivityIndicator, AppState, Platform, PermissionsAndroid, StyleSheet } from 'react-native';
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

import { IdentityProvider, useIdentity } from './src/contexts/IdentityContext';
import AppNavigator from './src/navigation/AppNavigator';
import IncomingCallScreen from './src/screens/IncomingCallScreen';
import ActiveCallScreen from './src/screens/ActiveCallScreen';
import { getOrCreateClient, clearClient } from './src/streamClient';
import { COLORS } from './src/theme';

// Lives inside <StreamVideo> — detects ring/active calls and overlays them above the
// tab navigator using absoluteFillObject. Returns null when no call is active.
function CallOverlay() {
  const calls = useCalls();
  const ringing = calls.find(c => c.state.callingState === CallingState.RINGING);
  const active = calls.find(
    c =>
      c.state.callingState === CallingState.JOINED ||
      c.state.callingState === CallingState.JOINING,
  );
  const userDeclinedRef = useRef(false);

  if (active) {
    return (
      <View style={StyleSheet.absoluteFillObject}>
        <StreamCall call={active}>
          <ActiveCallScreen onLeft={() => {}} />
        </StreamCall>
      </View>
    );
  }
  if (ringing) {
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

  if (!identity || !readyClient) {
    // No identity yet or still connecting — let AppNavigator handle identity select / loading.
    return children;
  }

  return (
    <StreamVideo client={readyClient}>
      {children}
      <CallOverlay />
    </StreamVideo>
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
    <IdentityProvider>
      <StreamWrapper>
        <AppNavigator />
      </StreamWrapper>
    </IdentityProvider>
  );
}

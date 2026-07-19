import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import {
  CallContent,
  CallControls,
  useCall,
  useCallStateHooks,
  CallingState,
} from '@stream-io/video-react-native-sdk';

function ElevatedCallControls(props) {
  return <CallControls {...props} style={styles.controls} />;
}

export default function ActiveCallScreen({ onLeft }) {
  const call = useCall();
  const { useRemoteParticipants, useCallCallingState } = useCallStateHooks();
  const remotes = useRemoteParticipants();
  const callingState = useCallCallingState();
  const hadRemoteRef = useRef(false);
  const { width, height } = useWindowDimensions();

  if (remotes.length > 0) hadRemoteRef.current = true;

  // When the kiosk calls call.end() our local CallingState transitions to LEFT.
  useEffect(() => {
    if (callingState === CallingState.LEFT) {
      onLeft();
    }
  }, [callingState]);

  // Fallback: kiosk left without calling end() (network drop, call.leave(), etc).
  // We must call leave() ourselves — otherwise the call stays JOINED locally and
  // the overlay never dismisses. 2-second grace window avoids brief network blips.
  useEffect(() => {
    if (remotes.length > 0 || !hadRemoteRef.current) return;
    const t = setTimeout(async () => {
      try { await call.leave(); } catch {}
      onLeft();
    }, 2000);
    return () => clearTimeout(t);
  }, [remotes.length]);

  async function handleHangUp() {
    // end() tears the call down for everyone — leave() would only remove us and
    // the kiosk would sit in the call on its own. Mirrors the kiosk's hangup,
    // which also ends rather than leaves. Fall back to leave() if end() is
    // rejected (only the call creator/admin may end a call).
    try {
      await call.end();
    } catch {
      await call.leave().catch(() => {});
    }
    onLeft();
  }

  return (
    <View style={[styles.container, { width, height }]}>
      <CallContent
        onHangupCallHandler={handleHangUp}
        CallControls={ElevatedCallControls}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#000' },
  // 52 dp clears the standard 3-button Android nav bar (≈48 dp) with a little room.
  controls: { paddingBottom: 52 },
});

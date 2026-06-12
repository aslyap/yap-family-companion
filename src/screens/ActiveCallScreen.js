import React, { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
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

  if (remotes.length > 0) hadRemoteRef.current = true;

  // When the kiosk calls call.end() our local CallingState transitions to LEFT.
  useEffect(() => {
    if (callingState === CallingState.LEFT) {
      onLeft();
    }
  }, [callingState]);

  // Fallback: kiosk left without calling end() (network drop, call.leave(), etc).
  // 2-second grace window avoids triggering on brief network blips.
  useEffect(() => {
    if (remotes.length > 0 || !hadRemoteRef.current) return;
    const t = setTimeout(() => onLeft(), 2000);
    return () => clearTimeout(t);
  }, [remotes.length]);

  async function handleHangUp() {
    await call.leave();
    onLeft();
  }

  return (
    <View style={styles.container}>
      <CallContent
        onHangupCallHandler={handleHangUp}
        CallControls={ElevatedCallControls}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  // 52 dp clears the standard 3-button Android nav bar (≈48 dp) with a little room.
  controls: { paddingBottom: 52 },
});

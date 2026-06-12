import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Vibration } from 'react-native';
import { useCall, useCallStateHooks, CallingState } from '@stream-io/video-react-native-sdk';
import { useAudioPlayer } from 'expo-audio';

// Full-screen incoming call UI shown when the kiosk "Call Mum/Dad" button rings this device.
export default function IncomingCallScreen({ onAccepted, onDeclined, onDeclineStart }) {
  const call = useCall();
  const { useCallCallingState } = useCallStateHooks();
  const callingState = useCallCallingState();

  const player = useAudioPlayer(require('../../assets/ringtone.wav'));

  useEffect(() => {
    const pattern = [0, 800, 400, 800, 400, 800];
    Vibration.vibrate(pattern, true);
    try {
      player.loop = true;
      player.play();
    } catch (_) {}
    return () => {
      Vibration.cancel();
      try { player.pause(); } catch (_) {}
    };
  }, []);

  if (callingState !== CallingState.RINGING) return null;

  async function accept() {
    await call.join();
    await Promise.all([
      call.camera.enable().catch(() => {}),
      call.microphone.enable().catch(() => {}),
    ]);
    onAccepted();
  }

  async function decline() {
    onDeclineStart?.();
    await call.leave({ reject: true });
    onDeclined?.();
  }

  return (
    <View style={styles.container}>
      <View style={styles.callerInfo}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>🏠</Text>
        </View>
        <Text style={styles.callerName}>Yap Family</Text>
        <Text style={styles.subtitle}>Incoming video call…</Text>
      </View>

      <View style={styles.buttons}>
        <TouchableOpacity style={[styles.btn, styles.btnDecline]} onPress={decline}>
          <Text style={styles.btnIcon}>📵</Text>
          <Text style={styles.btnLabel}>Decline</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.btnAccept]} onPress={accept}>
          <Text style={styles.btnIcon}>📹</Text>
          <Text style={styles.btnLabel}>Accept</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'space-between',
    paddingVertical: 80,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  callerInfo: { alignItems: 'center', gap: 16 },
  avatar: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: '#B5A895', // family warm sand
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 48 },
  callerName: { fontSize: 32, fontWeight: '700', color: '#fff' },
  subtitle: { fontSize: 18, color: '#aaa' },
  buttons: { flexDirection: 'row', gap: 64 },
  btn: { alignItems: 'center', gap: 8 },
  btnDecline: {},
  btnAccept: {},
  btnIcon: { fontSize: 48 },
  btnLabel: { fontSize: 16, color: '#fff', fontWeight: '600' },
});

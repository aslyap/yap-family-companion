import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Vibration, ActivityIndicator, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCall, useCallStateHooks, CallingState } from '@stream-io/video-react-native-sdk';
import { useAudioPlayer } from 'expo-audio';

// Full-screen incoming call UI shown when the kiosk "Call Mum/Dad" button rings this device.
export default function IncomingCallScreen({ onAccepted, onDeclined, onDeclineStart }) {
  const call = useCall();
  const { useCallCallingState } = useCallStateHooks();
  const callingState = useCallCallingState();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const player = useAudioPlayer(require('../../assets/iphone_x.mp3'));

  // Accepting takes a few seconds (enable camera + mic, then join). Without a
  // pending state the screen looks frozen, so the button gets tapped repeatedly
  // and each tap fires another concurrent join, making it slower still.
  const [busy, setBusy] = useState(null); // null | 'accepting' | 'declining'

  useEffect(() => {
    // Plain, even buzz. The ringtone MP3 carries its own cadence, so a patterned
    // vibration just drifts against it rather than reinforcing it.
    const pattern = [0, 800, 1400];
    Vibration.vibrate(pattern, true);
    try {
      player.loop = true;
      player.volume = 1.0; // ring at full scale; the device volume still applies
      player.play();
    } catch (_) {}
    return () => {
      Vibration.cancel();
      try { player.pause(); } catch (_) {}
    };
  }, []);

  // Silence the ring the instant a choice is made — it otherwise keeps ringing
  // through the whole join, which reads as "nothing happened".
  useEffect(() => {
    if (!busy) return;
    Vibration.cancel();
    try { player.pause(); } catch (_) {}
  }, [busy]);

  if (callingState !== CallingState.RINGING) return null;

  async function accept() {
    if (busy) return;
    setBusy('accepting');
    try {
      // Enable tracks before joining so CallContent has video ready when it mounts.
      await Promise.all([
        call.camera.enable()
          .then(() => call.camera.flip())
          .catch(e => console.warn('[IncomingCall] camera.enable/flip failed:', e)),
        call.microphone.enable().catch(e => console.warn('[IncomingCall] mic.enable failed:', e)),
      ]);
      await call.join();
      onAccepted();
    } catch (e) {
      console.warn('[IncomingCall] accept failed:', e);
      setBusy(null); // let them try again rather than stranding them on a dead screen
    }
  }

  async function decline() {
    if (busy) return;
    setBusy('declining');
    onDeclineStart?.();
    try {
      await call.leave({ reject: true });
      onDeclined?.();
    } catch (e) {
      console.warn('[IncomingCall] decline failed:', e);
      setBusy(null);
    }
  }

  return (
    <View style={[styles.container, { width, height, paddingTop: insets.top + 64, paddingBottom: Math.max(48, insets.bottom + 32) }]}>
      {/* Caller block sits near the top, as it does on the native call screen. */}
      <View style={styles.callerInfo}>
        <Text style={styles.callerName}>Yap Family</Text>
        <Text style={styles.subtitle}>
          {busy === 'accepting' ? 'Connecting…' : busy === 'declining' ? 'Ending…' : 'video call'}
        </Text>
      </View>

      <View style={styles.buttons}>
        <View style={styles.btnColumn}>
          <TouchableOpacity
            style={[styles.circle, styles.circleDecline, busy && styles.disabled]}
            onPress={decline}
            disabled={!!busy}
            accessibilityLabel="Decline call"
          >
            {/* Rotated handset — the native decline glyph is the same icon turned down. */}
            <Text style={[styles.glyph, styles.glyphDecline]}>📞</Text>
          </TouchableOpacity>
          <Text style={styles.btnLabel}>Decline</Text>
        </View>

        <View style={styles.btnColumn}>
          <TouchableOpacity
            style={[styles.circle, styles.circleAccept, busy && styles.disabled]}
            onPress={accept}
            disabled={!!busy}
            accessibilityLabel="Accept call"
          >
            {busy === 'accepting'
              ? <ActivityIndicator size="large" color="#fff" />
              : <Text style={styles.glyph}>📞</Text>}
          </TouchableOpacity>
          <Text style={styles.btnLabel}>{busy === 'accepting' ? 'Connecting…' : 'Accept'}</Text>
        </View>
      </View>
    </View>
  );
}

// Mirrors the native iOS incoming-call screen: flat dark grey, caller name in
// light weight near the top, and two round buttons on the bottom row.
const styles = StyleSheet.create({
  container: {
    backgroundColor: '#4a4a4a',
    justifyContent: 'space-between',
    paddingHorizontal: 44,
    alignItems: 'center',
  },
  callerInfo: { alignItems: 'center', gap: 6 },
  // iOS uses a large, thin face for the caller — not bold.
  callerName: { fontSize: 34, fontWeight: '300', color: '#fff', letterSpacing: 0.2 },
  subtitle: { fontSize: 20, fontWeight: '300', color: 'rgba(255,255,255,0.65)' },

  buttons: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  btnColumn: { alignItems: 'center', gap: 10 },
  circle: {
    width: 76, height: 76, borderRadius: 38,
    alignItems: 'center', justifyContent: 'center',
  },
  circleDecline: { backgroundColor: '#FF3B30' },
  circleAccept: { backgroundColor: '#34C759' },
  disabled: { opacity: 0.45 },
  glyph: { fontSize: 34 },
  glyphDecline: { transform: [{ rotate: '135deg' }] },
  btnLabel: { fontSize: 15, color: '#fff', fontWeight: '400' },
});

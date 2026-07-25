import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Vibration, ActivityIndicator, useWindowDimensions, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCall, useCallStateHooks, CallingState } from '@stream-io/video-react-native-sdk';
import { useAudioPlayer } from 'expo-audio';
import { debugLog } from '../debugLog';

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

  // iOS only. Android's incoming-call notification channel
  // (`stream_incoming_call_notifications`, configured in index.js) already plays the
  // system ring, so playing this on top gave a half-second of MP3 before the native
  // ring cut in — and sometimes both at once. iOS has no native ring to fall back on:
  // the free SideStore cert strips aps-environment, so there is no CallKit/PushKit
  // ringer and this player is the only thing that makes a sound.
  const useOwnRingtone = Platform.OS === 'ios';

  useEffect(() => {
    // Plain, even buzz. The ringtone MP3 carries its own cadence, so a patterned
    // vibration just drifts against it rather than reinforcing it.
    const pattern = [0, 800, 1400];
    Vibration.vibrate(pattern, true);
    if (!useOwnRingtone) return () => Vibration.cancel();
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
    if (!useOwnRingtone) return;
    try { player.pause(); } catch (_) {}
  }, [busy]);

  // Hide once the call has actually progressed — not merely because it isn't
  // RINGING. A call recovered by queryCalls() after a cold start is IDLE (the
  // live `call.ring` event fired while the app was killed), and blanking on
  // anything !== RINGING left the callee staring at the home screen with the
  // call still ringing at the other end.
  if (
    callingState === CallingState.JOINED ||
    callingState === CallingState.JOINING ||
    callingState === CallingState.LEFT
  ) {
    return null;
  }

  async function accept() {
    if (busy) return;
    setBusy('accepting');
    try {
      // Join FIRST, enable media after.
      //
      // The previous order — enable camera+mic, THEN join, all awaited through a
      // Promise.all — hung forever on iOS: if call.camera.enable() *hangs* (as
      // opposed to rejecting), the Promise.all never settles, call.join() is never
      // reached, and Accept spins with no error to surface (session 16 symptom).
      // The .catch() only rescues a rejection, not a hang. Connecting the call is
      // the actual job of Accept; the camera is secondary, so do it where a stall
      // can't block the connection. CallContent turns tracks on reactively once
      // they're enabled, so enabling after join still shows video.
      debugLog('accept: joining');
      await call.join();
      debugLog('accept: joined ok');
      onAccepted();
      // Fire-and-forget; a camera/mic failure must not strand a connected call.
      call.camera.enable()
        .then(() => call.camera.flip())
        .catch(e => {
          console.warn('[IncomingCall] camera.enable/flip failed:', e);
          debugLog(`camera FAILED: ${e?.message ?? e}`);
        });
      call.microphone.enable().catch(e => {
        console.warn('[IncomingCall] mic.enable failed:', e);
        debugLog(`mic FAILED: ${e?.message ?? e}`);
      });
    } catch (e) {
      console.warn('[IncomingCall] accept failed:', e);
      debugLog(`join FAILED: ${e?.message ?? e}`);
      setBusy(null); // let them try again rather than stranding them on a dead screen
    }
  }

  async function decline() {
    if (busy) return;
    setBusy('declining');
    onDeclineStart?.();
    try {
      // reject() explicitly, rather than leave({ reject: true }).
      //
      // leave() only forwards the rejection when callingState is RINGING
      // (video-client Call.leave), and this screen deliberately also shows for
      // IDLE calls — a call recovered by queryCalls() never saw the live
      // `call.ring` event that sets RINGING. Declining one of those left through
      // leave() silently sent nothing, so the kiosk never learned it was declined
      // and sat on the calling screen. reject() is an unconditional POST.
      // reject() already removes us from the call — do NOT also call leave().
      // The strip proved leave() after reject() throws "Cannot leave call that has
      // already been left", which was harmless but produced an alarming FAILED line
      // and did nothing useful. reject() is the single, complete decline action.
      await call.reject();
      debugLog('reject ok');
      onDeclined?.();
    } catch (e) {
      console.warn('[IncomingCall] decline failed:', e);
      debugLog(`reject FAILED: ${e?.message ?? e}`);
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

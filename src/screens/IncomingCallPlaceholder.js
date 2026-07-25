import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Shown from the moment we know a call is arriving until the real ring screen can
// render (see src/pendingCall.js for why there is a gap at all).
//
// Deliberately a copy of IncomingCallScreen's shell — same background, same caller
// block in the same place — with a spinner where the Accept/Decline row goes. The
// point is that the transition is invisible: the phone goes straight to a call
// screen, and a moment later the buttons appear on it. Rendering a *different*
// screen here, or the app's own Home tab, is what made the call look broken.
//
// No Accept/Decline buttons: there is no call object yet, so they could not do
// anything, and a dead button on an incoming call is worse than no button.
export default function IncomingCallPlaceholder() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  return (
    <View
      style={[
        styles.container,
        { width, height, paddingTop: insets.top + 64, paddingBottom: Math.max(48, insets.bottom + 32) },
      ]}
    >
      <View style={styles.callerInfo}>
        <Text style={styles.callerName}>Yap Family</Text>
        <Text style={styles.subtitle}>incoming video call</Text>
      </View>

      {/* Occupies the button row's slot so the caller block doesn't shift when the
          real screen takes over. */}
      <View style={styles.buttons}>
        <ActivityIndicator size="large" color="rgba(255,255,255,0.8)" />
        <Text style={styles.connecting}>Connecting…</Text>
      </View>
    </View>
  );
}

// Mirrors IncomingCallScreen's styles — if one changes, change both.
const styles = StyleSheet.create({
  container: {
    backgroundColor: '#4a4a4a',
    justifyContent: 'space-between',
    paddingHorizontal: 44,
    alignItems: 'center',
  },
  callerInfo: { alignItems: 'center', gap: 6 },
  callerName: { fontSize: 34, fontWeight: '300', color: '#fff', letterSpacing: 0.2 },
  subtitle: { fontSize: 20, fontWeight: '300', color: 'rgba(255,255,255,0.65)' },

  // Same vertical band as IncomingCallScreen's 76px button row.
  buttons: { height: 110, alignItems: 'center', justifyContent: 'center', gap: 12 },
  connecting: { fontSize: 15, color: 'rgba(255,255,255,0.65)', fontWeight: '400' },
});

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getPendingCid } from '../pendingCall';
import { setCallIntent, useCallIntent } from '../callIntent';
import { stopRing } from '../ringHeartbeat';

// Shown from the moment we know a call is arriving until the real ring screen can
// render (see src/pendingCall.js for why there is a gap at all).
//
// Deliberately a copy of IncomingCallScreen's shell — same background, same caller
// block in the same place, same button row — so the handover is invisible: the
// buttons do not move, change size or change colour when the real screen takes
// over underneath them.
//
// ⚠️ These buttons used to be a spinner, on the reasoning that there is no call
// object yet so they could not do anything, and a dead button on an incoming call
// is worse than no button. The dead-button part is right; the conclusion was not.
// A press does not have to ACT immediately, it only has to be remembered — the
// call is already identified by its cid at this point, so the press is banked in
// src/callIntent.js and executed by IncomingCallScreen the instant it mounts.
// Reported on the Oppo as "the spin wheel stays on for about 5 seconds and I
// don't like that", which is the connect time, paid on every call because the app
// exits after each one.
//
// ⚠️ Declining here does NOT reach the kiosk any sooner: rejecting a call needs a
// connected client, so the kiosk rings for the length of the connect either way.
// What it buys is that the user can answer and put the phone down rather than
// stand there holding it waiting for the buttons to appear.
export default function IncomingCallPlaceholder() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const intent = useCallIntent();
  const pressed = intent?.action ?? null;

  const onAccept = () => {
    if (pressed) return;
    setCallIntent('accept', getPendingCid());
  };

  const onDecline = () => {
    if (pressed) return;
    const cid = getPendingCid();
    setCallIntent('decline', cid);
    // Stop the backend watching this call now rather than when the client
    // finally arrives, so it cannot ring a phone that has already said no. This
    // is plain HTTP to our own backend and needs no Stream client, which is the
    // whole reason it can run this early.
    stopRing(cid, 'declined');
  };

  return (
    <View
      style={[
        styles.container,
        { width, height, paddingTop: insets.top + 64, paddingBottom: Math.max(48, insets.bottom + 32) },
      ]}
    >
      <View style={styles.callerInfo}>
        <Text style={styles.callerName}>Yap Family</Text>
        <Text style={styles.subtitle}>
          {/* 'video call', not 'incoming video call': IncomingCallScreen's idle
              subtitle is 'video call', and the two screens are stacked during the
              handover, so any difference reads as the text changing under the
              user's thumb. */}
          {pressed === 'accept' ? 'Connecting…' : pressed === 'decline' ? 'Ending…' : 'video call'}
        </Text>
      </View>

      <View style={styles.buttons}>
        <View style={styles.btnColumn}>
          <TouchableOpacity
            style={[styles.circle, styles.circleDecline, pressed && styles.disabled]}
            onPress={onDecline}
            disabled={!!pressed}
            accessibilityLabel="Decline call"
          >
            {pressed === 'decline'
              ? <ActivityIndicator size="large" color="#fff" />
              : <Text style={[styles.glyph, styles.glyphDecline]}>📞</Text>}
          </TouchableOpacity>
          <Text style={styles.btnLabel}>{pressed === 'decline' ? 'Ending…' : 'Decline'}</Text>
        </View>

        <View style={styles.btnColumn}>
          <TouchableOpacity
            style={[styles.circle, styles.circleAccept, pressed && styles.disabled]}
            onPress={onAccept}
            disabled={!!pressed}
            accessibilityLabel="Accept call"
          >
            {pressed === 'accept'
              ? <ActivityIndicator size="large" color="#fff" />
              : <Text style={styles.glyph}>📞</Text>}
          </TouchableOpacity>
          <Text style={styles.btnLabel}>{pressed === 'accept' ? 'Connecting…' : 'Accept'}</Text>
        </View>
      </View>
    </View>
  );
}

// Mirrors IncomingCallScreen's styles — if one changes, change both. They are
// stacked one over the other during the handover, so any difference shows up as
// the buttons visibly jumping.
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

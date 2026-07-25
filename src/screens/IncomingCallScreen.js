import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Vibration, ActivityIndicator, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCall, useCallStateHooks, CallingState } from '@stream-io/video-react-native-sdk';
import { debugLog } from '../debugLog';

// A hung call.join() must not leave Accept spinning forever with no error (the
// iPhone symptom). Time it out so a hang becomes a visible failure that resets
// the button and writes to the debug strip.
function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      v => { clearTimeout(t); resolve(v); },
      e => { clearTimeout(t); reject(e); },
    );
  });
}

// Full-screen incoming call UI shown when the kiosk "Call Mum/Dad" button rings this device.
export default function IncomingCallScreen({ onAccepted, onDeclined, onDeclineStart }) {
  const call = useCall();
  const { useCallCallingState } = useCallStateHooks();
  const callingState = useCallCallingState();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  // Accepting takes a few seconds (join the WebRTC call). Without a pending state
  // the screen looks frozen, so the button gets tapped repeatedly and each tap
  // fires another concurrent join, making it slower still.
  const [busy, setBusy] = useState(null); // null | 'accepting' | 'declining'

  useEffect(() => {
    // Vibrate only — no in-app ringtone. On iOS Kath has already been alerted by
    // the Bark notification (a loud, continuous ring) and tapped it to answer; a
    // second, different ring here just feels disconnected. Android still plays its
    // native incoming-call ring via the notification channel (index.js) — this
    // screen only adds a buzz. (assets/iphone_x.mp3 is now unused.)
    const pattern = [0, 800, 1400];
    Vibration.vibrate(pattern, true);

    // There is deliberately no iOS audio-session warm-up here any more. One was
    // added on the theory that the audio session was the iOS-only cost inside
    // join(); the strip then showed the real cost was callingx waiting on a CallKit
    // audio-session activation that can never happen on this cert (see index.js),
    // so the warm-up was treating a symptom that wasn't there. With callingx no
    // longer set up on iOS, StreamInCallManager configures the session itself at
    // join time — a second writer to AVAudioSession here would only fight it.

    return () => Vibration.cancel();
  }, []);

  // Stop the buzz the instant a choice is made.
  useEffect(() => {
    if (busy) Vibration.cancel();
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
    const t0 = Date.now();
    try {
      //
      // Join FIRST, enable media after: enabling camera+mic before join once hung
      // the whole accept on iOS (a hanging camera.enable() never let join run). The
      // camera is secondary — enable it once the call is connected. join() is
      // time-boxed so a genuinely hung join surfaces as a failure on the strip
      // instead of an infinite spinner.
      debugLog('accept: joining');
      // Where does the time actually go? Timing only around join() cannot tell a
      // join that hung with nothing happening from one that reached the SFU and
      // negotiated slowly — and a 30s timeout was read as "slow audio session"
      // on that evidence alone. The SDK moves callingState to JOINING immediately
      // and to JOINED on SFU connect, so these transitions bracket the cost.
      //
      // Subscribed here rather than in a React effect: CallOverlay swaps to
      // ActiveCallScreen as soon as the state is JOINING, which unmounts this
      // screen mid-join, so an effect would stop reporting exactly when the
      // interesting part starts.
      const since = () => `+${Date.now() - t0}ms`;
      let sub;
      try {
        sub = call.state.callingState$.subscribe(s => debugLog(`state ${s} ${since()}`));
      } catch (e) {
        // Not fatal — the join still runs, we just lose the breakdown. Say so,
        // rather than leaving a silent gap that looks like "no transitions".
        console.warn('[IncomingCall] state subscribe failed:', e);
        debugLog(`state sub FAILED: ${e?.message ?? e}`);
      }
      try {
        await withTimeout(call.join(), 30000, 'join');
      } finally {
        sub?.unsubscribe?.();
      }
      debugLog(`accept: joined ok in ${Date.now() - t0}ms`);
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
      debugLog(`join FAILED after ${Date.now() - t0}ms: ${e?.message ?? e}`);
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

      // ...then end the call for everyone, because reject() alone provably does not
      // close the kiosk. Measured: the strip read `reject ok` (a real 200 — the SDK
      // throws on anything else) while the kiosk, with a listener confirmed attached
      // and logging before any filtering, received no `call.rejected` whatsoever and
      // sat on "Calling Dad…" forever.
      //
      // reject() stays because it is the correct semantic — it records WHO declined
      // and is what a ringing flow expects. endCall() is what actually terminates the
      // call, and it is the same call the hangup path makes, which is confirmed
      // working from this phone (session 15 read `endCall ok`). It also means decline
      // no longer depends on one specific event being delivered to the kiosk.
      //
      // NOT leave(): reject() has already removed us, and leave() after it throws
      // "Cannot leave call that has already been left" (proven on the strip).
      try {
        await call.endCall();
        debugLog('endCall ok');
      } catch (e) {
        // Non-fatal for us — we have already declined and this screen is going away.
        // Logged, never swallowed: if the kiosk still hangs, this line is the answer.
        console.warn('[IncomingCall] endCall after reject failed:', e);
        debugLog(`endCall FAILED: ${e?.message ?? e}`);
      }

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

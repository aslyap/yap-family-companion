import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Vibration, ActivityIndicator, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCall, useCallStateHooks, CallingState } from '@stream-io/video-react-native-sdk';
import { debugLog } from '../debugLog';
import { callSeq, traceCall } from '../callTrace';
import { markAccepting, isAccepting, clearAccepting } from '../acceptState';
import { applyPublishTuning } from '../publishTuning';
import { startRingHeartbeat, stopRing } from '../ringHeartbeat';

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

// Report what the camera hardware is ACTUALLY doing, not what the SDK thinks.
//
// `selectDirection('front')` resolved twice on build 07a124a — `camera ok` and
// `cam front re-asserted`, no error — and the iPhone still came up on the back
// camera. Needing TWO presses of the rotate button to turn it round is the tell:
// flip() toggles from `state.direction`, so a first press that does nothing means
// the SDK's tracked direction was already 'front' while the hardware was on the
// back. That is a state/hardware divergence, and the only way to tell which of the
// two is lying is to read the track itself.
//
// getSettings() is native truth on iOS: VideoCaptureController returns facingMode
// from its own `usingFrontCamera`, plus the real deviceId and capture dimensions.
// Printed alongside the SDK's `state.direction` so the two can be compared
// directly on the strip. Remove with the rest of the debug code.
function camState(call, n, label) {
  try {
    const track = call.camera.state.mediaStream?.getVideoTracks?.()[0];
    if (!track) {
      debugLog(`#${n} cam@${label} dir=${call.camera.state.direction} NO TRACK`);
      return;
    }
    const s = track.getSettings?.() ?? {};
    // deviceId is a long UUID and the strip is one phone wide — the tail is enough
    // to tell two cameras apart, which is all it is being used for.
    const dev = s.deviceId ? String(s.deviceId).slice(-6) : '?';
    debugLog(
      `#${n} cam@${label} dir=${call.camera.state.direction} fm=${s.facingMode} ` +
      `dev=…${dev} ${s.width}x${s.height}`,
    );
  } catch (e) {
    // Never silent: a throw here and a camera that simply never reports would look
    // identical on the strip, which is the exact trap that cost session 21.
    console.warn('[IncomingCall] camState failed:', e);
    debugLog(`#${n} cam@${label} READ FAILED: ${e?.message ?? e}`);
  }
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
  //
  // Seeded from the module-level accept set, NOT from null. A join that retries
  // internally flaps the calling state back to RINGING, which remounts this screen
  // and would otherwise hand back a live Accept button on a call that is already
  // joining — see src/acceptState.js. Seeding it means the remounted screen comes
  // up already showing "Connecting…", which is also the truth.
  const [busy, setBusy] = useState(() => (isAccepting(call?.cid) ? 'accepting' : null));

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

  // Tell the backend this call is already on screen, so the Bark push is never
  // sent — it would hold the iOS audio session and mute the call both ways.
  //
  // Bound to this screen being MOUNTED, which is the exact condition the backend
  // needs evidence of. If the app dies, is backgrounded, or loses its client, the
  // beats stop by construction and the backend rings late rather than never.
  useEffect(() => {
    if (!call?.cid) return;
    return startRingHeartbeat(call.cid, () => ({
      state: call.state.callingState,
      // A mounted screen over a dead socket must not suppress the alert.
      healthy: !!call.streamClient?._hasConnectionID?.(),
    }));
  }, [call]);

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
    // The real guard. `busy` is component state and this screen is remounted
    // whenever the join flaps back to RINGING, so `busy` alone permits a second
    // join() on an already-joining call — which the SDK rejects with
    // `Illegal State: call.join() shall be called only once`, failing the call.
    if (isAccepting(call?.cid)) {
      debugLog(`accept ignored: already joining ${call?.cid?.slice(-10)}`);
      setBusy('accepting');
      return;
    }
    markAccepting(call?.cid);
    // Terminal signal, and it is required, not tidy-up: this screen unmounts the
    // moment the state reaches JOINING, so the heartbeat stops by itself — and
    // without this the backend would read that silence as "the phone died" and
    // fire Bark INTO the answered call, which is the exact audio-killing state
    // this whole mechanism exists to prevent.
    stopRing(call?.cid, 'answered');
    setBusy('accepting');
    const t0 = Date.now();
    // Which call of this process is this? On iOS only the first one after launch
    // works, so every line below has to say which run it belongs to or the two
    // near-identical sequences cannot be compared.
    const n = callSeq(call);
    try {
      //
      // Start join FIRST, enable media once the SFU says JOINED: enabling
      // camera+mic before join once hung the whole accept on iOS (a hanging
      // camera.enable() never let join run). join() is time-boxed so a genuinely
      // hung join surfaces as a failure on the strip instead of an infinite
      // spinner. What media must NOT wait for is join() *resolving* — see
      // startMedia below.
      debugLog(`#${n} accept: joining`);
      // Started BEFORE join, and deliberately not stopped when this screen goes
      // away: the kiosk should appear as a participant during or just after the
      // join, and CallOverlay unmounts this screen at JOINING. traceCall keeps
      // reporting on its own subscription until the call leaves.
      traceCall(call);
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

      // Publish as soon as the SFU says we are JOINED — do NOT wait for join() to
      // resolve.
      //
      // Measured on Android: `state joined +2243ms` and `accept: joined ok in
      // 10579ms`. join() sets JOINED and then keeps going for another 8.3 seconds
      // inside doJoin (initPublisherAndSubscriber, then applyDeviceConfig). For the
      // whole of that tail the phone was connected and publishing nothing, which is
      // why the kiosk showed an avatar instead of a picture. Worse, that call ended
      // at +9985ms — before join() returned at all — so camera.enable() ran against
      // a call that had already left and threw `camera FAILED: InvalidStateError`.
      // The media never came on at all, and the failure looked like a camera bug.
      //
      // JOINED means the SFU connection is up, which is the only precondition
      // publishing actually has. Bound to the state transition rather than the
      // promise so the tail cannot delay or cancel it.
      let mediaStarted = false;
      const startMedia = () => {
        if (mediaStarted) return;
        mediaStarted = true;
        debugLog(`#${n} media: enabling ${since()}`);
        // Fire-and-forget; a camera/mic failure must not strand a connected call.
        //
        // selectDirection('front'), NOT flip(). flip() is a toggle — it was added in
        // 5c7caff to get the front camera when the call opened on the back one, so it
        // only produces the front camera from a known-back starting point. On the
        // iPhone the call already opens front-facing, so the flip turned it AWAY from
        // Kath and pointed it at the floor. selectDirection is absolute: front is front
        // whatever the call started on, on either platform.
        call.camera.enable()
          .then(() => camState(call, n, 'enabled'))
          .then(() => call.camera.selectDirection('front'))
          .then(() => {
            camState(call, n, 'sel1');
            debugLog(`#${n} camera ok ${since()}`);
          })
          .catch(e => {
            console.warn('[IncomingCall] camera.enable/selectDirection failed:', e);
            debugLog(`#${n} camera FAILED ${since()}: ${e?.message ?? e}`);
          });
        call.microphone.enable()
          .then(() => {
            // `mic ok` used to mean only that the promise resolved, which is not
            // the same as having a microphone. The Android strip read `mic ok
            // +935ms` and then `me pub=-V` — enable() succeeded and AUDIO was
            // still not in publishedTracks. Session 19 hit the mirror image of
            // this on the kiosk: a mic that reported healthy while bound to a
            // Windows device alias. So report the actual track, raw and named,
            // the way the kiosk camera path already does.
            const track = call.microphone.state.mediaStream?.getAudioTracks?.()[0];
            const detail = track
              ? `${track.readyState} muted=${track.muted} enabled=${track.enabled}`
              : 'NO TRACK';
            debugLog(`#${n} mic ok ${since()} status=${call.microphone.state.status} [${detail}]`);
          })
          .catch(e => {
            console.warn('[IncomingCall] mic.enable failed:', e);
            debugLog(`#${n} mic FAILED ${since()}: ${e?.message ?? e}`);
          });
      };

      let sub;
      try {
        sub = call.state.callingState$.subscribe(s => {
          debugLog(`#${n} state ${s} ${since()}`);
          if (s === CallingState.JOINED) startMedia();
        });
      } catch (e) {
        // Not fatal — the join still runs, we just lose the breakdown. Say so,
        // rather than leaving a silent gap that looks like "no transitions".
        console.warn('[IncomingCall] state subscribe failed:', e);
        debugLog(`state sub FAILED: ${e?.message ?? e}`);
      }
      // Last line of defence before the SDK's own throw. If anything else already
      // took this call into the join flow, calling join() again is the documented
      // Illegal State error and kills a call that was about to succeed.
      const stateNow = call.state.callingState;
      if (stateNow === CallingState.JOINING || stateNow === CallingState.JOINED) {
        debugLog(`#${n} accept: already ${stateNow}, not re-joining`);
        sub?.unsubscribe?.();
        return;
      }
      // Before join(), never after — the SDK ignores it once JOINED.
      applyPublishTuning(call);
      try {
        await withTimeout(call.join(), 30000, 'join');
      } finally {
        sub?.unsubscribe?.();
      }
      debugLog(`#${n} accept: joined ok in ${Date.now() - t0}ms`);
      onAccepted();
      // Backstop only. startMedia() has almost certainly already run off the JOINED
      // transition above; it is idempotent. This covers the case where join()
      // resolves without callingState$ ever emitting JOINED to this subscriber.
      startMedia();

      // Re-assert the direction now that join() has fully finished.
      //
      // 894e3c1 moved media enable from "after join() resolves" to "on JOINED",
      // which put selectDirection into a race it was not in before: doJoin awaits
      // applyDeviceConfig(this.state.settings, ...) AFTER setting JOINED, and that
      // applies the call type's own default camera facing. Our front-facing choice
      // was being made first and then overwritten — the camera came up backwards
      // again, which is the regression reported after that commit. join() having
      // returned means applyDeviceConfig has run, so this is the last word.
      // Idempotent when the camera is already front-facing.
      camState(call, n, 'preRe');
      call.camera.selectDirection('front')
        .then(() => {
          camState(call, n, 'postRe');
          debugLog(`#${n} cam front re-asserted ${Date.now() - t0}ms`);
          // The settled reading. applyDeviceConfig, publishing and the SFU's own
          // track negotiation all finish after join() returns, and any of them
          // could restart the capture session — a direction that is correct at
          // +2.7s and wrong at +10s is a different bug from one that was never
          // applied. Timed, not change-triggered: if nothing changes, nothing
          // would be logged, and silence would read the same as not-watching.
          setTimeout(() => camState(call, n, 'settled10s'), 10000);
        })
        .catch(e => {
          console.warn('[IncomingCall] post-join selectDirection failed:', e);
          debugLog(`#${n} cam re-assert FAILED: ${e?.message ?? e}`);
        });
    } catch (e) {
      console.warn('[IncomingCall] accept failed:', e);
      debugLog(`#${n} join FAILED after ${Date.now() - t0}ms: ${e?.message ?? e}`);
      // Released only on failure, so a genuine retry is possible. On success the
      // flag deliberately outlives the join — that is the whole point of it.
      clearAccepting(call?.cid);
      setBusy(null); // let them try again rather than stranding them on a dead screen
    }
  }

  async function decline() {
    if (busy) return;
    setBusy('declining');
    // Declined calls must stop the watch too, or the backend rings a phone that
    // has just said no.
    stopRing(call?.cid, 'declined');
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

import { debugLog } from './debugLog';

// Start the call near full bitrate instead of crawling up to it.
//
// Measured on the kiosk, first call, phone on home wifi and the kiosk on the LAN:
//
//   +6s    12fps
//   +11s   Δ12.8fps   Δ292kbps
//   +16s   Δ25.6fps   Δ498kbps
//   +21s   Δ30.4fps   Δ778kbps
//   +31s   Δ31.2fps   Δ1722kbps
//   +46s   Δ30.0fps   Δ5410kbps
//
// Framerate takes ~20 seconds to reach 30fps and the bitrate is still climbing at
// 46 seconds. That is the entire "the video is very slow" report: on a call to
// Kath lasting half a minute, most of the call is spent ramping.
//
// The first sample is Δ292kbps, and the SDK documents its default start bitrate as
// 300kbps. So the phone begins every call at 300kbps and discovers the real
// capacity from there — on a link that turns out to sustain 5.4Mbps at rtt=4ms.
//
// The reason FRAMERATE is what collapses is that the resolution stays pinned at
// 720x1280 the whole way up (confirmed in every sample). With a fixed resolution
// and a tiny bitrate, framerate is the only thing left to give: 2.8fps is simply
// what 720x1280 looks like at 185kbps.
//
// Note what this is NOT: dropping the resolution would trade a permanent quality
// loss for a transient problem, and was rejected for that reason. Nothing here
// changes the steady state — same 720x1280, same maximum, same final quality. Only
// the STARTING estimate moves, so the ramp begins near the top instead of at the
// bottom.
//
// `preferredBitrate` is deliberately left alone: it sets the MAXIMUM, and these
// calls climb to 5.4Mbps on their own. Pinning it lower would be exactly the
// permanent cut we ruled out.
//
// The factor is a fraction of the call's max bitrate (start = max × factor). 0.5 is
// chosen for a home-wifi-to-LAN link that measures rtt=4ms, which is the only
// network this has ever run on. ⚠️ If this app is ever used from a poor or
// cellular network — Kath calling from overseas — this is the FIRST number to
// revisit: starting high on a bad link causes loss and makes things worse. That is
// why the SDK calls it `dangerously…`. It is one number, tune it from a reading.
const START_BITRATE_FACTOR = 0.5;

/**
 * Must be called BEFORE join(). The SDK warns and ignores it otherwise
 * ("Updating publish options after joining the call does not have an effect").
 */
export function applyPublishTuning(call) {
  try {
    call.updatePublishOptions({
      dangerouslySetStartBitrateFactor: START_BITRATE_FACTOR,
    });
    debugLog(`publish: start bitrate x${START_BITRATE_FACTOR}`);
  } catch (err) {
    // Never silent: if this throws, the call still works and simply ramps the way
    // it always has — which would look exactly like "the fix did not help".
    console.warn('[publish] updatePublishOptions failed:', err);
    debugLog(`publish tuning FAILED: ${err?.message ?? err}`);
  }
}

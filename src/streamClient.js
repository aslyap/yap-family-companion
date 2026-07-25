import { StreamVideoClient } from '@stream-io/video-react-native-sdk';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STREAM_API_KEY, BACKEND_URL, STREAM_USERS } from './config';

// A single token fetch must not hang. React Native's fetch has no default
// timeout, so a cold-booting Fly backend (it scales to zero) can leave the
// request pending for a minute or more — long enough to blow the whole ring
// window. Abort each attempt so a slow backend fails fast and the retry runs.
const TOKEN_FETCH_TIMEOUT_MS = 12000;

// The overall connect must not hang either. connectUser resolves only once the
// WebSocket health-check event arrives; on a cold start woken by FCM the socket
// can open and then stall waiting for that event, and connectUser waits forever.
// A hang is worse than a failure here: StreamWrapper's retry only fires on a
// rejection, and every getOrCreateClient() caller is handed the same pending
// promise. Time the connect out so it rejects, _connecting clears, and the retry
// can make a genuinely fresh attempt. Generous enough for one cold Fly boot;
// still well inside the ring window, with the retry covering the rest.
const CONNECT_TIMEOUT_MS = 20000;

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
    promise.then(
      v => { clearTimeout(t); resolve(v); },
      e => { clearTimeout(t); reject(e); },
    );
  });
}

export async function tokenProvider(userId) {
  // Retry up to 3 times with backoff. After a phone restart the network and
  // the Fly.io backend may not be ready when FCM first wakes the app.
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TOKEN_FETCH_TIMEOUT_MS);
    try {
      console.log(`[Stream] tokenProvider attempt ${attempt + 1} for ${userId}`);
      const r = await fetch(
        `${BACKEND_URL}/api/stream/token?user_id=${userId}`,
        { signal: ctrl.signal },
      );
      if (!r.ok) throw new Error(`Token fetch failed: ${r.status}`);
      const d = await r.json();
      console.log(`[Stream] token received for ${userId}`);
      return d.token;
    } catch (e) {
      console.warn(`[Stream] tokenProvider attempt ${attempt + 1} failed:`, e);
      lastError = e;
      if (attempt < 2) await new Promise(res => setTimeout(res, 2000 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

let _client = null;
let _connecting = null;

// Returns a connected StreamVideoClient, creating one if needed.
// Reads identity from AsyncStorage so both the FCM background handler
// (setPushConfig in index.js) and App.js share the same client + call state.
export async function getOrCreateClient() {
  if (_client) return _client;
  if (_connecting) return _connecting;
  _connecting = (async () => {
    const identity = (await AsyncStorage.getItem('yap_identity')) || 'kath';
    const user = STREAM_USERS[identity];
    const c = new StreamVideoClient({ apiKey: STREAM_API_KEY });
    try {
      await withTimeout(
        c.connectUser(user, () => tokenProvider(user.id)),
        CONNECT_TIMEOUT_MS,
        'connectUser',
      );
    } catch (e) {
      // Tear down the half-open client. The underlying connectUser cannot be
      // cancelled, so it may still complete later; disconnecting stops it
      // leaving a zombie WebSocket around while the retry builds a fresh client.
      c.disconnectUser().catch(() => {});
      throw e;
    }
    _client = c;
    return c;
  })();
  try {
    return await _connecting;
  } catch (err) {
    // Clearing _connecting here is the whole point. It used to be cleared only on
    // the success path, so a failed connect left the rejected promise cached and
    // every later caller was handed that same rejection — the client could never
    // connect again for the life of the process.
    //
    // That is precisely what happens on a cold start: FCM wakes the app and
    // index.js calls this as setPushConfig's createStreamVideoClient, before the
    // radio is necessarily up. One failure there and the app was permanently
    // clientless, so useCalls() stayed empty and the incoming call never showed.
    console.warn('[Stream] connect failed, will retry on next call:', err);
    throw err;
  } finally {
    _connecting = null;
  }
}

export function clearClient() {
  _client = null;
  _connecting = null;
}

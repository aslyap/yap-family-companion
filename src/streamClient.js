import { StreamVideoClient } from '@stream-io/video-react-native-sdk';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STREAM_API_KEY, BACKEND_URL, STREAM_USERS } from './config';

export async function tokenProvider(userId) {
  // Retry up to 3 times with backoff. After a phone restart the network and
  // the Fly.io backend may not be ready when FCM first wakes the app.
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      console.log(`[Stream] tokenProvider attempt ${attempt + 1} for ${userId}`);
      const r = await fetch(`${BACKEND_URL}/api/stream/token?user_id=${userId}`);
      if (!r.ok) throw new Error(`Token fetch failed: ${r.status}`);
      const d = await r.json();
      console.log(`[Stream] token received for ${userId}`);
      return d.token;
    } catch (e) {
      console.warn(`[Stream] tokenProvider attempt ${attempt + 1} failed:`, e);
      lastError = e;
      if (attempt < 2) await new Promise(res => setTimeout(res, 2000 * (attempt + 1)));
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
    await c.connectUser(user, () => tokenProvider(user.id));
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

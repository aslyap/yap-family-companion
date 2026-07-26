import { StreamVideoClient } from '@stream-io/video-react-native-sdk';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STREAM_API_KEY, BACKEND_URL, STREAM_USERS } from './config';
import { debugLog } from './debugLog';

// A single token fetch must not hang. React Native's fetch has no default
// timeout, so a cold-booting Fly backend (it scales to zero) can leave the
// request pending for a minute or more — long enough to blow the whole ring
// window. Abort each attempt so a slow backend fails fast and the retry runs.
// Must fit INSIDE CONNECT_TIMEOUT_MS below, with the retries and their backoff.
// It did not: 3 attempts at 12000 plus 2s and 4s of backoff is a 42s budget inside
// a 20s one, so on a slow radio the outer timeout always fired part-way through a
// retry, tore the client down, and the replacement client started the token
// sequence again from scratch — a loop that cannot converge no matter how many
// times StreamWrapper retries. 2 attempts at 8000 plus 2s backoff is 18s, which
// leaves the second attempt able to actually finish before the connect gives up.
// The backend answers this endpoint in ~30ms from a desk PC, so an attempt that
// needs 8s is the phone's radio, and a third attempt on a dead radio buys nothing
// that StreamWrapper's own backoff doesn't already buy.
const TOKEN_FETCH_TIMEOUT_MS = 8000;
const TOKEN_FETCH_ATTEMPTS = 2;

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
  for (let attempt = 0; attempt < TOKEN_FETCH_ATTEMPTS; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TOKEN_FETCH_TIMEOUT_MS);
    const t0 = Date.now();
    try {
      console.log(`[Stream] tokenProvider attempt ${attempt + 1} for ${userId}`);
      const r = await fetch(
        `${BACKEND_URL}/api/stream/token?user_id=${userId}`,
        { signal: ctrl.signal },
      );
      if (!r.ok) throw new Error(`Token fetch failed: ${r.status}`);
      const d = await r.json();
      console.log(`[Stream] token received for ${userId}`);
      debugLog(`token ok in ${Date.now() - t0}ms (try ${attempt + 1})`);
      return d.token;
    } catch (e) {
      console.warn(`[Stream] tokenProvider attempt ${attempt + 1} failed:`, e);
      // The backend answers this endpoint in ~30ms from a desk PC, so a slow or
      // failing token fetch here is the phone's radio, not Fly cold-booting —
      // a distinction that has been guessed at for several sessions.
      debugLog(`token FAILED try ${attempt + 1} after ${Date.now() - t0}ms: ${e?.message ?? e}`);
      lastError = e;
      if (attempt < TOKEN_FETCH_ATTEMPTS - 1) {
        await new Promise(res => setTimeout(res, 2000 * (attempt + 1)));
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

// TEMPORARY — see the logger option below.
//
// The strip holds a fixed number of lines and the SDK is chatty, so an unfiltered
// firehose would evict the accept sequence it is meant to explain. Only warn and
// error, deduped, truncated, and capped for the life of the process: past the cap
// the interesting failure has already happened and anything later is noise.
const SDK_LOG_CAP = 10;
let sdkLogCount = 0;
let lastSdkLine = null;

function sdkLogger(logLevel, message, ...args) {
  if (logLevel !== 'warn' && logLevel !== 'error') return;
  console.warn(`[sdk:${logLevel}]`, message, ...args);
  if (sdkLogCount >= SDK_LOG_CAP) return;
  // Errors carry the actual reason in an argument, not in the message.
  const detail = args
    .map(a => (a instanceof Error ? a.message : typeof a === 'string' ? a : ''))
    .filter(Boolean)
    .join(' ');
  const line = `[sdk] ${message}${detail ? ` — ${detail}` : ''}`.slice(0, 110);
  if (line === lastSdkLine) return;
  lastSdkLine = line;
  sdkLogCount += 1;
  debugLog(sdkLogCount === SDK_LOG_CAP ? `${line} (sdk log cap)` : line);
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
    // Where does the connect actually go? The strip's `no client · attempt=1` is
    // true of a connect that is 2 seconds in and of one that will never finish,
    // and the placeholder looks identical either way — so "the buttons sometimes
    // never appear" has had no evidence behind it at all. These lines bracket the
    // two phases (token fetch, then connectUser) the same way the accept sequence
    // brackets the join.
    const t0 = Date.now();
    const identity = (await AsyncStorage.getItem('yap_identity')) || 'kath';
    const user = STREAM_USERS[identity];
    debugLog(`connect: start me=${identity}`);
    const c = new StreamVideoClient({
      apiKey: STREAM_API_KEY,
      // TEMPORARY — route the SDK's own warnings onto the debug strip.
      //
      // The iPhone strip showed callingState oscillating joining -> ringing ->
      // joining -> ringing -> joining -> joined over 7.3s. That is Call.join's
      // internal retry loop: doJoin failed, restored the previous state, slept and
      // tried again, twice, before succeeding. The reason for each failure goes to
      // `this.logger.warn('Failed to join call (n)')` and nowhere else — and
      // neither phone can produce console logs, so it has been invisible. After two
      // failures the SDK also sets `migrating_from` and moves to a different SFU,
      // which is a large behavioural change nobody knew was happening.
      //
      // These MUST be nested under `options`. The constructor reads
      // `typeof apiKeyOrArgs === 'string' ? opts : apiKeyOrArgs.options`
      // (index.es.js:17880), so passing an object puts every client option behind
      // `.options` — and top-level `logLevel`/`logger` were silently ignored.
      // `rootLogger` then fell back to `logToConsole`, i.e. straight to a console
      // neither phone can produce. This instrumentation has never once emitted a
      // line, which is exactly why the reason for the join retries is still
      // unknown: `[sdk]` being absent was read as "the SDK logged nothing".
      options: {
        logLevel: 'warn',
        logger: sdkLogger,
      },
    });
    try {
      await withTimeout(
        c.connectUser(user, () => tokenProvider(user.id)),
        CONNECT_TIMEOUT_MS,
        'connectUser',
      );
      debugLog(`connect: ok in ${Date.now() - t0}ms`);
    } catch (e) {
      debugLog(`connect FAILED after ${Date.now() - t0}ms: ${e?.message ?? e}`);
      // Tear down the half-open client. The underlying connectUser cannot be
      // cancelled, so it may still complete later; disconnecting stops it
      // leaving a zombie WebSocket around while the retry builds a fresh client.
      c.disconnectUser().catch(e => console.warn('[Stream] disconnect after failed connect failed:', e));
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

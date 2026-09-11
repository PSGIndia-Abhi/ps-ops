/**
 * Backend base URL configuration.
 *
 * The existing web app resolves this the same way (see frontend/.env vs
 * frontend/.env.production -> VITE_API_BASE): a different base URL per build,
 * never a single hardcoded production URL baked into the client.
 *
 * `__DEV__` is React Native's built-in build-time flag (true in a Metro debug
 * build, false in a release build), so this switches automatically with the
 * same `npx react-native run-android` / release-build split the team already
 * uses for the web app's dev vs prod env files — no extra native config
 * library required for this phase.
 *
 * IMPORTANT: DEV_API_BASE_URL assumes the backend is reachable from the
 * device/emulator. The Android emulator reaches the host machine's
 * localhost via 10.0.2.2, not 127.0.0.1 - update this to your machine's LAN
 * IP (e.g. http://192.168.1.20:3000) when testing on a physical device.
 *
 * PROD_API_BASE_URL: confirmed live, not guessed - verified directly with
 * curl against the real production server (2026-09-11). No trailing `/api`
 * here - every call site already passes its own full path including
 * `/api/...` (e.g. `httpClient.post('/api/auth/login', ...)`), and that
 * single `/api` prefix is the real, currently-working route:
 *   curl https://bestserve.co.in/api/auth/login       -> 401 "Invalid
 *     credentials" (the real route, reached correctly)
 *   curl https://bestserve.co.in/api/api/auth/login   -> 404 "Cannot POST
 *     /api/api/auth/login" (doubled prefix, does not exist)
 * An earlier version of this comment claimed the opposite (a doubled
 * `/api/api` was required) and set this constant with a trailing `/api` to
 * match - that was true at some earlier point but is no longer accurate
 * against the server as of the date above; production's routing evidently
 * changed. Re-verify with the same two curl commands before trusting either
 * version of this comment again - do not take it on faith.
 */

const DEV_API_BASE_URL = 'http://10.0.2.2:3000';
const PROD_API_BASE_URL = 'https://bestserve.co.in';

export const API_BASE_URL = __DEV__ ? DEV_API_BASE_URL : PROD_API_BASE_URL;

export const REQUEST_TIMEOUT_MS = 15000;
  
if (!__DEV__ && !PROD_API_BASE_URL) {
  // Fails loudly in a release build rather than silently pointing nowhere.
  console.error(
    '[env] PROD_API_BASE_URL is not configured. Set it in src/config/env.ts before releasing.',
  );
}

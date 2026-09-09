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
 * PROD_API_BASE_URL: confirmed live, not guessed - verified directly against
 * the real production server before setting this. This is the same domain
 * the existing Capacitor app's WebView loads (frontend/capacitor.config.json).
 * The other domain found in the backend's env (bestserve.in, used only for
 * SMTP/email branding) was checked too and does NOT serve the API (404 on
 * the same checks) - not used here.
 *
 * IMPORTANT - this base URL includes a trailing `/api`, unlike
 * DEV_API_BASE_URL below, even though every call site already passes its
 * own full path including `/api/...` (e.g. `httpClient.get('/api/
 * notifications')`). That looks like it should double up to `/api/api/...`
 * and it does - but that doubled path is the actual, verified contract of
 * this production deployment, not a mistake:
 *   curl https://bestserve.co.in/api/auth/login       -> 404 (Express's own
 *     "Cannot POST /auth/login" - the request reached Node with the /api
 *     prefix already stripped by production's reverse proxy)
 *   curl https://bestserve.co.in/api/api/auth/login   -> 401 "Invalid
 *     credentials" (the real route, reached correctly)
 * Confirmed the same way on a second, unrelated endpoint
 * (/api/notifications/unread-count: 404 vs 401 "No token provided").
 * Whatever server-side routing produces this, mobile has to match the real
 * deployed behavior, not the theoretically-clean one - hence the trailing
 * `/api` here despite every call site already having its own.
 */

const DEV_API_BASE_URL = 'http://10.0.2.2:3000';
const PROD_API_BASE_URL = 'https://bestserve.co.in/api';

export const API_BASE_URL = __DEV__ ? DEV_API_BASE_URL : PROD_API_BASE_URL;

export const REQUEST_TIMEOUT_MS = 15000;
  
if (!__DEV__ && !PROD_API_BASE_URL) {
  // Fails loudly in a release build rather than silently pointing nowhere.
  console.error(
    '[env] PROD_API_BASE_URL is not configured. Set it in src/config/env.ts before releasing.',
  );
}

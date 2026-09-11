import * as Keychain from 'react-native-keychain';
import type { AuthSession } from '../types/auth';

/**
 * Secure, encrypted, on-device credential storage (Android Keystore-backed
 * via react-native-keychain) - never AsyncStorage/localStorage-equivalent,
 * per CLAUDE.md ("secure encrypted storage for authentication tokens").
 *
 * We store the whole session (token + role + ids) as a single JSON blob
 * under one keychain "service" so restart/persisted-login only needs one
 * secure read.
 */

const SERVICE = 'com.bestserve.mobile.session';

/**
 * In-memory mirror of whatever's in the Keychain, set synchronously the
 * moment save/clear is called. Without this, code that saves a session and
 * then immediately makes an authenticated request (e.g. AuthContext calling
 * fetchCurrentUser() right after login) can race the underlying Keystore
 * write: getToken() reading back too soon sees no entry yet, the follow-up
 * request goes out with no Authorization header, the backend correctly
 * 401s it, and the whole login appears to fail with a misleading "Incorrect
 * email or password" - even though the login itself genuinely succeeded.
 * `undefined` means "process hasn't checked the Keychain yet" (cold start);
 * loadSession() falls back to the real read exactly once in that case, then
 * this cache is authoritative for the rest of the app's lifetime.
 */
let cachedSession: AuthSession | null | undefined;

export async function saveSession(session: AuthSession): Promise<void> {
  cachedSession = session;
  await Keychain.setGenericPassword(session.userId ?? 'session', JSON.stringify(session), {
    service: SERVICE,
  });
}

export async function loadSession(): Promise<AuthSession | null> {
  if (cachedSession !== undefined) return cachedSession;

  const result = await Keychain.getGenericPassword({ service: SERVICE });
  if (!result) {
    cachedSession = null;
    return null;
  }

  try {
    cachedSession = JSON.parse(result.password) as AuthSession;
  } catch {
    cachedSession = null;
  }
  return cachedSession;
}

export async function clearSession(): Promise<void> {
  cachedSession = null;
  await Keychain.resetGenericPassword({ service: SERVICE });
}

export async function getToken(): Promise<string | null> {
  const session = await loadSession();
  return session?.token ?? null;
}

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

export async function saveSession(session: AuthSession): Promise<void> {
  await Keychain.setGenericPassword(session.userId ?? 'session', JSON.stringify(session), {
    service: SERVICE,
  });
}

export async function loadSession(): Promise<AuthSession | null> {
  const result = await Keychain.getGenericPassword({ service: SERVICE });
  if (!result) return null;

  try {
    return JSON.parse(result.password) as AuthSession;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  await Keychain.resetGenericPassword({ service: SERVICE });
}

export async function getToken(): Promise<string | null> {
  const session = await loadSession();
  return session?.token ?? null;
}

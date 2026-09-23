import * as Keychain from 'react-native-keychain';

/**
 * Small encrypted per-user key/value store (Android Keystore via react-native-keychain, the same
 * mechanism the login token uses) - so drafts and unsent leads, which hold customer phone numbers,
 * never sit on the phone as plain text. `scope` is the signed-in user's id, so one user's drafts
 * are never shown to another user of the same phone.
 */
const PREFIX = 'com.bestserve.mobile.crm.';

function service(scope: string, key: string): string {
  return `${PREFIX}${scope}.${key}`;
}

export async function kvGet<T>(scope: string, key: string): Promise<T | null> {
  try {
    const result = await Keychain.getGenericPassword({
      service: service(scope, key),
    });
    if (!result) return null;
    return JSON.parse(result.password) as T;
  } catch {
    return null;
  }
}

export async function kvSet(
  scope: string,
  key: string,
  value: unknown,
): Promise<void> {
  try {
    await Keychain.setGenericPassword(key, JSON.stringify(value), {
      service: service(scope, key),
    });
  } catch {
    // Storage is a convenience (drafts, last choices); failing to write must never break the form.
  }
}

export async function kvRemove(scope: string, key: string): Promise<void> {
  try {
    await Keychain.resetGenericPassword({ service: service(scope, key) });
  } catch {
    // ignore
  }
}

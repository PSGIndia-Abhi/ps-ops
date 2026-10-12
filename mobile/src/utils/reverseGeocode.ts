import { NativeModules } from 'react-native';

/**
 * This app's own small native module (android/app/src/main/java/com/bestserve/mobile/reversegeocoder).
 * It uses Android's built-in geocoder: no API key and no per-lookup charge.
 */
const { ReverseGeocoder } = NativeModules as {
  ReverseGeocoder?: { reverseGeocode(latitude: number, longitude: number): Promise<string | null> };
};

/** Long enough for a slow mobile connection, short enough that the form never feels stuck. */
const LOOKUP_TIMEOUT_MS = 6000;

/**
 * The written address for a GPS point, or null when there is none to give (no internet, no
 * geocoder on this phone, nothing known at that spot, or it took too long). Never rejects - an
 * address is a convenience, and the caller carries on without it.
 */
export async function reverseGeocode(latitude: number, longitude: number): Promise<string | null> {
  if (!ReverseGeocoder) return null;
  const timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), LOOKUP_TIMEOUT_MS));
  try {
    return await Promise.race([ReverseGeocoder.reverseGeocode(latitude, longitude), timeout]);
  } catch {
    return null;
  }
}

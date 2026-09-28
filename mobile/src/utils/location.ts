import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import Geolocation from '@react-native-community/geolocation';

/**
 * This app's own small native module (android/app/src/main/java/com/bestserve/mobile/locationenabler) -
 * not a published package. See its doc comment for why: the one published library for this
 * (react-native-android-location-enabler) doesn't compile against this project's RN/Kotlin toolchain.
 */
const { LocationEnabler } = NativeModules as {
  LocationEnabler?: { promptForEnableLocationIfNeeded(): Promise<'enabled' | 'already-enabled'> };
};

export interface DeviceLocation {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
}

export class LocationError extends Error {}

/**
 * Specifically "the device's Location toggle is off" (not a permission
 * problem, not a slow/poor GPS fix) - the native module's own Android
 * source (`AndroidLocationManager.java`) emits `POSITION_UNAVAILABLE`
 * immediately, synchronously, the moment neither the GPS nor network
 * provider is enabled, rather than the usual "waited and never got a fix"
 * path. Distinguishing this lets the caller show an actual "turn location
 * on" action instead of a plain "try again" message the user can't act on
 * without already knowing to dig through Settings themselves.
 */
export class LocationServicesDisabledError extends LocationError {}

/**
 * Use Google Play Services' fused location (GPS + Wi-Fi + cell towers, the
 * same source Google Maps uses) instead of the library's default plain
 * Android LocationManager. With enableHighAccuracy the default provider is
 * GPS-only, which inside a building usually never gets a fix at all - no
 * matter how long we wait. Fused location runs on-device: no API key, no
 * billing. Permission is still requested by ensureLocationPermission below.
 */
Geolocation.setRNConfiguration({
  skipPermissionRequests: true,
  locationProvider: 'playServices',
  enableBackgroundLocationUpdates: false,
});

/** Below this, a fix is good enough to stop waiting for anything better. */
const GOOD_ACCURACY_METERS = 25;
/**
 * Indoors (Wi-Fi based fixes) accuracy often settles around 30-50m and never
 * reaches GOOD_ACCURACY_METERS. Once the device has had a few seconds to
 * refine, a fix within this is accepted instead of waiting out the window.
 */
const ACCEPTABLE_ACCURACY_METERS = 50;
const ACCEPTABLE_AFTER_MS = 4000;
/** How long we're willing to wait for a better-than-first fix before giving up and using the best one seen. */
const ACQUIRE_WINDOW_MS = 15000;
/** Fused updates default to every 10s - ask for ~1/s so refinements actually arrive within the window. */
const WATCH_INTERVAL_MS = 1000;
const WATCH_FASTEST_INTERVAL_MS = 500;

/**
 * Requests the Android runtime location permission if not already granted.
 * Only asked for right before it's actually needed (visit start), never on
 * app launch.
 */
async function ensureLocationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    {
      title: 'Location permission',
      message: 'BestServe needs your location to confirm you’re at the job site before starting a visit.',
      buttonPositive: 'Allow',
      buttonNegative: 'Deny',
    },
  );
  return granted === PermissionsAndroid.RESULTS.GRANTED;
}

function toDeviceLocation(coords: {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
}): DeviceLocation {
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracy: coords.accuracy ?? null,
    speed: coords.speed ?? null,
    heading: coords.heading ?? null,
  };
}

/**
 * A fresh-enough cached fix is exactly as good as a brand-new one for this purpose - if the OS (Play
 * Services' fused location) already has one this recent sitting in memory (very common: Maps/navigation
 * open a few minutes ago, or the chip never fully spun down), using it is not a lower bar, just a faster
 * way to clear the exact same GOOD_ACCURACY_METERS bar below.
 */

const CACHED_FIX_MAX_AGE_MS = 15000;
/** How long the fast cached-fix check is allowed to take before falling through to the full watch below. */
const CACHED_FIX_TIMEOUT_MS = 2000;

/** A single quick, cheap attempt: resolves fast when the device already has a good-enough fix sitting in memory; resolves `null` (never rejects) otherwise, so the caller always falls through to the thorough watch. */
function getCachedFixIfGoodEnough(): Promise<DeviceLocation | null> {
  return new Promise((resolve) => {
    Geolocation.getCurrentPosition(
      (position) => {
        const candidate = toDeviceLocation(position.coords);
        const accuracy = candidate.accuracy ?? Number.POSITIVE_INFINITY;
        resolve(accuracy <= GOOD_ACCURACY_METERS ? candidate : null);
      },
      () => resolve(null),
      { enableHighAccuracy: true, maximumAge: CACHED_FIX_MAX_AGE_MS, timeout: CACHED_FIX_TIMEOUT_MS },
    );
  });
}

/**
 * Reads the current device location for a geofence check.
 *
 * GPS gotcha this specifically works around: a single `getCurrentPosition`
 * call on Android frequently returns whatever fix is available *first*,
 * which - especially on a cold GPS chip, indoors, or near tall buildings -
 * can be a coarse network-based estimate with hundreds of metres to
 * kilometres of error, even though a much better fix arrives a few seconds
 * later. Sending that first coarse fix straight to the geofence check is
 * exactly how a technician standing at the correct site sees "you are 1.5km
 * away": the *distance calculation* isn't wrong, the *input coordinate* is.
 *
 * The fix here is not to weaken the geofence (radius/logic are entirely
 * backend-owned and untouched) - it's to give the device a bounded window
 * (up to ACQUIRE_WINDOW_MS) to refine its fix via `watchPosition`, keep
 * whichever reading has the best (lowest) `accuracy` seen in that window,
 * and return early the moment a genuinely good fix (<=25m) arrives rather
 * than waiting out the full window. The watch is always cleared on every
 * exit path (resolve, reject, or timeout) so nothing keeps the GPS radio
 * running after this call returns.
 *
 * Two speed-ups on top of that, neither loosening the same GOOD_ACCURACY_METERS bar:
 *  1. A quick check (<=2s) for an already-good cached fix before ever starting the slower watch - the
 *     common case (technician's phone already has a recent fix from having just navigated here) then
 *     resolves almost instantly instead of waiting out a multi-second acquisition every single time.
 *  2. On Android, a location-services-off check that can fix itself in place: if the device's Location
 *     toggle is off, this shows Android's own "Turn on Location?" dialog right over this screen (Google
 *     Play Services - identical on every phone, unlike an OEM's own Settings app) instead of only
 *     discovering the problem after a slow, doomed-to-fail wait. If the technician accepts it, location
 *     turns on immediately and the read proceeds normally in the same call - no navigating away and back.
 */
export async function getCurrentLocation(): Promise<DeviceLocation> {
  const hasPermission = await ensureLocationPermission();
  if (!hasPermission) {
    throw new LocationError('Location permission is required to start this visit.');
  }

  if (Platform.OS === 'android' && LocationEnabler) {
    try {
      // Resolves near-instantly with no dialog at all when location is already on - this call is not
      // itself the slow part, it just short-circuits a doomed multi-second wait when it's off.
      await LocationEnabler.promptForEnableLocationIfNeeded();
    } catch {
      throw new LocationServicesDisabledError(
        'Location is turned off on this device. Turn it on to start this visit.',
      );
    }
  }

  const cached = await getCachedFixIfGoodEnough();
  if (cached) return cached;

  return new Promise<DeviceLocation>((resolve, reject) => {
    let best: DeviceLocation | null = null;
    let settled = false;
    let watchId: number | null = null;
    const startedAt = Date.now();

    const bestAccuracy = () => best?.accuracy ?? Number.POSITIVE_INFINITY;

    const finish = (result: DeviceLocation | null, error?: LocationError) => {
      if (settled) return;
      settled = true;
      clearTimeout(windowTimeoutId);
      clearTimeout(acceptableTimeoutId);
      if (watchId !== null) Geolocation.clearWatch(watchId);
      if (result) {
        resolve(result);
      } else {
        reject(error ?? new LocationError('Current location is required to start this visit.'));
      }
    };

    const windowTimeoutId = setTimeout(() => finish(best), ACQUIRE_WINDOW_MS);
    // An acceptable fix may have arrived before ACCEPTABLE_AFTER_MS with no
    // further update after it - check once when that point is reached.
    const acceptableTimeoutId = setTimeout(() => {
      if (bestAccuracy() <= ACCEPTABLE_ACCURACY_METERS) finish(best);
    }, ACCEPTABLE_AFTER_MS);

    watchId = Geolocation.watchPosition(
      (position) => {
        const candidate = toDeviceLocation(position.coords);
        const candidateAccuracy = candidate.accuracy ?? Number.POSITIVE_INFINITY;

        if (candidateAccuracy < bestAccuracy()) {
          best = candidate;
        }

        const elapsed = Date.now() - startedAt;
        if (
          bestAccuracy() <= GOOD_ACCURACY_METERS ||
          (bestAccuracy() <= ACCEPTABLE_ACCURACY_METERS && elapsed >= ACCEPTABLE_AFTER_MS)
        ) {
          finish(best);
        }
      },
      (error) => {
        // Only a permission loss is final. Fused location reports
        // POSITION_UNAVAILABLE transiently while it is still acquiring
        // (common indoors), and Location being switched off is already
        // handled by the LocationEnabler check above - so any other error
        // just lets the window run on, and the window timeout decides.
        if (error?.code === error?.PERMISSION_DENIED) {
          finish(null, new LocationError('Location permission is required to start this visit.'));
        }
      },
      // distanceFilter must be 0: its default (100m) would suppress exactly
      // the updates this is trying to catch - a chip refining its accuracy
      // without the device actually moving 100m still needs to be reported.
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        distanceFilter: 0,
        interval: WATCH_INTERVAL_MS,
        fastestInterval: WATCH_FASTEST_INTERVAL_MS,
      },
    );
  });
}

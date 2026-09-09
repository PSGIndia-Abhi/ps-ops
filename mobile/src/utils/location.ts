import { PermissionsAndroid, Platform } from 'react-native';
import Geolocation from '@react-native-community/geolocation';

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

/** Below this, a fix is good enough to stop waiting for anything better. */
const GOOD_ACCURACY_METERS = 25;
/** How long we're willing to wait for a better-than-first fix before giving up and using the best one seen. */
const ACQUIRE_WINDOW_MS = 8000;

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
 */
export async function getCurrentLocation(): Promise<DeviceLocation> {
  const hasPermission = await ensureLocationPermission();
  if (!hasPermission) {
    throw new LocationError('Location permission is required to start this visit.');
  }

  return new Promise<DeviceLocation>((resolve, reject) => {
    let best: DeviceLocation | null = null;
    let settled = false;
    let watchId: number | null = null;

    const finish = (result: DeviceLocation | null, error?: LocationError) => {
      if (settled) return;
      settled = true;
      if (watchId !== null) Geolocation.clearWatch(watchId);
      if (result) {
        resolve(result);
      } else {
        reject(error ?? new LocationError('Current location is required to start this visit.'));
      }
    };

    const timeoutId = setTimeout(() => finish(best), ACQUIRE_WINDOW_MS);

    watchId = Geolocation.watchPosition(
      (position) => {
        const candidate = toDeviceLocation(position.coords);
        const candidateAccuracy = candidate.accuracy ?? Number.POSITIVE_INFINITY;
        const bestAccuracy = best?.accuracy ?? Number.POSITIVE_INFINITY;

        if (candidateAccuracy < bestAccuracy) {
          best = candidate;
        }

        if (candidateAccuracy <= GOOD_ACCURACY_METERS) {
          clearTimeout(timeoutId);
          finish(best);
        }
      },
      (error) => {
        clearTimeout(timeoutId);
        // POSITION_UNAVAILABLE with no fix ever received means there was no
        // provider to even try (Location toggled off), not just a bad/slow
        // fix - `best` staying null in every other error case is still
        // handled by the generic message above.
        if (!best && error?.code === error?.POSITION_UNAVAILABLE) {
          finish(
            null,
            new LocationServicesDisabledError(
              'Location is turned off on this device. Turn it on to start this visit.',
            ),
          );
          return;
        }
        finish(best);
      },
      // distanceFilter must be 0: its default (100m) would suppress exactly
      // the updates this is trying to catch - a chip refining its accuracy
      // without the device actually moving 100m still needs to be reported.
      { enableHighAccuracy: true, maximumAge: 0, distanceFilter: 0 },
    );
  });
}

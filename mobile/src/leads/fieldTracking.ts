import { AppState, NativeModules, Platform, type AppStateStatus } from 'react-native';
import { httpClient } from '../api/httpClient';

/**
 * Background GPS for a sales executive's shift.
 *
 * The recording itself is native (android/.../fieldtracking): a foreground service that takes a fix
 * about every minute and keeps it in an on-phone queue, so a weak or missing network loses nothing.
 * This file starts / stops that service and uploads the queue in batches to
 * POST /api/field-tracking/points, deleting from the phone only what the server answered for.
 * The manager reviews the route after the day (web: Lead Management -> Field Tracking), so uploads
 * do not need to be instant - every few minutes while the app is running, when it comes back to
 * the front, and at End Shift.
 */

interface QueuedPoint {
  id: number;
  clientPointId: string;
  shiftId: string;
  capturedAtMs: number;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speedKmph: number | null;
  bearing: number | null;
  batteryPercent: number | null;
}

const { FieldTracking } = NativeModules as {
  FieldTracking?: {
    start(shiftId: string, intervalMs: number): Promise<boolean>;
    stop(): Promise<boolean>;
    status(): Promise<{ running: boolean; shiftId: string | null }>;
    pending(limit: number): Promise<QueuedPoint[]>;
    remove(ids: number[]): Promise<boolean>;
    pendingCount(): Promise<number>;
  };
};

/** How often the phone takes a GPS fix during a shift. */
const INTERVAL_MS = 60_000;
/** How often the queue is uploaded while the app process is running. */
const UPLOAD_EVERY_MS = 3 * 60_000;
/** The server's per-request limit (MAX_BATCH in sales-field-tracking.routes.js). */
const BATCH = 500;

const available = () => Platform.OS === 'android' && !!FieldTracking;

let uploadTimer: ReturnType<typeof setInterval> | null = null;
let appStateSub: { remove(): void } | null = null;
let flushing: Promise<void> | null = null;

function startUploadLoop() {
  if (!uploadTimer) uploadTimer = setInterval(() => { flushPoints(); }, UPLOAD_EVERY_MS);
  if (!appStateSub) {
    appStateSub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') flushPoints();
    });
  }
}

function stopUploadLoop() {
  if (uploadTimer) clearInterval(uploadTimer);
  uploadTimer = null;
  appStateSub?.remove();
  appStateSub = null;
}

/**
 * Uploads everything queued on the phone, oldest first, one shift's points per request. Stops at the
 * first network/server failure and keeps the rest for next time. Never throws.
 */
export function flushPoints(): Promise<void> {
  if (!available()) return Promise.resolve();
  if (flushing) return flushing;
  flushing = (async () => {
    try {
      for (;;) {
        const queued = await FieldTracking!.pending(BATCH);
        if (!queued.length) return;
        // The queue can hold more than one shift (ended and started again); upload the oldest one's.
        const shiftId = queued[0].shiftId;
        const batch = queued.filter((p) => p.shiftId === shiftId);
        try {
          await httpClient.post('/api/field-tracking/points', {
            shiftId,
            points: batch.map(({ id: _id, shiftId: _s, ...p }) => p),
          });
        } catch (err) {
          // 400 / 404: the server will never take these (bad batch, shift not found or not theirs) -
          // drop them so they do not block every later upload. Anything else (no network, signed
          // out, server error): keep them and retry later.
          const status = (err as { status?: number })?.status;
          if (status === 400 || status === 404) {
            await FieldTracking!.remove(batch.map((p) => p.id));
            continue;
          }
          return;
        }
        await FieldTracking!.remove(batch.map((p) => p.id));
      }
    } catch {
      // Reading the phone queue failed - try again on the next round.
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}

/** Start recording for this shift (Start Shift). The app must be open - Android requires it. */
export async function startTracking(shiftId: string): Promise<void> {
  if (!available()) return;
  await FieldTracking!.start(shiftId, INTERVAL_MS);
  startUploadLoop();
}

/**
 * Make sure the service is recording for the open shift - after the app was closed, the phone was
 * restarted, or Android stopped the service. Called whenever the shift is (re)loaded.
 */
export async function ensureTracking(shiftId: string): Promise<void> {
  if (!available()) return;
  try {
    const status = await FieldTracking!.status();
    if (!status.running || status.shiftId !== shiftId) await FieldTracking!.start(shiftId, INTERVAL_MS);
    startUploadLoop();
    flushPoints();
  } catch {
    // Not fatal: the shift is still open; the next screen load tries again.
  }
}

/** Stop recording (End Shift, or no open shift any more) and upload what is left. */
export async function stopTracking(): Promise<void> {
  if (!available()) return;
  try {
    await FieldTracking!.stop();
  } finally {
    stopUploadLoop();
    await flushPoints();
  }
}

/** True while the service holds a shift id (recording, or told to record). */
export async function isTracking(): Promise<boolean> {
  if (!available()) return false;
  try {
    const status = await FieldTracking!.status();
    return !!status.shiftId;
  } catch {
    return false;
  }
}

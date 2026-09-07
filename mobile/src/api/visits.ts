import { httpClient } from './httpClient';
import type { TechnicianVisit, JobVisit } from '../types/visit';
import type { DeviceLocation } from '../utils/location';

/** GET /api/visits/my - requires VIEW_VISIT. The technician's own worklist. */
export async function listMyVisits(): Promise<TechnicianVisit[]> {
  const { data } = await httpClient.get<TechnicianVisit[]>('/api/visits/my');
  return data;
}

/** GET /api/visits/jobs/:jobId/visits - requires VIEW_VISIT. All visits for one job. */
export async function getJobVisits(jobId: string): Promise<JobVisit[]> {
  const { data } = await httpClient.get<JobVisit[]>(`/api/visits/jobs/${jobId}/visits`);
  return data;
}

interface VisitActionResult {
  success: boolean;
  distanceMeters?: number;
}

/**
 * PATCH /api/visits/:visitId/start - requires START_VISIT. Geofence-gated:
 * a 403 with code OUTSIDE_GEOFENCE (carrying distanceMeters/radiusMeters)
 * means the technician is too far from the site - handled explicitly by
 * the caller, not treated as a generic error.
 */
export async function startVisit(visitId: string, location: DeviceLocation): Promise<VisitActionResult> {
  const { data } = await httpClient.patch(`/api/visits/${visitId}/start`, location);
  return data;
}

/** POST /api/visits/:visitId/start-anyway - requires START_VISIT. Used for MISSED visits. */
export async function startVisitAnyway(
  visitId: string,
  location: DeviceLocation,
): Promise<VisitActionResult> {
  const { data } = await httpClient.post(`/api/visits/${visitId}/start-anyway`, location);
  return data;
}

/** PATCH /api/visits/:visitId/submit - requires SUBMIT_VISIT. */
export async function submitVisit(visitId: string): Promise<{ success: boolean }> {
  const { data } = await httpClient.patch(`/api/visits/${visitId}/submit`);
  return data;
}

/** PATCH /api/visits/:visitId/approve - requires APPROVE_VISIT. */
export async function approveVisit(visitId: string): Promise<{ success: boolean }> {
  const { data } = await httpClient.patch(`/api/visits/${visitId}/approve`);
  return data;
}

/**
 * PATCH /api/visits/:visitId/reschedule - requires UPDATE_VISIT.
 * `scheduled_time` must be "HH:MM" (24h) and `scheduled_date` "YYYY-MM-DD" -
 * the backend's own normalizer (normalizeScheduledDateTime) only accepts
 * these exact formats.
 */
export async function rescheduleVisit(
  visitId: string,
  scheduledDate: string,
  scheduledTime: string,
): Promise<{ success: boolean }> {
  const { data } = await httpClient.patch(`/api/visits/${visitId}/reschedule`, {
    scheduled_date: scheduledDate,
    scheduled_time: scheduledTime,
  });
  return data;
}

/** PATCH /api/visits/:visitId/technicians - requires UPDATE_VISIT. Replaces the full technician list. */
export async function updateVisitTechnicians(
  visitId: string,
  technicianIds: Array<string | number>,
): Promise<{ success: boolean }> {
  const { data } = await httpClient.patch(`/api/visits/${visitId}/technicians`, {
    technician_ids: technicianIds,
  });
  return data;
}

/** PATCH /api/visits/:visitId/cancel - requires UPDATE_VISIT. No confirmation on the backend - the client must confirm first. */
export async function cancelVisit(visitId: string): Promise<{ success: boolean }> {
  const { data } = await httpClient.patch(`/api/visits/${visitId}/cancel`);
  return data;
}

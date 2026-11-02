import { httpClient } from './httpClient';

/**
 * Brigade Group bookings (backend: /api/brigade). Only the calls the
 * technician app needs: whether a job is a Brigade booking, and the
 * before/after work-photo steps that gate End Visit for those jobs.
 */

export interface BrigadeJobDetails {
  is_brigade: boolean;
  property?: string;
  site_name?: string | null;
  flat_number?: string;
  bhk?: string;
  min_visit_photos?: number;
}

export interface VisitPhotoStatus {
  visit_id: string;
  job_id: string;
  visit_status: string;
  is_brigade: boolean;
  /** Minimum photos per phase (3); 0 for non-Brigade jobs. */
  required: number;
  before: number;
  after: number;
  before_done: boolean;
  after_done: boolean;
}

export type PhotoPhase = 'before' | 'after';

/** GET /api/brigade/jobs/:jobId - requires VIEW_JOB. `{ is_brigade: false }` for any other job. */
export async function getJobDetails(jobId: string): Promise<BrigadeJobDetails> {
  const { data } = await httpClient.get<BrigadeJobDetails>(`/api/brigade/jobs/${jobId}`);
  return data;
}

/** GET /api/brigade/visits/:visitId/photos - requires VIEW_VISIT. */
export async function getVisitPhotos(visitId: string): Promise<VisitPhotoStatus> {
  const { data } = await httpClient.get<VisitPhotoStatus>(`/api/brigade/visits/${visitId}/photos`);
  return data;
}

/**
 * POST /api/brigade/visits/:visitId/photos/:phase - requires SUBMIT_VISIT.
 * Opens the job update the photos belong to and returns its history_id; each
 * photo is then sent with the existing jobsApi.uploadJobAttachment. The
 * visit must be IN_PROGRESS, and "after" needs the before photos first.
 */
export async function startPhotoUpload(
  visitId: string,
  phase: PhotoPhase,
): Promise<{ history_id: string; job_id: string; action: string }> {
  const { data } = await httpClient.post(`/api/brigade/visits/${visitId}/photos/${phase}`);
  return data;
}

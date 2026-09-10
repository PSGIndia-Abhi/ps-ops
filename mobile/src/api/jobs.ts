import { httpClient } from './httpClient';
import type { Job, JobDetail, JobHistoryEntry, JobAttachment, JobStatus } from '../types/job';

/**
 * GET /api/jobs - requires VIEW_JOB. Already scoped server-side by role
 * (admin: all in scope; supervisor/technician/branch_admin: filtered via
 * buildScopeFilter) - the client renders exactly what comes back.
 */
export async function listJobs(): Promise<Job[]> {
  const { data } = await httpClient.get<Job[]>('/api/jobs');
  return data;
}

/**
 * GET /api/jobs/:jobId - requires VIEW_JOB. Returns a genuinely different
 * shape from the list endpoint (see JobDetail's doc comment).
 */
export async function getJob(jobId: string): Promise<JobDetail> {
  const { data } = await httpClient.get<JobDetail>(`/api/jobs/${jobId}`);
  return data;
}

/**
 * PATCH /api/jobs/:id/status - requires UPDATE_JOB_STATUS. See
 * JOB_STATUS_TRANSITIONS for the exact rules this endpoint enforces
 * server-side (this call doesn't duplicate that logic, just triggers it).
 */
export async function updateJobStatus(
  jobId: string,
  status: JobStatus,
): Promise<{ success: boolean; previous: JobStatus; current: JobStatus }> {
  const { data } = await httpClient.patch(`/api/jobs/${jobId}/status`, { status });
  return data;
}

/** GET /api/jobs/:jobId/history - requires VIEW_JOB. Comments + status changes + attachments, one timeline. */
export async function getJobHistory(jobId: string): Promise<JobHistoryEntry[]> {
  const { data } = await httpClient.get<JobHistoryEntry[]>(`/api/jobs/${jobId}/history`);
  return data;
}

/** GET /api/jobs/:jobId/attachments - requires VIEW_JOB. */
export async function getJobAttachments(jobId: string): Promise<JobAttachment[]> {
  const { data } = await httpClient.get<JobAttachment[]>(`/api/jobs/${jobId}/attachments`);
  return data;
}

/**
 * POST /api/jobs/:jobId/comments - requires ADD_JOB_COMMENT. Returns the
 * new history_id, which a photo (if any) must then be uploaded against -
 * mirrors the existing web app's JobUpdateComposer flow exactly (comment
 * first, then upload tied to that history entry).
 */
export async function addJobComment(
  jobId: string,
  message: string,
): Promise<{ success: boolean; history_id: string }> {
  const { data } = await httpClient.post(`/api/jobs/${jobId}/comments`, { message });
  return data;
}

/**
 * POST /api/jobs/:jobId/attachments/upload - requires ADD_JOB_COMMENT.
 * Multipart upload tied to an existing history_id (from addJobComment).
 * `type` mirrors the web app's own convention exactly (JobPage.jsx:
 * `file.type.startsWith("image") ? "IMAGE" : "FILE"`) - derived from the
 * attachment's real mime type here too, now that this flow sends more than
 * just photos (documents, voice-note recordings).
 */
export async function uploadJobAttachment(
  jobId: string,
  historyId: string,
  file: { uri: string; name: string; type: string },
): Promise<{ success: boolean; attachment: JobAttachment }> {
  const form = new FormData();
  // React Native's FormData accepts this {uri,name,type} shape directly -
  // it is not a real Blob/File, but RN's networking layer knows how to
  // stream it from the uri.
  form.append('file', {
    uri: file.uri,
    name: file.name,
    type: file.type,
  } as unknown as Blob);
  form.append('history_id', historyId);
  form.append('type', file.type.startsWith('image') ? 'IMAGE' : 'FILE');

  const { data } = await httpClient.post(`/api/jobs/${jobId}/attachments/upload`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export type ReassignScope = 'current' | 'range' | 'future';

/**
 * POST /api/jobs/:jobId/reassign - requires REASSIGN_JOB. `scope` mirrors
 * the backend/web exactly: "current" (just this job), "range" (requires
 * rangeStart/rangeEnd, only valid when the job belongs to a recurring
 * booking), or "future" (this and all later occurrences in the series).
 */
export async function reassignJob(
  jobId: string,
  supervisorId: string | number,
  technicianIds: Array<string | number>,
  scope: ReassignScope = 'current',
  range?: { start: string; end: string },
): Promise<{ success: boolean }> {
  const { data } = await httpClient.post(`/api/jobs/${jobId}/reassign`, {
    supervisorId,
    technicianIds,
    scope,
    rangeStart: scope === 'range' ? range?.start : undefined,
    rangeEnd: scope === 'range' ? range?.end : undefined,
  });
  return data;
}

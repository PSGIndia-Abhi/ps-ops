/**
 * Mirrors the ACTUAL response of GET /api/jobs and GET /api/jobs/:jobId
 * (backend/src/routes/jobs.routes.js) - field names copied verbatim from
 * the route's res.json() mapping, not guessed.
 */

/** backend `jobs_status` enum (prisma/schema.prisma) */
export type JobStatus =
  | 'CREATED'
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'PAUSED'
  | 'COMPLETED'
  | 'CANCELED';

export type JobApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | null;

export interface JobPerson {
  id: string | number;
  name: string;
  phone?: string | null;
}

export interface JobRequester {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  company?: string | null;
}

export interface Job {
  id: string;
  code: string;
  booking_id: string | null;
  service_type: string;
  /** aliased from `sub_service` by the backend */
  title: string;
  status: JobStatus;
  approval_status: JobApprovalStatus;
  start_date: string | null;
  dueDate: string | null;
  next_visit_date: string | null;
  notes: string | null;
  address: string | null;
  company_id: string | null;
  companyname: string | null;
  site: string | null;
  supervisor: JobPerson | null;
  requestedBy: JobRequester | null;
  is_archived: boolean;
  team: JobPerson[];
  /** only populated for role === 'client' */
  latest_comment?: string | null;
  latest_comment_at?: string | null;
}

/**
 * Mirrors GET /api/jobs/:jobId - a genuinely different shape from the list
 * endpoint above (own backend quirk, not a mobile-side inconsistency):
 * address/site info is nested under `requestedBy.company` here instead of
 * flat `address`/`companyname`/`site` fields, and it adds
 * `display_status`/`booking_code`/`temporary_workers`/`has_recurring`.
 */
export interface JobDetailCompany {
  id: string;
  code: string | null;
  name: string | null;
  type: string | null;
  site: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  place_id: string | null;
  postal_code: string | null;
  country: string | null;
}

export interface JobDetailRequester {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  company: JobDetailCompany | null;
}

export interface JobDetailTemporaryWorker {
  id: string;
  name: string;
  phone_number: string | null;
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
}

export interface JobDetail {
  id: string;
  code: string;
  booking_id: string | null;
  booking_code: string | null;
  title: string;
  service_type: string;
  status: JobStatus;
  /** status with a couple of extra derived states layered on (AWAITING_APPROVAL / LOST / PENDING) */
  display_status: string;
  approval_status: JobApprovalStatus;
  approved_at: string | null;
  notes: string | null;
  start_date: string | null;
  dueDate: string | null;
  supervisor: JobPerson | null;
  requestedBy: JobDetailRequester | null;
  team: JobPerson[];
  temporary_workers: JobDetailTemporaryWorker[];
  has_recurring: boolean;
}

/**
 * The set of transitions PATCH /api/jobs/:id/status actually accepts,
 * copied verbatim from its `allowedTransitions` map (jobs.routes.js). A
 * technician is further restricted to only NOT_STARTED -> IN_PROGRESS by
 * that same endpoint - but in practice the real web app never calls this
 * endpoint as a technician at all; a technician's own "start" happens via
 * visit start instead (see JobVisit below), which bumps the job to
 * IN_PROGRESS as a side effect. This map is only used to gate the
 * admin/supervisor status buttons.
 */
export const JOB_STATUS_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  CREATED: [],
  NOT_STARTED: ['IN_PROGRESS', 'CANCELED'],
  IN_PROGRESS: ['PAUSED', 'COMPLETED', 'CANCELED'],
  PAUSED: ['IN_PROGRESS', 'COMPLETED', 'CANCELED'],
  COMPLETED: [],
  CANCELED: [],
};

/** Mirrors one entry of GET /api/jobs/:jobId/history exactly. */
export interface JobHistoryAttachment {
  id: string;
  type: string;
  file_name: string | null;
  file_type: string | null;
}

export interface JobHistoryEntry {
  id: string;
  action: string;
  message: string | null;
  metadata: string | null;
  created_at: string;
  created_by: string | null;
  is_temporary_worker_comment: boolean;
  visible_to_client: boolean;
  attachments: JobHistoryAttachment[];
}

/** Mirrors GET /api/jobs/:jobId/attachments exactly. */
export interface JobAttachment {
  id: string;
  job_id: string;
  history_id: string;
  type: string;
  object_key: string | null;
  file_name: string | null;
  file_type: string | null;
  file_url: string | null;
  created_at: string;
}

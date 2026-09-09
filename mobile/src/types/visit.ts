/**
 * Mirrors GET /api/visits/my exactly (backend/src/controllers/visits.controller.js
 * getMyVisits - the raw SQL row shape, not transformed server-side).
 */

/** backend `job_visits_status` enum (prisma/schema.prisma) */
export type VisitStatus =
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'AWAITING_APPROVAL'
  | 'COMPLETED'
  | 'CANCELED'
  | 'MISSED';

export interface TechnicianVisit {
  id: string;
  visit_number: number;
  scheduled_date: string | null;
  status: VisitStatus;
  job_id: string;
  job_code: string;
  sub_service: string;
  job_status: string;
  address: string | null;
  company_id: string | null;
  sitename: string | null;
  company_id_real: string | null;
  companyname: string | null;
}

export interface VisitTechnician {
  id: string | number;
  name: string;
}

export interface VisitTemporaryWorker {
  id: string;
  name: string;
}

/**
 * Mirrors GET /api/visits/jobs/:jobId/visits exactly
 * (backend/src/controllers/visits.controller.js getJobVisits) - the
 * per-job visit list shown on JobDetailScreen, distinct from the
 * technician's own flat "my visits" shape above.
 */
export interface JobVisit {
  id: string;
  visit_number: number;
  scheduled_date: string | null;
  status: VisitStatus;
  started_at: string | null;
  completed_at: string | null;
  notes: string | null;
  technicians: VisitTechnician[];
  temporary_workers: VisitTemporaryWorker[];
}

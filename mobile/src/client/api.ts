import { httpClient } from '../api/httpClient';

// Client Portal API - the same /api/client-portal endpoints the web portal uses.
// The backend decides which company and outlets this login may see.

export interface ClientOutlet {
  id: string;
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  company_id: string | null;
}

export interface ClientCompany {
  id: string;
  name: string | null;
  display_name: string | null;
  code: string | null;
  type: string | null;
  has_logo: boolean;
}

export interface ClientMe {
  user: { id: number | string; name: string | null; email: string | null; phone: string | null };
  /** "company" = company head (every outlet); "sites" = outlet login (only its own outlets). */
  access: 'company' | 'sites';
  companies: ClientCompany[];
  outlets: ClientOutlet[];
}

export interface DashboardKpis {
  jobs_in_period: number;
  active_jobs: number;
  in_progress_jobs: number;
  completed_jobs: number;
  visits_total: number;
  upcoming_visits: number;
  visits_done: number;
  visits_missed: number;
  visits_in_progress: number;
  complaints_raised: number;
  open_complaints: number;
  requests_sent: number;
  pending_invoices: number;
  overdue_invoices: number;
  pending_amount: number;
  high_risk_outlets: number;
  pending_requests: number;
  latest_request_at: string | null;
}

export interface UpcomingVisit {
  id: string;
  job_id: string;
  scheduled_date: string;
  visit_number: number | null;
  job_code: string | null;
  service_type: string | null;
  site_id: string | null;
  site_name: string | null;
}

export interface ActivityItem {
  id: number | string;
  job_id: string;
  message: string;
  created_at: string;
  job_code: string | null;
  service_type: string | null;
  site_name: string | null;
}

export interface TrendPoint {
  bucket: string;
  completed: number;
  missed: number;
}

export interface OutletSummary {
  id: string;
  name: string | null;
  city: string | null;
  active_jobs: number;
  completed_jobs: number;
  last_visit: string | null;
  next_visit: string | null;
  open_complaints: number;
  audit_risk: string | null;
}

export interface ClientDashboard {
  range: { from: string; to: string };
  site_id: string | null;
  granularity: 'day' | 'week' | 'month';
  kpis: DashboardKpis;
  upcoming_visits: UpcomingVisit[];
  activity: ActivityItem[];
  trend: TrendPoint[];
  outlets: OutletSummary[];
}

export async function getClientMe(): Promise<ClientMe> {
  const { data } = await httpClient.get<ClientMe>('/api/client-portal/me');
  return data;
}

export async function getClientDashboard(params: { from: string; to: string; siteId?: string }): Promise<ClientDashboard> {
  const { data } = await httpClient.get<ClientDashboard>('/api/client-portal/dashboard', {
    params: { from: params.from, to: params.to, ...(params.siteId ? { site_id: params.siteId } : {}) },
  });
  return data;
}

// ---------- Jobs & visits ----------

export type JobStatusFilter = '' | 'active' | 'scheduled' | 'in_progress' | 'completed';
export type VisitStatusFilter = 'upcoming' | 'in_progress' | 'completed' | 'missed' | 'all';

export interface ClientJob {
  id: string;
  code: string | null;
  service_type: string | null;
  sub_service: string | null;
  status: string;
  start_date: string | null;
  due_date: string | null;
  created_at: string;
  completed_at: string | null;
  site_id: string | null;
  site_name: string | null;
  visits_total: number;
  visits_done: number;
  next_visit: string | null;
  last_visit: string | null;
}

export interface ClientVisit {
  id: string;
  job_id: string;
  visit_number: number | null;
  scheduled_date: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  job_code: string | null;
  service_type: string | null;
  sub_service: string | null;
  site_id: string | null;
  site_name: string | null;
  technicians: string[];
}

export interface JobListResponse {
  page: number;
  page_size: number;
  total: number;
  counts: { all: number; active: number; scheduled: number; in_progress: number; completed: number };
  services: string[];
  jobs: ClientJob[];
}

export interface VisitListResponse {
  page: number;
  page_size: number;
  total: number;
  counts: { upcoming: number; in_progress: number; completed: number; missed: number; all: number };
  visits: ClientVisit[];
}

interface ListParams {
  page?: number;
  siteId?: string;
  from?: string;
  to?: string;
}

const clean = (o: Record<string, string | number | undefined>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== ''));

export async function listJobs(p: ListParams & { status?: JobStatusFilter; service?: string; search?: string }): Promise<JobListResponse> {
  const { data } = await httpClient.get<JobListResponse>('/api/client-portal/jobs', {
    params: clean({ page: p.page ?? 1, page_size: 20, status: p.status, site_id: p.siteId, service: p.service, search: p.search, from: p.from, to: p.to }),
  });
  return data;
}

export async function listVisits(p: ListParams & { status?: VisitStatusFilter }): Promise<VisitListResponse> {
  const { data } = await httpClient.get<VisitListResponse>('/api/client-portal/visits', {
    params: clean({ page: p.page ?? 1, page_size: 20, status: p.status, site_id: p.siteId, from: p.from, to: p.to }),
  });
  return data;
}

export interface JobAttachment {
  id: string | number;
  type: string | null;
  file_name: string | null;
  file_type: string | null;
}

export interface JobTimelineEntry {
  id: string | number;
  action: string;
  message: string | null;
  created_at: string;
  visit_id: string | null;
  attachments: JobAttachment[];
}

export interface ClientJobDetail {
  job: {
    id: string;
    code: string | null;
    service_type: string | null;
    sub_service: string | null;
    status: string;
    priority: string | null;
    start_date: string | null;
    due_date: string | null;
    created_at: string;
    completed_at: string | null;
    address: string | null;
    site_id: string | null;
    site_name: string | null;
    site_address: string | null;
  };
  visits: { id: string; visit_number: number | null; scheduled_date: string; status: string; started_at: string | null; completed_at: string | null; technicians: string[] }[];
  timeline: JobTimelineEntry[];
}

export async function getJob(jobId: string): Promise<ClientJobDetail> {
  const { data } = await httpClient.get<ClientJobDetail>(`/api/client-portal/jobs/${encodeURIComponent(jobId)}`);
  return data;
}

/** Path of a job photo (streams only with the login token). */
export const jobAttachmentPath = (id: string | number) => `/api/client-portal/attachments/${encodeURIComponent(String(id))}`;

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

// ---------- Complaints ----------

export type ComplaintStatusFilter = 'open' | 'resolved' | 'all';
export type ComplaintPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface ClientComplaint {
  id: string;
  subject: string;
  status: string;
  priority: ComplaintPriority | null;
  created_at: string;
  updated_at: string | null;
  raised_by_name: string | null;
  site_id: string | null;
  site_name: string | null;
  message_count: number;
  last_message_at: string | null;
  job_code: string | null;
  /** Our team wrote the last message. */
  awaiting_you: boolean;
}

export interface ComplaintListResponse {
  page: number;
  page_size: number;
  total: number;
  counts: { all: number; open: number; resolved: number };
  complaints: ClientComplaint[];
}

export interface ComplaintMessage {
  id: string;
  message: string;
  created_at: string;
  mine: boolean;
  from_team: boolean;
  author: string | null;
  attachments: { id: string | number; file_name: string; file_type: string }[];
}

export interface ClientComplaintDetail {
  complaint: {
    id: string;
    subject: string;
    status: string;
    priority: ComplaintPriority | null;
    created_at: string;
    updated_at: string | null;
    site_id: string | null;
    site_name: string | null;
    raised_by_me: boolean;
  };
  jobs: { id: string; code: string | null; service_type: string | null; sub_service: string | null; site_id: string | null; site_name: string | null }[];
  messages: ComplaintMessage[];
}

/** A photo / PDF picked on the phone (same shape as the Helpdesk picker). */
export interface UploadFile {
  uri: string;
  name: string;
  type: string;
}

const appendUploads = (form: FormData, files: UploadFile[]) =>
  // React Native's FormData streams this {uri,name,type} shape from the uri (see api/jobs.ts).
  files.forEach((f) => form.append('files', { uri: f.uri, name: f.name, type: f.type } as unknown as Blob));

export async function listComplaints(p: { page?: number; siteId?: string; status?: ComplaintStatusFilter; search?: string }): Promise<ComplaintListResponse> {
  const { data } = await httpClient.get<ComplaintListResponse>('/api/client-portal/complaints', {
    params: clean({ page: p.page ?? 1, page_size: 20, site_id: p.siteId, status: p.status === 'all' ? undefined : p.status, search: p.search }),
  });
  return data;
}

export async function createComplaint(input: {
  subject: string;
  message: string;
  priority: ComplaintPriority;
  siteId: string;
  jobId?: string;
  files: UploadFile[];
}): Promise<{ id: string; warning: string | null }> {
  const form = new FormData();
  form.append('subject', input.subject);
  form.append('message', input.message);
  form.append('priority', input.priority);
  form.append('site_id', input.siteId);
  if (input.jobId) form.append('job_id', input.jobId);
  appendUploads(form, input.files);
  const { data } = await httpClient.post('/api/client-portal/complaints', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
  });
  return data;
}

export async function getComplaint(id: string): Promise<ClientComplaintDetail> {
  const { data } = await httpClient.get<ClientComplaintDetail>(`/api/client-portal/complaints/${encodeURIComponent(id)}`);
  return data;
}

export async function replyToComplaint(id: string, input: { message: string; files: UploadFile[] }): Promise<{ id: string; reopened: boolean; warning: string | null }> {
  const form = new FormData();
  form.append('message', input.message);
  appendUploads(form, input.files);
  const { data } = await httpClient.post(`/api/client-portal/complaints/${encodeURIComponent(id)}/messages`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
  });
  return data;
}

export async function setComplaintStatus(id: string, status: 'CLOSED' | 'OPEN'): Promise<void> {
  await httpClient.patch(`/api/client-portal/complaints/${encodeURIComponent(id)}/status`, { status });
}

export const complaintFilePath = (id: string | number) => `/api/client-portal/complaint-files/${encodeURIComponent(String(id))}`;

// ---------- Service requests ----------

export type RequestType = 'PEST' | 'DEEP' | 'BOTH';
export type RequestSlot = 'ANY' | 'MORNING' | 'AFTERNOON' | 'EVENING';

export interface ServiceRequest {
  id: string;
  site_id: string;
  site_name: string | null;
  service_type: RequestType;
  sub_services: string[];
  preferred_date: string | null;
  preferred_slot: RequestSlot | null;
  notes: string | null;
  /** NEW (waiting) · ASSIGNED (scheduled) · REJECTED · CANCELLED */
  status: string;
  staff_note: string | null;
  created_at: string;
  handled_at: string | null;
  requested_by_name: string | null;
  jobs: { id: string; code: string | null; sub_service: string | null; status: string }[];
}

export async function listServiceRequests(siteId?: string): Promise<{ counts: { open: number; done: number; all: number }; requests: ServiceRequest[] }> {
  const { data } = await httpClient.get('/api/client-portal/service-requests', { params: clean({ site_id: siteId }) });
  return data;
}

export async function createServiceRequest(input: {
  siteId: string;
  type: RequestType;
  subServices: string[];
  preferredDate?: string;
  slot: RequestSlot;
  notes?: string;
}): Promise<{ id: string }> {
  const { data } = await httpClient.post('/api/client-portal/service-requests', {
    site_id: input.siteId,
    service_type: input.type,
    sub_services: input.subServices,
    preferred_date: input.preferredDate || null,
    preferred_slot: input.slot,
    notes: input.notes || '',
  });
  return data;
}

export async function cancelServiceRequest(id: string): Promise<void> {
  await httpClient.patch(`/api/client-portal/service-requests/${encodeURIComponent(id)}/cancel`);
}

// ---------- Outlets ----------

export interface OutletListItem extends OutletSummary {
  address: string | null;
  total_jobs: number;
  services: string[];
  audit_date: string | null;
}

export async function listOutlets(): Promise<OutletListItem[]> {
  const { data } = await httpClient.get<{ outlets: OutletListItem[] }>('/api/client-portal/outlets');
  return data.outlets;
}

export interface OutletDetail {
  outlet: {
    id: string;
    name: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
    latitude: number | null;
    longitude: number | null;
    formatted_address: string | null;
    branch_name: string | null;
  };
  stats: {
    total_jobs: number;
    active_jobs: number;
    completed_jobs: number;
    visits_done: number;
    last_visit: string | null;
    next_visit: string | null;
    open_complaints: number;
    audit_risk: string | null;
    audit_date: string | null;
  };
  services: { service_type: string | null; jobs: number; active_jobs: number; last_done: string | null; next_due: string | null }[];
  upcoming_visits: { id: string; job_id: string; visit_number: number | null; scheduled_date: string; status: string; job_code: string | null; service_type: string | null }[];
  recent_visits: { id: string; job_id: string; visit_number: number | null; scheduled_date: string; completed_at: string | null; status: string; job_code: string | null; service_type: string | null }[];
  recent_jobs: { id: string; code: string | null; service_type: string | null; sub_service: string | null; status: string; created_at: string; completed_at: string | null; due_date: string | null }[];
  complaints: { id: string; subject: string; status: string; priority: string | null; created_at: string; updated_at: string | null }[];
  audits: { id: string; audit_number: string | null; audit_date: string; audit_type: string | null; risk: string | null }[];
  contacts: { id: string; name: string; role: string | null; phone: string | null; email: string | null; is_primary: boolean }[];
}

export async function getOutlet(siteId: string): Promise<OutletDetail> {
  const { data } = await httpClient.get<OutletDetail>(`/api/client-portal/outlets/${encodeURIComponent(siteId)}`);
  return data;
}

// ---------- Documents & audit reports ----------

export type DocKind = 'shared' | 'invoice' | 'audit' | 'photos';

export interface ClientDocument {
  key: string;
  kind: DocKind;
  id: string;
  title: string;
  date: string | null;
  site_name: string | null;
  /** /api/client-portal/... file address, or null when there is no file to open. */
  download: string | null;
  // shared
  doc_type?: string | null;
  file_name?: string | null;
  file_type?: string | null;
  size_bytes?: number | null;
  valid_until?: string | null;
  notes?: string | null;
  // invoice
  status?: string;
  amount?: number;
  paid?: number;
  pending?: number;
  due_date?: string | null;
  // audit
  risk?: string | null;
  audit_type?: string | null;
  audit_number?: string | null;
  auditor?: string | null;
  page_count?: number | null;
  // photos
  service_type?: string | null;
  sub_service?: string | null;
  photos?: number;
}

export interface DocumentListResponse {
  page: number;
  page_size: number;
  total: number;
  counts: { all: number; shared: number; invoice: number; audit: number; photos: number };
  expiring_soon: number;
  documents: ClientDocument[];
}

export async function listDocuments(p: { page?: number; siteId?: string; kind?: DocKind | ''; search?: string }): Promise<DocumentListResponse> {
  const { data } = await httpClient.get<DocumentListResponse>('/api/client-portal/documents', {
    params: clean({ page: p.page ?? 1, page_size: 30, site_id: p.siteId, kind: p.kind, search: p.search }),
  });
  return data;
}

// ---------- Notifications (GET/PATCH/POST /api/notifications) ----------

export interface ClientNotification {
  id: string;
  type: string | null;
  title: string;
  message: string | null;
  entity_type: string | null;
  entity_id: string | null;
  is_read: boolean;
  created_at: string;
}

/** The signed-in user's latest notifications (newest first). */
export async function listNotifications(limit = 50): Promise<ClientNotification[]> {
  const { data } = await httpClient.get<ClientNotification[]>('/api/notifications', { params: { limit } });
  return data;
}

export async function getUnreadNotificationCount(): Promise<number> {
  const { data } = await httpClient.get<{ count: number }>('/api/notifications/unread-count');
  return Number(data?.count) || 0;
}

export async function markNotificationRead(id: string): Promise<void> {
  await httpClient.patch(`/api/notifications/${id}/read`);
}

export async function markAllNotificationsRead(): Promise<void> {
  await httpClient.post('/api/notifications/read-all');
}

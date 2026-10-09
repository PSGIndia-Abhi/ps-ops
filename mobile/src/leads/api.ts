import { httpClient } from '../api/httpClient';
import type {
  CallOutcome,
  Conversion,
  Coords,
  HomeSummary,
  LocalFile,
  LeadTask,
  Meeting,
  MeetingType,
  NamedOption,
  NewCommercialLead,
  Performance,
  Person,
  PipelineLead,
  PipelineStage,
  Qualification,
  Quotation,
  TimelineEntry,
} from './types';

/**
 * Lead Management API. Contracts match backend/src/routes/crm.routes.js and
 * crm-lead-*.routes.js (verified against source). Note the backend's own
 * naming is mixed - lead rows are snake_case, the meeting / follow-up bodies
 * are camelCase - so each call below spells its fields exactly as that route
 * reads them.
 *
 * Several write endpoints answer with a raw table row rather than the lead
 * shape GET returns, so screens re-read the lead after a change instead of
 * trusting the write's response.
 */

type Row = Record<string, unknown>;
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const idOrNull = (v: unknown) => (v === null || v === undefined || v === '' ? null : String(v));

function toLead(row: Row): PipelineLead {
  return {
    id: str(row.id),
    leadNumber: idOrNull(row.lead_number),
    companyName: str(row.company_name) || str(row.customer_name),
    contactPerson: str(row.customer_name),
    phone: str(row.phone),
    alternatePhone: str(row.alternate_phone),
    email: str(row.email),
    address: str(row.location),
    source: idOrNull(row.lead_source),
    amount: Number(row.amount) || 0,
    notes: str(row.notes),
    // A lead from before the pipeline existed has no stage yet - it is new.
    stage: (row.pipeline_stage as PipelineStage | null) ?? 'NEW',
    providerId: idOrNull(row.provider_id),
    createdById: idOrNull(row.created_by_user_id),
    telecallerId: idOrNull(row.assigned_telecaller_id),
    salesEmployeeId: idOrNull(row.assigned_sales_employee_id),
    createdAt: str(row.created_at),
  };
}

function toCoords(lat: unknown, lng: unknown): Coords | null {
  if (lat === null || lat === undefined || lng === null || lng === undefined) return null;
  const point = { lat: Number(lat), lng: Number(lng) };
  return Number.isFinite(point.lat) && Number.isFinite(point.lng) ? point : null;
}

function toMeeting(row: Row): Meeting {
  // scheduled_at is the wall-clock 'YYYY-MM-DD HH:MM:SS' exactly as it was typed.
  const [date = '', time = ''] = str(row.scheduled_at).split(' ');
  return {
    id: str(row.id),
    leadId: str(row.lead_id),
    salesEmployeeId: str(row.sales_employee_id),
    date,
    time,
    type: (row.meeting_type as MeetingType) ?? 'SITE_VISIT',
    address: str(row.meeting_address),
    notes: str(row.notes),
    status: row.status as Meeting['status'],
    checkInAt: idOrNull(row.check_in_at),
    checkOutAt: idOrNull(row.check_out_at),
    checkInCoords: toCoords(row.check_in_lat, row.check_in_lng),
    checkOutCoords: toCoords(row.check_out_lat, row.check_out_lng),
    outcomeNotes: str(row.outcome_notes),
  };
}

// ---- Leads ---------------------------------------------------------------

/** GET /api/crm/leads?lead_type=commercial - already scoped by the server to what this user may see. */
export async function listLeads(): Promise<PipelineLead[]> {
  const { data } = await httpClient.get<Row[]>('/api/crm/leads', { params: { lead_type: 'commercial' } });
  return data.map(toLead);
}

export async function getLead(id: string): Promise<PipelineLead> {
  const { data } = await httpClient.get<Row>(`/api/crm/leads/${id}`);
  return toLead(data);
}

/** POST /api/crm/leads (commercial). `clientRef` makes a retry return the same lead instead of a duplicate. */
export async function createLead(input: NewCommercialLead, clientRef: string): Promise<PipelineLead> {
  const { data } = await httpClient.post<Row>('/api/crm/leads', {
    client_ref: clientRef,
    lead_type: 'commercial',
    customer_name: input.contactPerson,
    company_name: input.companyName,
    phone: input.phone,
    alternate_phone: input.alternatePhone,
    email: input.email,
    location: input.address,
    lead_source: input.source,
    amount: input.amount,
    notes: input.requirement,
  });
  return toLead(data);
}

export async function getTimeline(id: string): Promise<TimelineEntry[]> {
  const { data } = await httpClient.get<Row[]>(`/api/crm/leads/${id}/timeline`);
  return data.map((r) => ({
    id: str(r.id),
    action: str(r.action),
    note: str(r.note),
    at: str(r.changed_at),
    by: str(r.changed_by_name),
  }));
}

const toQuotation = (r: Row): Quotation => ({
  id: str(r.id),
  number: str(r.quotation_number),
  total: Number(r.total_amount) || 0,
  status: str(r.status),
  sentAt: idOrNull(r.sent_at),
  hasPdf: !!r.pdf_object_key,
});

export async function getQuotations(id: string): Promise<Quotation[]> {
  const { data } = await httpClient.get<Row[]>(`/api/crm/leads/${id}/quotations`);
  return data.map(toQuotation);
}

/** A PDF can be several MB on a slow mobile connection - the default 15s is not enough. */
const PDF_UPLOAD_TIMEOUT_MS = 90000;

/**
 * POST /api/crm/leads/:id/quotations as multipart/form-data: the quotation
 * PDF in "file" plus its total. The server stores it already SENT and moves
 * the lead to QUOTATION_SENT.
 */
export async function uploadQuotation(leadId: string, q: { totalAmount: number; notes: string; file: LocalFile }): Promise<Quotation> {
  const form = new FormData();
  form.append('totalAmount', String(q.totalAmount));
  if (q.notes) form.append('notes', q.notes);
  // RN's FormData streams this {uri,name,type} shape from the uri (see api/jobs.ts).
  form.append('file', { uri: q.file.uri, name: q.file.name, type: q.file.type } as unknown as Blob);
  const { data } = await httpClient.post<Row>(`/api/crm/leads/${leadId}/quotations`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: PDF_UPLOAD_TIMEOUT_MS,
  });
  return toQuotation(data);
}

export async function getConversion(id: string): Promise<Conversion> {
  const { data } = await httpClient.get<Row>(`/api/crm/leads/${id}/conversion`);
  return toConversion(data);
}

const toConversion = (r: Row): Conversion => ({
  companyId: str(r.company_id),
  companyName: str(r.company_name),
  convertedBy: str(r.converted_by_name),
  convertedAt: str(r.converted_at),
});

// ---- Lead actions --------------------------------------------------------

/** POST /assign-telecaller with yourself: takes the lead for verification (NEW -> TO_CALL). */
export async function claimLead(id: string, myId: number): Promise<void> {
  await httpClient.post(`/api/crm/leads/${id}/assign-telecaller`, { telecaller_id: myId });
}

/** POST /call-activities - a log entry only; it does not move the lead's stage. */
export async function logCall(
  id: string,
  body: { outcome: CallOutcome; qualificationStatus?: Qualification; comments?: string },
): Promise<void> {
  await httpClient.post(`/api/crm/leads/${id}/call-activities`, body);
}

export async function qualifyLead(id: string, status: 'GENUINE' | 'NEEDS_INFO'): Promise<void> {
  await httpClient.post(`/api/crm/leads/${id}/qualify`, { status });
}

export async function rejectLead(id: string, reason: string, lossReasonId?: number): Promise<void> {
  await httpClient.post(`/api/crm/leads/${id}/reject`, { reason, loss_reason_id: lossReasonId });
}

export async function markLost(id: string, reason: string, lossReasonId?: number): Promise<void> {
  await httpClient.post(`/api/crm/leads/${id}/mark-lost`, { reason, loss_reason_id: lossReasonId });
}

export async function convertLead(id: string, notes: string): Promise<Conversion> {
  const { data } = await httpClient.post<Row>(`/api/crm/leads/${id}/convert-to-customer`, { notes });
  return toConversion(data);
}

/** POST /follow-ups - creates a LEAD_FOLLOW_UP task in Task Management, assigned to yourself. */
export async function addFollowUp(id: string, body: { date: string; time: string | null; note: string }): Promise<void> {
  await httpClient.post(`/api/crm/leads/${id}/follow-ups`, {
    nextActionDate: body.date,
    nextActionTime: body.time || undefined,
    note: body.note,
  });
}

export async function sendFeedback(id: string, message: string): Promise<void> {
  await httpClient.post(`/api/crm/leads/${id}/feedback`, { message });
}

// ---- Meetings ------------------------------------------------------------

export interface NewMeeting {
  salesEmployeeId: number;
  date: string;
  time: string;
  type: MeetingType;
  address: string;
  notes: string;
}

export async function scheduleMeeting(leadId: string, m: NewMeeting): Promise<Meeting> {
  const { data } = await httpClient.post<Row>(`/api/crm/leads/${leadId}/meetings`, {
    salesEmployeeId: m.salesEmployeeId,
    scheduledAt: `${m.date}T${m.time}`,
    meetingType: m.type,
    meetingAddress: m.address,
    notes: m.notes,
  });
  return toMeeting(data);
}

export async function meetingsToday(): Promise<Meeting[]> {
  const { data } = await httpClient.get<Row[]>('/api/crm/meetings/today');
  return data.map(toMeeting);
}

export async function meetingsUpcoming(): Promise<Meeting[]> {
  const { data } = await httpClient.get<Row[]>('/api/crm/meetings/upcoming');
  return data.map(toMeeting);
}

export async function getMeeting(id: string): Promise<Meeting> {
  const { data } = await httpClient.get<Row>(`/api/crm/meetings/${id}`);
  return toMeeting(data);
}

/** POST /check-in. Coordinates are optional: the visit still starts if the phone has no location. */
export async function checkIn(id: string, coords: Coords | null): Promise<Meeting> {
  const { data } = await httpClient.post<Row>(`/api/crm/meetings/${id}/check-in`, coords ?? {});
  return toMeeting(data);
}

export async function completeMeeting(
  id: string,
  outcomeNotes: string,
  coords: Coords | null,
): Promise<Meeting> {
  const { data } = await httpClient.post<Row>(`/api/crm/meetings/${id}/complete`, {
    outcomeNotes,
    ...(coords ? { checkOutLat: coords.lat, checkOutLng: coords.lng } : {}),
  });
  return toMeeting(data);
}

export async function rescheduleMeeting(id: string, date: string, time: string): Promise<Meeting> {
  const { data } = await httpClient.patch<Row>(`/api/crm/meetings/${id}/reschedule`, { scheduledAt: `${date}T${time}` });
  return toMeeting(data);
}

export async function cancelMeeting(id: string, reason: string): Promise<Meeting> {
  const { data } = await httpClient.post<Row>(`/api/crm/meetings/${id}/cancel`, { reason });
  return toMeeting(data);
}

// ---- Home, tasks, reports, master data ------------------------------------

export async function myTasksToday(): Promise<LeadTask[]> {
  const { data } = await httpClient.get<Row[]>('/api/crm/my-tasks/today');
  return data.map((r) => ({
    id: str(r.id),
    title: str(r.title),
    description: str(r.description),
    taskType: str(r.task_type),
    dueTime: idOrNull(r.due_time),
    leadId: idOrNull(r.lead_id),
    leadNumber: idOrNull(r.lead_number),
    companyName: str(r.company_name) || str(r.customer_name),
  }));
}

export async function homeSummary(): Promise<HomeSummary> {
  const { data } = await httpClient.get<HomeSummary>('/api/crm/mobile/home-summary');
  return data;
}

/** GET /reports/sales-performance. No employeeId = your own numbers. */
export async function performance(from: string, to: string, employeeId?: number): Promise<Performance> {
  const { data } = await httpClient.get<Performance>('/api/crm/reports/sales-performance', {
    params: { from, to, employeeId },
  });
  return data;
}

/** GET /api/crm/sales-employees - who a meeting can be assigned to. */
export async function salesEmployees(): Promise<Person[]> {
  const { data } = await httpClient.get<Row[]>('/api/crm/sales-employees');
  return data.map((r) => ({ id: Number(r.id), name: str(r.name), role: str(r.role) }));
}

export async function lossReasons(): Promise<NamedOption[]> {
  const { data } = await httpClient.get<NamedOption[]>('/api/crm/lead-loss-reasons');
  return data;
}

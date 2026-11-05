/**
 * Customer Feedback - the shapes the /api/feedback endpoints send (backend
 * src/services/feedback.service.js). The backend is the source of truth for every rule.
 */

/** TICKET_OPEN: a done call whose ticket is not closed yet (as the list and the call show it). */
export type CallStatus = 'TO_CALL' | 'NOT_ANSWERED' | 'FORM_SENT' | 'FORM_RECEIVED' | 'DONE' | 'TICKET_OPEN';
export type CallOutcome = 'ANSWERED' | 'NO_ANSWER' | 'BUSY' | 'WRONG_NUMBER';
export type Priority = 'HIGH' | 'MEDIUM' | 'LOW';
export type TicketStatus = 'ACTION_PENDING' | 'CLOSED';
export type TicketAction = 'RESOLVED_ON_CALL' | 'SCHEDULE_REVISIT' | 'ESCALATE_OPERATIONS' | 'OTHER';

export interface Person {
  id: number;
  name: string | null;
}

/** One row of the call list: a site with services in the month (one call per site per month). */
export interface CallRow {
  month: string;
  request_id: string | null;
  status: CallStatus;
  result: string | null;
  customer: { id: string; name: string };
  site: { id: string; name: string; city: string | null };
  visit_count: number;
  last_visit_date: string | null;
  services: string | null;
  collector: Person | null;
  next_call_at: string | null;
}

export interface CallList {
  month: string;
  total: number;
  status_counts: Record<string, number>;
  sites: CallRow[];
}

export interface Contact {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  role: string | null;
  is_primary: boolean;
}

export interface Visit {
  id: string;
  job_code: string;
  status: string;
  date: string | null;
  service: string | null;
  technicians: string | null;
}

export interface Response {
  question_id: number;
  question: string;
  option_id: number;
  answer: string;
  is_bad: boolean;
  suggested_priority: Priority | null;
}

export interface Submission {
  id: string;
  source: 'CALL' | 'FORM';
  contact_id: string | null;
  spoke_with_name: string | null;
  other_feedback: string | null;
  has_issue: boolean;
  submitted_at: string;
  collected_by: Person | null;
  is_latest: boolean;
  responses: Response[];
}

export interface CallTicket {
  id: string;
  ticket_number: string;
  status: TicketStatus;
  priority: Priority;
  action: TicketAction;
  issue_summary: string | null;
  created_at: string;
  has_revisit: boolean;
  /** The re-visit is completed: call the customer back with the same questions. */
  follow_up_due: boolean;
}

export interface HistoryItem {
  id: number;
  ticket_id: string | null;
  event: string;
  to_status: string | null;
  note: string | null;
  created_at: string;
  changed_by: Person | null;
}

export interface Call {
  id: string;
  month: string;
  status: CallStatus;
  /** DONE while a ticket is open shows as TICKET_OPEN. */
  display_status?: CallStatus;
  result: string | null;
  customer: { id: string; name: string };
  site: { id: string; name: string; city: string | null; address: string | null };
  collector: Person | null;
  next_call_at: string | null;
  done_at: string | null;
  calls_summary: { total: number; missed: number };
  contacts: Contact[];
  visits: Visit[];
  call_attempts: { id: number; contact_name: string | null; phone: string; outcome: CallOutcome; called_at: string }[];
  submissions: Submission[];
  tickets: CallTicket[];
  history: HistoryItem[];
}

export interface QuestionOption {
  id: number;
  label: string;
  is_bad: boolean;
  suggested_priority: Priority | null;
}

export interface Question {
  id: number;
  question_text: string;
  /** GENERAL = asked on every feedback; SERVICE = asked when the site had one of `services` that month. */
  question_type?: 'GENERAL' | 'SERVICE';
  services?: string[];
  is_required: boolean;
  options: QuestionOption[];
}

export interface Revisit {
  id: string;
  job_code: string;
  status: string;
  date: string | null;
  completed_at: string | null;
  technicians: string | null;
  services: string | null;
}

export interface Ticket {
  id: string;
  ticket_number: string;
  request_id: string;
  month: string;
  status: TicketStatus;
  priority: Priority;
  action: TicketAction;
  action_note: string | null;
  issue_summary: string | null;
  customer: { id: string; name: string };
  site: { id: string; name: string; city: string | null };
  service_label: string | null;
  technician: Person | null;
  revisit: Revisit | null;
  raised_by: Person | null;
  closed_at: string | null;
  close_note: string | null;
  created_at: string;
  /** On GET /tickets/:id only. */
  feedback?: Submission | null;
  contacts?: Contact[];
  history?: HistoryItem[];
}

/** A customer email template (Masters > Email templates): THANK_YOU, ISSUE_RECEIVED, ISSUE_RESOLVED. */
export interface EmailTemplate {
  code: string;
  subject: string;
  body: string;
  is_active: boolean;
}

/** The answers and who gave them - the body of saving feedback and of the follow-up call. */
export interface FeedbackBody {
  contact_id?: string;
  spoke_with_name: string;
  responses: { question_id: number; option_id: number }[];
  other_feedback: string | null;
  started_at: string | null;
  /** Which questions were asked: GENERAL, SERVICE or BOTH. */
  question_mode?: string;
}

export interface NewTicket {
  issue_summary: string | null;
  visit_id: string | null;
  priority: Priority;
  action: TicketAction;
  action_due_at: string | null;
  action_note: string | null;
}

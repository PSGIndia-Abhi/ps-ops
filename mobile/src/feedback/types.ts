/**
 * Customer Feedback - the shapes the /api/feedback endpoints send (backend
 * src/services/feedback.service.js). The backend is the source of truth for every rule.
 */

/** TICKET_OPEN: a done call whose ticket is not closed yet (as the list and the call show it). */
export type CallStatus = 'TO_CALL' | 'NOT_ANSWERED' | 'WRONG_NUMBER' | 'FORM_SENT' | 'FORM_RECEIVED' | 'DONE' | 'TICKET_OPEN';
export type CallOutcome = 'ANSWERED' | 'NO_ANSWER' | 'BUSY' | 'WRONG_NUMBER';
export type Priority = 'VERY_HIGH' | 'HIGH' | 'MEDIUM' | 'LOW';
export type TicketStatus = 'ACTION_PENDING' | 'CLOSED';
export type TicketAction = 'RESOLVED_ON_CALL' | 'SCHEDULE_REVISIT' | 'SITE_AUDIT' | 'SUPERVISOR_VISIT' | 'SALES' | 'ESCALATE_OPERATIONS' | 'OTHER';

/** Someone a Site audit / Supervisor visit / Sales step can be assigned to (GET /people). */
export interface AssignablePerson {
  id: number;
  name: string;
  role: string | null;
}

export interface Person {
  id: number;
  name: string | null;
}

/** One row of the call list: a site with services in the month (one call per site per month). */
/** One call on the list (made by Masters > Call schedule on its due date). */
export interface CallRow {
  /** When anything last changed on the call (a call made, a number added). */
  last_activity_at?: string | null;
  month: string;
  request_id: string;
  /** The day it is due, and the services it asks about (period_start .. period_end). */
  due_date?: string;
  period_start?: string;
  period_end?: string;
  /** Due before today and not done yet. */
  overdue?: boolean;
  status: CallStatus;
  result: string | null;
  customer: { id: string; name: string };
  site: { id: string; name: string; city: string | null };
  visit_count: number;
  last_visit_date: string | null;
  services: string | null;
  /** No service in the period: the last one before it. */
  earlier_visit?: { date: string; service: string | null } | null;
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

/**
 * A department's key. Departments come from the user hierarchy (the admin adds them on the web,
 * Masters > Questions > Department). OPERATIONS = service issue (re-visit); every other department
 * gets an issue + priority (+ invoices when with_invoices) and marks its part done.
 */
export type DepartmentKind = string;

/** A department tickets go to. */
export interface Department {
  kind: DepartmentKind;
  label: string;
  name: string;
  org_unit_id: string;
  with_invoices?: boolean;
  is_operations?: boolean;
}

/** One issue of a department (Feedback Desk > Issues). is_service = Operations' "Services": picks the month's services. */
export interface IssueType {
  id: number;
  department: DepartmentKind;
  name: string;
  is_service: boolean;
}

/** An issue ticked on a ticket part, with its typed details. */
export interface PickedIssue {
  id: number | 'OTHER';
  name: string;
  text: string | null;
  is_service: boolean;
}

export interface Invoice {
  id: string;
  number: string;
  date: string | null;
  amount: number;
  pending: number;
  status: string;
}

/** A ticket's department part. Every department but Operations has its own issue, priority (and invoices); its team marks it done. */
export interface TicketPart {
  id: string;
  kind: DepartmentKind;
  label: string;
  with_invoices?: boolean;
  issues?: PickedIssue[];
  issue_summary: string | null;
  priority: Priority | null;
  invoices: Invoice[];
  status: 'PENDING' | 'DONE';
  done_by: Person | null;
  done_at: string | null;
  done_note: string | null;
  /** Optional: the customer's answers about this department's finished work. */
  customer_feedback?: Submission | null;
  /** The file the department attached when it marked its part done. */
  attachment?: { name: string; type: string | null } | null;
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
  /** Every department finished (re-visit completed, Accounts done): call the customer back. */
  follow_up_due: boolean;
  parts?: TicketPart[];
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
  due_date?: string;
  period_start?: string;
  period_end?: string;
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
  /** No service in the call's period: the site's last service before it. */
  earlier_visit?: Visit | null;
  call_attempts: { id: number; contact_id: string | null; contact_name: string | null; phone: string; outcome: CallOutcome; called_at: string }[];
  submissions: Submission[];
  tickets: CallTicket[];
  history: HistoryItem[];
  /** Requests to the service coordinator for the right number (after a wrong number), newest first. */
  number_requests?: NumberRequest[];
}

export interface NumberRequest {
  id: string;
  status: 'OPEN' | 'DONE' | 'CANCELLED';
  wrong: { contact_id: string | null; name: string | null; phone: string | null };
  note: string | null;
  requested_at: string;
  resolved_by: Person | null;
  resolved_at: string | null;
  right: { contact_id: string | null; name: string; phone: string } | null;
  resolve_note: string | null;
}

/** A request on the Requests tab: the request plus its call, site and customer. */
export interface NumberRequestRow extends NumberRequest {
  call_id: string;
  call_status: CallStatus;
  due_date: string | null;
  customer: { id: string; name: string };
  site: { id: string; name: string; city: string | null };
  requested_by: Person | null;
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
  question_type?: 'GENERAL' | 'SERVICE' | 'DEPARTMENT';
  services?: string[];
  departments?: string[];
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
  /** Site audit / Supervisor visit / Sales: the person it is assigned to, and when they marked it done. */
  action_owner?: Person | null;
  action_done?: { by: Person | null; at: string; note: string | null } | null;
  issue_summary: string | null;
  customer: { id: string; name: string };
  site: { id: string; name: string; city: string | null };
  service_label: string | null;
  technician: Person | null;
  revisit: Revisit | null;
  raised_by: Person | null;
  /** Changes with every save (closing needs the latest). */
  row_version?: number;
  closed_at: string | null;
  close_note: string | null;
  created_at: string;
  /** The departments it went to (a department member sees only their own part). */
  parts?: TicketPart[];
  /** Every department finished: the collector calls the customer back. */
  follow_up_due?: boolean;
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
  /** Which questions were asked: GENERAL, SERVICE, BOTH or DEPARTMENT (+ question_department). */
  question_mode?: string;
  question_department?: string;
  /** New feedback on a call already done (a new complaint). */
  new_round?: boolean;
}

export interface NewTicket {
  /** The departments it goes to; left out = Operations. */
  departments?: DepartmentKind[];
  /** Each other department's part, by key. */
  parts?: Record<string, { issue_summary?: string; priority?: Priority; invoice_ids?: string[]; issues: { id: number | 'OTHER'; text: string | null }[] }>;
  issue_summary: string | null;
  visit_id: string | null;
  priority: Priority;
  action: TicketAction;
  action_due_at: string | null;
  action_note: string | null;
  /** Site audit / Supervisor visit / Sales: the supervisor / salesperson. */
  action_owner_user_id?: number;
}

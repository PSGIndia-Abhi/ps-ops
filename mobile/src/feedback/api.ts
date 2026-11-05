import { httpClient } from '../api/httpClient';
import type { AssignablePerson, Call, CallList, CallOutcome, Contact, Department, DepartmentKind, EmailTemplate, FeedbackBody, Invoice, IssueType, NewTicket, Question, Ticket } from './types';

/**
 * Customer Feedback data access - the same /api/feedback endpoints the web Feedback Desk uses
 * (frontend/src/pages/feedback/feedbackApi.js). The backend checks every permission and rule.
 */

/** The signed-in user's FEEDBACK_* permissions ([] = no access to this app). */
export async function getMyAccess(): Promise<string[]> {
  // FEEDBACK_ISSUES (service coordinators: departments and issues) is managed on the website only.
  // FEEDBACK_SCHEDULE (call schedules) too.
  return (await getMyAccessFull()).permissions.filter((p) => p !== 'FEEDBACK_ISSUES' && p !== 'FEEDBACK_SCHEDULE');
}

/**
 * Permissions plus the departments the user works in. FEEDBACK_DEPT = a member of the Operations /
 * Accounts team: they see only their department's tickets.
 */
export async function getMyAccessFull(): Promise<{ permissions: string[]; departments: DepartmentKind[] }> {
  const { data } = await httpClient.get<{ permissions: string[]; departments?: DepartmentKind[] }>('/api/feedback/me');
  return { permissions: data.permissions || [], departments: data.departments || [] };
}

/** The open tickets waiting for this user (their department's part, or the step assigned to them). */
export async function getOpenTicketCount(): Promise<number> {
  const { data } = await httpClient.get<{ open_tickets?: number }>('/api/feedback/badges');
  return Number(data.open_tickets) || 0;
}

/** The departments a ticket can go to (switched on in Masters). */
/** Each department's issues, ticked when raising a ticket. */
export async function getIssueTypes(): Promise<IssueType[]> {
  const { data } = await httpClient.get<{ issue_types: IssueType[] }>('/api/feedback/issue-types');
  return data.issue_types || [];
}

export async function getDepartments(): Promise<Department[]> {
  const { data } = await httpClient.get<{ departments: Department[] }>('/api/feedback/departments');
  return data.departments || [];
}

/** The customer's invoices - for an Accounts issue. */
export async function getCallInvoices(callId: string): Promise<Invoice[]> {
  const { data } = await httpClient.get<{ invoices: Invoice[] }>(`/api/feedback/calls/${callId}/invoices`);
  return data.invoices || [];
}

/** The Accounts team finishes its part of a ticket (note = what was done). */
/** Who a Site audit / Supervisor visit / Sales step can be assigned to. */
export async function getAssignablePeople(): Promise<{ supervisors: AssignablePerson[]; sales: AssignablePerson[] }> {
  const { data } = await httpClient.get<{ supervisors?: AssignablePerson[]; sales?: AssignablePerson[] }>('/api/feedback/people');
  return { supervisors: data.supervisors || [], sales: data.sales || [] };
}

/** After a wrong number: ask the service coordinator for the right one. */
export async function sendNumberRequest(callId: string, note: string | null): Promise<void> {
  await httpClient.post(`/api/feedback/calls/${callId}/number-request`, { note });
}

export async function cancelNumberRequest(id: string): Promise<void> {
  await httpClient.post(`/api/feedback/number-requests/${id}/cancel`, {});
}

/** Closes the ticket without the follow-up call, once every team has finished its work. */
export async function closeTicket(ticketId: string, rowVersion: number, note: string | null): Promise<void> {
  await httpClient.post(`/api/feedback/tickets/${ticketId}/close`, { row_version: rowVersion, close_note: note });
}

/** The assigned supervisor / salesperson marks the Site audit, Supervisor visit or Sales step done. */
export async function markActionDone(ticketId: string, note: string): Promise<void> {
  await httpClient.post(`/api/feedback/tickets/${ticketId}/action-done`, { note });
}

export async function markPartDone(ticketId: string, kind: DepartmentKind, note: string): Promise<void> {
  await httpClient.post(`/api/feedback/tickets/${ticketId}/parts/${kind}/done`, { note });
}

/** due = 'today' (due today + overdue, the default) or 'all'; month = one month's calls; from / to = due dates between. */
export async function listCalls(params: { month?: string; from?: string; to?: string; due?: string; status?: string; q?: string; mine?: boolean }): Promise<CallList> {
  const range = !!(params.from || params.to);
  const { data } = await httpClient.get<CallList>('/api/feedback/calls', {
    params: {
      month: range ? undefined : params.month,
      due: range || params.month ? undefined : params.due,
      from: params.from || undefined,
      to: params.to || undefined,
      status: params.status || undefined,
      q: params.q || undefined,
      mine: params.mine ? '1' : undefined,
      page_size: 100,
    },
  });
  return data;
}

/** Takes a call from the list (Masters > Call schedule made it). */
export async function takeCall(requestId: string): Promise<{ id: string }> {
  const { data } = await httpClient.post<{ id: string }>('/api/feedback/calls', { request_id: requestId });
  return data;
}

export async function getCall(id: string): Promise<Call> {
  const { data } = await httpClient.get<Call>(`/api/feedback/calls/${id}`);
  return data;
}

export async function getQuestions(): Promise<Question[]> {
  const { data } = await httpClient.get<{ questions: Question[] }>('/api/feedback/questions');
  return data.questions;
}

/** Whether the "Other feedback" box is asked (Masters > Settings). */
export async function otherFeedbackEnabled(): Promise<boolean> {
  const { data } = await httpClient.get<{ settings: { other_text_enabled?: boolean } }>('/api/feedback/settings');
  return data.settings?.other_text_enabled !== false;
}

export async function recordAttempt(
  callId: string,
  body: { contact_id?: string; phone?: string; contact_name?: string; outcome: CallOutcome },
): Promise<{ status: string; contact_id: string; offer_form_link: boolean; next_call_at: string | null }> {
  const { data } = await httpClient.post(`/api/feedback/calls/${callId}/attempts`, body);
  return data;
}

/** Saves a new number to the call's site contacts (or finds the site's contact that has it). */
export async function addContact(
  callId: string,
  body: { name: string; phone: string; role?: string | null; email?: string | null },
): Promise<Contact & { created: boolean }> {
  const { data } = await httpClient.post(`/api/feedback/calls/${callId}/contacts`, body);
  return data;
}

/** Corrects a contact of the call's site (a wrong number or name). Phone: 10 digits. */
export async function updateContact(
  callId: string,
  contactId: string,
  body: { name: string; phone: string; role?: string | null; email?: string | null },
): Promise<Contact> {
  const { data } = await httpClient.patch(`/api/feedback/calls/${callId}/contacts/${contactId}`, body);
  return data;
}

/** The customer email templates (Masters > Email templates). */
export async function getEmailTemplates(): Promise<EmailTemplate[]> {
  const { data } = await httpClient.get<{ templates: EmailTemplate[] }>('/api/feedback/email-templates');
  return data.templates || [];
}

/** Saves the call's feedback; with `ticket` it also raises one, with `no_ticket` bad answers need none. */
export async function saveFeedback(
  callId: string,
  body: FeedbackBody & { ticket?: NewTicket; no_ticket?: boolean },
): Promise<{ ticket: { ticket_number: string } | null }> {
  const { data } = await httpClient.post(`/api/feedback/calls/${callId}/feedback`, body);
  return data;
}

/** Raises a ticket on feedback already saved (the customer's form). The call becomes Done. */
export async function raiseTicket(callId: string, body: NewTicket & { submission_id: string }): Promise<{ ticket: { ticket_number: string } }> {
  const { data } = await httpClient.post(`/api/feedback/calls/${callId}/tickets`, body);
  return data;
}

/** Marks the call done: with feedback saved, no note is needed; without, `note` says why. */
export async function finishCall(callId: string, note?: string): Promise<void> {
  await httpClient.post(`/api/feedback/calls/${callId}/done`, note ? { note } : {});
}

/** The call back after a ticket's re-visit, with the same questions. */
export async function recordFollowUp(
  ticketId: string,
  body: FeedbackBody & { close_anyway?: boolean },
): Promise<{ ticket_number: string; resolved: boolean; closed: boolean }> {
  const { data } = await httpClient.post(`/api/feedback/tickets/${ticketId}/follow-up`, body);
  return data;
}

/** Makes the form link and the WhatsApp message for it; returns the wa.me link to open. */
export async function sendFormLink(callId: string, contactId: string): Promise<{ whatsapp?: { wa_me_url: string }; expires_at: string }> {
  const { data } = await httpClient.post(`/api/feedback/calls/${callId}/form-link`, { contact_id: contactId });
  return data;
}

/** Fills a WhatsApp template (THANK_YOU, REVISIT_BOOKED, ISSUE_RESOLVED) for a customer contact. */
export async function prepareWhatsapp(
  callId: string,
  body: { template_code: string; contact_id: string; ticket_id?: string },
): Promise<{ wa_me_url: string }> {
  const { data } = await httpClient.post(`/api/feedback/calls/${callId}/whatsapp`, { recipient_type: 'CUSTOMER', ...body });
  return data;
}

/** The tickets this user can see (a collector: the ones they raised). */
export async function listTickets(status: 'OPEN' | 'CLOSED' | '', department: DepartmentKind | '' = ''): Promise<Ticket[]> {
  const { data } = await httpClient.get<{ tickets: Ticket[] }>('/api/feedback/tickets', {
    params: { status: status === 'OPEN' ? 'ACTION_PENDING' : status || undefined, department: department || undefined, page_size: 100 },
  });
  return data.tickets;
}

export async function getTicket(id: string): Promise<Ticket> {
  const { data } = await httpClient.get<Ticket>(`/api/feedback/tickets/${id}`);
  return data;
}

/** The server's own message for a failed request, else a fallback. */
export function errorText(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const e = err as { response?: { data?: { error?: string } }; message?: string };
  return e?.response?.data?.error || (e?.message && !/status code/i.test(e.message) ? e.message : fallback);
}

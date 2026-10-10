import { httpClient } from '../api/httpClient';
import * as tasksApi from '../tasks/api';
import type { TaskPriority, WorkTask } from '../tasks/types';
import { cleanInvoice, OUTCOMES, recurrenceFor, repeatText, type OutcomeKey } from './format';
import {
  REMINDER_MODULE,
  REMINDER_TYPE,
  isPaymentReminder,
  type Customer,
  type CustomerContactList,
  type Invoice,
  type ReminderSchedule,
  type Repeat,
} from './types';

/**
 * Payment reminder data access - the same endpoints the web Accountant Panel uses
 * (frontend/src/pages/accountant/data.js + followups.js). Everything about a reminder goes
 * through the existing Task Management API; the only payment-specific calls are the invoices
 * and the customer's phone list.
 */

export async function listInvoices(): Promise<Invoice[]> {
  const { data } = await httpClient.get<Record<string, unknown>[]>('/api/invoices');
  return data.map(cleanInvoice);
}

export async function listReminderTasks(): Promise<WorkTask[]> {
  const { data } = await httpClient.get<WorkTask[]>('/api/work-tasks', { params: { task_type: REMINDER_TYPE } });
  return data.filter(isPaymentReminder);
}

/** The repeating payment reminders that are still running. */
export async function listSchedules(): Promise<ReminderSchedule[]> {
  const { data } = await httpClient.get<ReminderSchedule[]>('/api/work-task-series', { params: { status: 'ACTIVE' } });
  return data.filter(isPaymentReminder);
}

/** Stops a reminder from repeating. The reminder itself stays as it is, on its current date. */
export const stopSchedule = (id: string) => tasksApi.stopSeries(id);

export interface CreateReminderInput {
  assignedTo: number;
  customer: Customer;
  /** Set for a reminder about one invoice; left out for the customer's whole outstanding. */
  invoice?: Invoice;
  date: string;
  time: string;
  priority: TaskPriority;
  notes: string;
  repeat: Repeat;
  /** The last date a repeating reminder comes due (optional). */
  endDate?: string;
}

export async function createReminder(input: CreateReminderInput): Promise<void> {
  const { customer, invoice, repeat } = input;
  const source = invoice
    ? { module: REMINDER_MODULE.INVOICE, id: invoice.id }
    : { module: REMINDER_MODULE.CUSTOMER, id: customer.id };
  const repeating = repeat !== 'ONCE';
  if (repeating) {
    // Two schedules for the same customer or invoice would send every reminder twice.
    const running = (await listSchedules()).find((s) => s.source_module === source.module && s.source_id === source.id);
    if (running) {
      throw new Error(
        `${invoice ? invoice.invoice_number : customer.name} already has a repeating reminder (${repeatText(running).replace(/^E/, 'e')}). Stop it first in the Repeating tab.`,
      );
    }
  }
  await httpClient.post('/api/work-tasks', {
    title: `Payment Reminder - ${customer.name}${invoice ? ` (${invoice.invoice_number})` : ''}`.slice(0, 200),
    task_type: REMINDER_TYPE,
    priority: input.priority,
    source_module: source.module,
    source_id: source.id,
    assigned_to: input.assignedTo,
    ...(repeat !== 'ONCE'
      ? { recurrence: recurrenceFor(repeat, input.date, input.time, input.endDate) }
      : { due_date: input.date, due_time: input.time || null }),
    description: input.notes.trim() || null,
  });
}

/** Updates and completing need the task to be in progress: an open one is started first, a paused one resumed. */
export async function ensureInProgress(task: WorkTask): Promise<void> {
  if (task.status === 'OPEN') await tasksApi.startTask(task.id);
  else if (task.status === 'PAUSED') await tasksApi.resumeTask(task.id);
}

/** Saves a call outcome as a progress update, and moves the reminder date if a new one is given. */
export async function recordOutcome(
  task: WorkTask,
  input: { outcome: OutcomeKey; other: string; notes: string; date: string | null; time: string | null },
): Promise<void> {
  const label = input.outcome === 'OTHER' ? input.other.trim() : OUTCOMES.find((o) => o.key === input.outcome)!.label;
  const note = `${label}${input.notes.trim() ? `: ${input.notes.trim()}` : ''}`;
  await ensureInProgress(task);
  await tasksApi.addProgress(task.id, note);
  const moved = !!input.date && (input.date !== task.due_date || (input.time || '') !== (task.due_time || '').slice(0, 5));
  if (moved) await tasksApi.rescheduleTask(task.id, input.date!, input.time || null, note.slice(0, 500));
}

export async function completeReminder(task: WorkTask, note: string): Promise<void> {
  await ensureInProgress(task);
  await tasksApi.completeTask(task.id, note.trim() || undefined);
}

export async function reopenReminder(id: string): Promise<void> {
  await httpClient.post(`/api/work-tasks/${id}/reopen`, {});
}

/** The accountant's own phone list for a customer (kept apart from the admin's Contacts). */
export async function getCustomerContacts(customerId: string): Promise<CustomerContactList> {
  const { data } = await httpClient.get<CustomerContactList>(`/api/invoices/customers/${encodeURIComponent(customerId)}/contact`);
  return data;
}

/** Adds a phone number for the customer. Marking it primary takes the mark off the others. Returns the refreshed list. */
export async function addCustomerContact(
  customerId: string,
  input: { name: string; phone: string; primary: boolean },
): Promise<CustomerContactList> {
  const { data } = await httpClient.post<CustomerContactList>(`/api/invoices/customers/${encodeURIComponent(customerId)}/contacts`, {
    name: input.name.trim(),
    phone: input.phone.trim(),
    is_primary: input.primary,
  });
  return data;
}

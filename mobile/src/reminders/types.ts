import type { SeriesListItem, TaskPriority, TaskStatus, WorkTask } from '../tasks/types';

/**
 * Payment Reminders - the mobile part of the web's Accountant Panel ("Tasks & Reminders").
 * A reminder is an ordinary Task Management task (/api/work-tasks) that points at a customer
 * or an invoice through source_module + source_id; amounts are never stored on the task, they
 * are always read from the invoices (same as frontend/src/pages/accountant/data.js).
 */
export const REMINDER_TYPE = 'Payment Follow-up';
export const REMINDER_MODULE = { CUSTOMER: 'PAYMENT_CUSTOMER', INVOICE: 'PAYMENT_INVOICE' } as const;

export const isPaymentReminder = (x: { source_module?: string | null }) =>
  x.source_module === REMINDER_MODULE.CUSTOMER || x.source_module === REMINDER_MODULE.INVOICE;

export type ReminderScope = 'CUSTOMER' | 'INVOICE';
export type ReminderDisplayStatus = 'COMPLETED' | 'CANCELLED' | 'OVERDUE' | 'TODAY' | 'UPCOMING';
export type Repeat = 'ONCE' | 'DAILY' | 'WEEKLY' | 'MONTHLY';

/** One row of GET /api/invoices, cleaned up (amounts arrive as text, dates as timestamps). */
export interface Invoice {
  id: string;
  invoice_number: string;
  customer_id: string;
  customer_name: string;
  customer_code: string;
  invoice_date: string;
  due_date: string;
  invoice_amount: number;
  paid_amount: number;
  pending_amount: number;
  status: string;
}

/** One customer with an unpaid balance, worked out from the invoices. */
export interface Customer {
  id: string;
  name: string;
  code: string;
  outstanding: number;
  unpaid: Invoice[];
}

export interface Reminder {
  id: string;
  series_id: string;
  scope: ReminderScope;
  customer_id: string;
  customer_name: string;
  invoice_id: string;
  invoice_number: string;
  notes: string;
  priority: TaskPriority;
  status: TaskStatus;
  /** Not finished yet (open, started or paused). */
  active: boolean;
  display_status: ReminderDisplayStatus;
  due_date: string;
  due_time: string;
  completed_at: string;
  /** The work task as the server sent it, for the actions that need it. */
  task: WorkTask;
}

/** A repeating reminder's schedule (GET /api/work-task-series row, which also carries the source). */
export type ReminderSchedule = SeriesListItem & {
  source_module: string | null;
  source_id: string | null;
  end_date: string | null;
};

export interface CustomerContact {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  is_primary: boolean;
}

/** GET /api/invoices/customers/:id/contact - `phone` is the number to call, null when none is saved. */
export interface CustomerContactList {
  name: string | null;
  phone: string | null;
  contacts: CustomerContact[];
}

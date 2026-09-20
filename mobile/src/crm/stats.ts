import type { Lead } from './types';

export interface LeadStats {
  todaysLeads: number;
  paidTotal: number;
  pendingTotal: number;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

/**
 * Dashboard numbers. "Today's leads" counts leads created today; Paid and
 * Payment Pending are running totals across all leads (money received vs.
 * money still to collect).
 */
export function computeLeadStats(leads: Lead[], now: Date = new Date()): LeadStats {
  let todaysLeads = 0;
  let paidTotal = 0;
  let pendingTotal = 0;

  for (const lead of leads) {
    if (sameDay(new Date(lead.createdAt), now)) todaysLeads += 1;
    if (lead.paymentStatus === 'paid') paidTotal += lead.amount;
    else pendingTotal += lead.amount;
  }

  return { todaysLeads, paidTotal, pendingTotal };
}

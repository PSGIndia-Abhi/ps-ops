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

export interface MonthlyAchievements {
  /** Leads created in the current calendar month - consumer and commercial together. */
  monthLeads: number;
  paidLeads: number;
  /** Consumer and commercial together. */
  convertedLeads: number;
  /** Money received from this month's leads, and what those leads are worth in total. */
  collected: number;
  totalValue: number;
  /** collected / totalValue as a whole percent (0 when there are no leads yet). */
  collectedPercent: number;
  /** paid leads / consumer leads as a whole percent (a commercial lead has no payment to be paid). */
  paidPercent: number;
}

function inMonth(lead: Lead, now: Date): boolean {
  const created = new Date(lead.createdAt);
  return created.getFullYear() === now.getFullYear() && created.getMonth() === now.getMonth();
}

/**
 * "This month" numbers for the Home achievements card. `leads` are the consumer leads; commercial
 * leads only add to the lead and converted counts - everything about money stays consumer-only,
 * since a commercial quote is not a payment.
 */
export function computeMonthlyAchievements(
  leads: Lead[],
  now: Date = new Date(),
  commercialLeads: Lead[] = [],
): MonthlyAchievements {
  let monthLeads = 0;
  let paidLeads = 0;
  let convertedLeads = 0;
  let collected = 0;
  let totalValue = 0;

  for (const lead of leads) {
    if (!inMonth(lead, now)) continue;
    monthLeads += 1;
    totalValue += lead.amount;
    if (lead.paymentStatus === 'paid') {
      paidLeads += 1;
      collected += lead.amount;
    }
    if (lead.leadStatus === 'converted') convertedLeads += 1;
  }
  const consumerMonthLeads = monthLeads;

  for (const lead of commercialLeads) {
    if (!inMonth(lead, now)) continue;
    monthLeads += 1;
    if (lead.leadStatus === 'converted') convertedLeads += 1;
  }

  return {
    monthLeads,
    paidLeads,
    convertedLeads,
    collected,
    totalValue,
    collectedPercent: totalValue > 0 ? Math.round((collected / totalValue) * 100) : 0,
    paidPercent: consumerMonthLeads > 0 ? Math.round((paidLeads / consumerMonthLeads) * 100) : 0,
  };
}

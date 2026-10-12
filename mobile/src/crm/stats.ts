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
  /** Leads created in the current calendar month. */
  monthLeads: number;
  paidLeads: number;
  convertedLeads: number;
  /** Money received from this month's leads, and what those leads are worth in total. */
  collected: number;
  totalValue: number;
  /** collected / totalValue as a whole percent (0 when there are no leads yet). */
  collectedPercent: number;
  /** paid leads / leads as a whole percent. */
  paidPercent: number;
}

function inMonth(lead: Lead, now: Date): boolean {
  const created = new Date(lead.createdAt);
  return created.getFullYear() === now.getFullYear() && created.getMonth() === now.getMonth();
}

/** "This month" numbers for the Residential side of the Home achievements card (payments collected). */
export function computeMonthlyAchievements(leads: Lead[], now: Date = new Date()): MonthlyAchievements {
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

  return {
    monthLeads,
    paidLeads,
    convertedLeads,
    collected,
    totalValue,
    collectedPercent: totalValue > 0 ? Math.round((collected / totalValue) * 100) : 0,
    paidPercent: monthLeads > 0 ? Math.round((paidLeads / monthLeads) * 100) : 0,
  };
}

export interface CommercialAchievements {
  /** Commercial leads created in the current calendar month. */
  monthLeads: number;
  convertedLeads: number;
  /** Still at "new" - nobody has followed up yet. */
  newLeads: number;
  /** The approximate quotes of this month's leads, added up. */
  quoted: number;
  /** converted leads / leads as a whole percent (0 when there are no leads yet). */
  convertedPercent: number;
}

/**
 * "This month" numbers for the Commercial side of the Home achievements card. A commercial lead has
 * no payment, so progress here is leads won (converted) and the value quoted, not money collected.
 */
export function computeCommercialAchievements(leads: Lead[], now: Date = new Date()): CommercialAchievements {
  let monthLeads = 0;
  let convertedLeads = 0;
  let newLeads = 0;
  let quoted = 0;

  for (const lead of leads) {
    if (!inMonth(lead, now)) continue;
    monthLeads += 1;
    quoted += lead.amount;
    if (lead.leadStatus === 'converted') convertedLeads += 1;
    else if (lead.leadStatus === 'new') newLeads += 1;
  }

  return {
    monthLeads,
    convertedLeads,
    newLeads,
    quoted,
    convertedPercent: monthLeads > 0 ? Math.round((convertedLeads / monthLeads) * 100) : 0,
  };
}

import { formatINR } from './format';
import type { Lead } from './types';
import { normalizePhone } from './validation';

/** An existing lead with the same 10-digit phone number, if there is one (newest first). */
export function findLeadByPhone(
  leads: Lead[],
  phone: string,
): Lead | undefined {
  const digits = normalizePhone(phone);
  if (digits.length !== 10) return undefined;
  return leads.find(l => normalizePhone(l.phone).slice(-10) === digits);
}

/**
 * Names already used in "Reference By", most-used first. With a query it keeps the ones that
 * contain it (and drops an exact match, since there is nothing left to suggest).
 */
export function suggestReferences(
  leads: Lead[],
  query: string,
  limit = 4,
): string[] {
  const counts = new Map<string, { name: string; n: number }>();
  for (const lead of leads) {
    const name = lead.referenceBy.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const entry = counts.get(key);
    if (entry) entry.n += 1;
    else counts.set(key, { name, n: 1 });
  }
  const q = query.trim().toLowerCase();
  return Array.from(counts.values())
    .filter(
      e =>
        (!q || e.name.toLowerCase().includes(q)) && e.name.toLowerCase() !== q,
    )
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map(e => e.name);
}

/** The WhatsApp message a rep can send once a lead is saved. */
export function confirmationMessage(lead: Lead): string {
  const first = lead.customerName.trim().split(/\s+/)[0] || 'there';
  const lines = [
    `Hello ${first}, thank you for choosing BestServe!`,
    `Your ${lead.service} (${lead.plan}) for ${lead.houseType} is noted.`,
    lead.paymentStatus === 'paid'
      ? `Payment received: ${formatINR(lead.amount)}. Thank you!`
      : `Amount: ${formatINR(lead.amount)}.`,
    'Our team will contact you shortly to schedule your service.',
  ];
  return lines.join('\n');
}

export function whatsappUrl(phone: string, message?: string): string {
  const base = `https://wa.me/91${normalizePhone(phone).slice(-10)}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

/** A client-generated id sent with a lead so a retried save can never create a second lead. */
export function newClientRef(): string {
  const random = () => Math.random().toString(36).slice(2, 10);
  return `APP-${Date.now().toString(36)}-${random()}${random()}`.slice(0, 40);
}

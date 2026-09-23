import { kvGet, kvSet } from './secureKv';
import type { Lead, NewLeadInput } from './types';

const KEY = 'outbox';

/** A lead saved on the phone because there was no connection; sent as soon as there is one. */
export interface OutboxItem {
  /** Sent with the lead so a retry can never create a duplicate on the server. */
  clientRef: string;
  input: NewLeadInput;
  createdAt: string;
  /** Set when the server refused it (bad coupon etc.) - such items are not retried automatically. */
  error?: string;
}

export async function loadOutbox(scope: string): Promise<OutboxItem[]> {
  return (await kvGet<OutboxItem[]>(scope, KEY)) ?? [];
}

export function saveOutbox(scope: string, items: OutboxItem[]): Promise<void> {
  return kvSet(scope, KEY, items);
}

export const LOCAL_ID_PREFIX = 'local-';

/** How a queued item appears in the Leads list until it has been sent. */
export function outboxToLead(item: OutboxItem): Lead {
  return {
    ...item.input,
    id: `${LOCAL_ID_PREFIX}${item.clientRef}`,
    createdAt: item.createdAt,
    // An online payment can only start after the lead reaches the server.
    paymentStatus:
      item.input.paymentMethod === 'online'
        ? 'pending'
        : item.input.paymentStatus,
    pendingSync: true,
    syncError: item.error,
  };
}

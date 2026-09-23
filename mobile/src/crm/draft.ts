import { kvGet, kvRemove, kvSet } from './secureKv';
import type { LeadStatus, PaymentMethod, PaymentStatus } from './types';
import type { LeadFormValues } from './validation';

const KEY = 'leadDraft';

export interface LeadDraft {
  values: LeadFormValues;
  source: string | null;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  leadStatus: LeadStatus;
}

/** True when nothing has been typed or chosen yet - such a draft is not worth keeping or restoring. */
export function isDraftEmpty(draft: LeadDraft): boolean {
  const v = draft.values;
  return !(
    v.customerName.trim() ||
    v.phone.trim() ||
    v.email.trim() ||
    v.houseType ||
    v.service ||
    v.plan ||
    v.location.trim() ||
    v.referenceBy.trim() ||
    v.notes.trim()
  );
}

export const loadDraft = (scope: string) => kvGet<LeadDraft>(scope, KEY);
export const saveDraft = (scope: string, draft: LeadDraft) =>
  kvSet(scope, KEY, draft);
export const clearDraft = (scope: string) => kvRemove(scope, KEY);

const SOURCE_KEY = 'lastLeadSource';
export const loadLastSource = (scope: string) =>
  kvGet<string>(scope, SOURCE_KEY);
export const saveLastSource = (scope: string, source: string) =>
  kvSet(scope, SOURCE_KEY, source);

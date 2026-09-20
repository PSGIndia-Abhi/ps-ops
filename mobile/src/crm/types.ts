export type PaymentMethod = 'cash' | 'online' | 'other';
export type PaymentStatus = 'paid' | 'pending';
export type LeadStatus = 'new' | 'contacted' | 'converted' | 'lost';
export type LeadSource = 'website' | 'apartment' | 'referral' | 'social_media' | 'other';

export interface Lead {
  id: string;
  customerName: string;
  phone: string;
  email: string;
  houseType: string;
  service: string;
  plan: string;
  /** What the customer is actually charged (may differ from the price list if negotiated). */
  amount: number;
  coupon: string;
  location: string;
  source: LeadSource | null;
  /** Who referred this lead (free text). */
  referenceBy: string;
  notes: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  leadStatus: LeadStatus;
  /** ISO timestamp. */
  createdAt: string;
}

export type NewLeadInput = Omit<Lead, 'id' | 'createdAt'>;

export interface Option<T extends string> {
  value: T;
  label: string;
}

export const LEAD_SOURCES: Option<LeadSource>[] = [
  { value: 'website', label: 'Website' },
  { value: 'apartment', label: 'Apartment' },
  { value: 'referral', label: 'Referral' },
  { value: 'social_media', label: 'Social Media' },
  { value: 'other', label: 'Other' },
];

export const PAYMENT_METHODS: Option<PaymentMethod>[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'online', label: 'Online' },
  { value: 'other', label: 'Other' },
];

export const PAYMENT_STATUSES: Option<PaymentStatus>[] = [
  { value: 'paid', label: 'Paid' },
  { value: 'pending', label: 'Payment Pending' },
];

export const LEAD_STATUSES: Option<LeadStatus>[] = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'converted', label: 'Converted' },
  { value: 'lost', label: 'Lost' },
];

export function optionLabel<T extends string>(options: Option<T>[], value: T | null): string {
  return options.find((o) => o.value === value)?.label ?? '';
}

export type PaymentMethod = 'cash' | 'online' | 'other';
export type PaymentStatus = 'paid' | 'pending';
export type LeadStatus = 'new' | 'contacted' | 'converted' | 'lost';
export type LeadSource = 'website' | 'apartment' | 'referral' | 'social_media' | 'google' | 'other';
/** Consumer = a household service with a payment. Commercial = a business enquiry with a quote and photos, no payment. */
export type LeadType = 'consumer' | 'commercial';

/** A photo picked on this phone that has not reached the server yet. */
export interface LocalLeadPhoto {
  /** Sent with the upload so a retry can never store the same photo twice. */
  ref: string;
  uri: string;
  name: string;
  type: string;
}

/** A photo stored on the server (GET /api/crm/leads/:id/photos). */
export interface LeadPhoto {
  id: string;
  fileName: string;
}

export interface Lead {
  id: string;
  /** Missing means consumer (leads saved before commercial leads existed). */
  leadType?: LeadType;
  /** Commercial only. For a commercial lead `customerName` is the contact person, `location` the address and `amount` the approximate quote. */
  companyName?: string;
  /** Commercial only. */
  alternatePhone?: string;
  /** Commercial only: photos of a lead still waiting on this phone to be sent. */
  localPhotos?: LocalLeadPhoto[];
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
  /** True while the lead is only saved on this phone, waiting for a connection to be sent. */
  pendingSync?: boolean;
  /** Set when the server refused a queued lead (it will not be retried automatically). */
  syncError?: string;
}

export type NewLeadInput = Omit<Lead, 'id' | 'createdAt' | 'pendingSync' | 'syncError' | 'localPhotos'>;

export const isCommercial = (lead: Pick<Lead, 'leadType'>): boolean => lead.leadType === 'commercial';

export const MAX_LEAD_PHOTOS = 5;

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

export const COMMERCIAL_LEAD_SOURCES: Option<LeadSource>[] = [
  { value: 'google', label: 'Google' },
  { value: 'website', label: 'Website' },
  { value: 'referral', label: 'Referral' },
  { value: 'social_media', label: 'Social Media' },
  { value: 'other', label: 'Other' },
];

export const LEAD_TYPES: Option<LeadType>[] = [
  { value: 'consumer', label: 'Consumer' },
  { value: 'commercial', label: 'Commercial' },
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

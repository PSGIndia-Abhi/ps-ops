export type PaymentMethod = 'cash' | 'online' | 'other';
export type PaymentStatus = 'paid' | 'pending';
export type LeadStatus = 'new' | 'contacted' | 'converted' | 'lost';
export type LeadSource = 'website' | 'apartment' | 'referral' | 'social_media' | 'google' | 'other';
/**
 * Consumer (shown to users as "Residential") = a household service with a payment.
 * Commercial = a business enquiry with a quote and photos, no payment.
 */
export type LeadType = 'consumer' | 'commercial';
export type IndustryType = 'restaurant' | 'apartment' | 'hospital' | 'it' | 'qsr' | 'builder' | 'other';
export type CommercialService =
  | 'gpc'
  | 'rodent_control'
  | 'cockroach_control'
  | 'ant_treatment'
  | 'honeybee_control'
  | 'snake_control'
  | 'fly_control';

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
  /**
   * Commercial only. For a commercial lead `customerName` is the contact person and `amount` the
   * approximate quote. Where the business is comes from the phone's GPS (`latitude` / `longitude`);
   * `location` is an address typed by hand when the GPS could not be read.
   */
  companyName?: string;
  /** Commercial only. */
  industryType?: IndustryType | null;
  /** Commercial only: the contact person's designation. */
  designation?: string;
  /** Commercial only. */
  alternatePhone?: string;
  /** Commercial only: one or more services the business asked about. */
  servicesRequested?: CommercialService[];
  /** Commercial only: where the lead was taken. */
  latitude?: number | null;
  longitude?: number | null;
  /** Who added the lead - shown to the roles that see everyone's leads. Empty for website leads. */
  createdByName?: string;
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

export const INDUSTRY_TYPES: Option<IndustryType>[] = [
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'apartment', label: 'Apartment' },
  { value: 'hospital', label: 'Hospital' },
  { value: 'it', label: 'IT' },
  { value: 'qsr', label: 'QSR' },
  { value: 'builder', label: 'Builder' },
  { value: 'other', label: 'Other' },
];

export const COMMERCIAL_SERVICES: Option<CommercialService>[] = [
  { value: 'gpc', label: 'GPC' },
  { value: 'rodent_control', label: 'Rodent Control' },
  { value: 'cockroach_control', label: 'Cockroach Control' },
  { value: 'ant_treatment', label: 'Ant Treatment' },
  { value: 'honeybee_control', label: 'Honeybee Control' },
  { value: 'snake_control', label: 'Snake Control' },
  { value: 'fly_control', label: 'Fly Control' },
];

/** "GPC, Rodent Control" - the chosen services in the order the form lists them. */
export function servicesLabel(services: CommercialService[] | undefined): string {
  return COMMERCIAL_SERVICES.filter(s => (services ?? []).includes(s.value))
    .map(s => s.label)
    .join(', ');
}

export const LEAD_TYPES: Option<LeadType>[] = [
  { value: 'consumer', label: 'Residential' },
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

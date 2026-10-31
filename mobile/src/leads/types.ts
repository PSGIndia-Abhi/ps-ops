/**
 * Lead Management (commercial lead pipeline) types. Shapes mirror the backend
 * responses in backend/src/routes/crm-lead-*.routes.js - the mapping from the
 * raw rows lives in ./api.ts.
 */

export type PipelineStage =
  | 'NEW'
  | 'TO_CALL'
  | 'NEED_MORE_INFO'
  | 'QUALIFIED'
  | 'MEETING_SCHEDULED'
  | 'VISIT_COMPLETED'
  | 'QUOTATION_SENT'
  | 'WON'
  | 'CONVERTED'
  | 'NOT_GENUINE'
  | 'LOST'
  | 'CANCELLED';

/** Who is using the lead screens. Decides the home layout and which actions are offered. */
export type LeadPersona = 'telecaller' | 'sales' | 'sales_manager';

export interface PipelineLead {
  id: string;
  leadNumber: string | null;
  companyName: string;
  contactPerson: string;
  phone: string;
  alternatePhone: string;
  email: string;
  address: string;
  source: string | null;
  /** Approximate quote. */
  amount: number;
  /** The requirement / notes captured with the lead. */
  notes: string;
  stage: PipelineStage;
  /** Set when an external lead provider submitted it. */
  providerId: string | null;
  createdById: string | null;
  /** Who added the lead (a sales executive, telecaller, provider...). */
  createdByName: string;
  telecallerId: string | null;
  salesEmployeeId: string | null;
  /** Services asked for: Quotation Master service ids (the quotation starts with them ticked). */
  services: string[];
  createdAt: string;
  /** One-time or AMC (the lead list's tag): chosen at conversion, else the latest quotation's. */
  contractType?: 'ONE_TIME' | 'AMC' | null;
}

export type MeetingStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
export type MeetingType = 'SITE_VISIT' | 'OFFICE';

export interface Meeting {
  id: string;
  leadId: string;
  salesEmployeeId: string;
  /** Wall-clock 'YYYY-MM-DD'. */
  date: string;
  /** Wall-clock 'HH:MM:SS'. */
  time: string;
  type: MeetingType;
  address: string;
  notes: string;
  status: MeetingStatus;
  checkInAt: string | null;
  checkOutAt: string | null;
  /** Where the visit was started / ended, when the phone could give a position. */
  checkInCoords: Coords | null;
  checkOutCoords: Coords | null;
  outcomeNotes: string;
}

export interface Coords {
  lat: number;
  lng: number;
}

export interface TimelineEntry {
  id: string;
  action: string;
  note: string;
  at: string;
  by: string;
}

export interface Quotation {
  id: string;
  number: string;
  total: number;
  status: string;
  sentAt: string | null;
  /** True when the quotation was uploaded as a PDF. */
  hasPdf: boolean;
  /** One-time or AMC, chosen when it was saved (null for older / uploaded ones). */
  contractType: 'ONE_TIME' | 'AMC' | null;
  /** The name on the quotation (else the lead's). */
  clientName: string;
  /** What its PDF is shown and saved as: CLIENTNAME_PROPOSAL_YEAR.pdf. */
  fileName: string;
  /** Built with Create Quotation (its details are saved), so it can be edited or duplicated. */
  hasContent: boolean;
  /** Who made it (user id) - they, or a sales manager, may edit it. */
  createdBy: string;
}

/** A file picked on this phone, in the shape React Native's FormData uploads from. */
export interface LocalFile {
  uri: string;
  name: string;
  type: string;
}

export interface Conversion {
  companyId: string;
  companyName: string;
  convertedBy: string;
  convertedAt: string;
  /** One-time or AMC, chosen at conversion (null for customers converted before it was asked). */
  contractType: 'ONE_TIME' | 'AMC' | null;
}

/** A lead-related task due today (GET /api/crm/my-tasks/today). */
export interface LeadTask {
  id: string;
  title: string;
  description: string;
  taskType: string;
  dueTime: string | null;
  leadId: string | null;
  leadNumber: string | null;
  companyName: string;
}

export interface HomeSummary {
  todayMeetingsCount: number;
  todayFollowUpsCount: number;
  totalMyLeads: number;
  pendingQuotationsCount: number;
}

export interface Performance {
  leadsGenerated: number;
  genuineLeads: number;
  meetingsScheduled: number;
  visitsCompleted: number;
  locationsVisited: number;
  quotationsSent: number;
  leadsConverted: number;
  leadsLost: number;
  followUpsDue: number;
}

export interface Person {
  id: number;
  name: string;
  role?: string;
}

export interface NamedOption {
  id: number;
  name: string;
}

export type CallOutcome = 'CONNECTED' | 'NO_ANSWER' | 'CALLBACK_REQUESTED' | 'INVALID_NUMBER';
export type Qualification = 'GENUINE' | 'NEEDS_INFO' | 'NOT_GENUINE';

export type CommercialLeadSource = 'google' | 'website' | 'referral' | 'social_media' | 'other';

export interface NewCommercialLead {
  companyName: string;
  contactPerson: string;
  phone: string;
  alternatePhone: string;
  email: string;
  address: string;
  source: CommercialLeadSource;
  amount: number;
  requirement: string;
}

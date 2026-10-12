import type { Tone } from '../crm/ui/StatusBadge';
import type { LeadPersona, PipelineLead, PipelineStage } from './types';

/**
 * Pipeline rules for the lead screens. Pure (no React, no network) so the
 * decisions - which stage shows as what, which actions a person is offered -
 * can be unit-tested. These only decide what the UI offers; the server
 * (crm-lead-*.routes.js) re-checks every one of them.
 */

export const STAGE_META: Record<PipelineStage, { label: string; tone: Tone }> = {
  NEW: { label: 'New', tone: 'info' },
  TO_CALL: { label: 'To call', tone: 'warning' },
  NEED_MORE_INFO: { label: 'Need more info', tone: 'warning' },
  QUALIFIED: { label: 'Qualified', tone: 'success' },
  MEETING_SCHEDULED: { label: 'Meeting scheduled', tone: 'accent' },
  VISIT_COMPLETED: { label: 'Visit completed', tone: 'accent' },
  QUOTATION_SENT: { label: 'Quotation sent', tone: 'accent' },
  WON: { label: 'Won', tone: 'success' },
  CONVERTED: { label: 'Converted', tone: 'success' },
  NOT_GENUINE: { label: 'Not genuine', tone: 'danger' },
  LOST: { label: 'Lost', tone: 'danger' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
};

const TERMINAL: PipelineStage[] = ['WON', 'CONVERTED', 'NOT_GENUINE', 'LOST', 'CANCELLED'];
export const isTerminal = (stage: PipelineStage) => TERMINAL.includes(stage);

/** The buckets the home tiles and the list filter use. */
export type StageGroup = 'all' | 'new' | 'to_call' | 'qualified' | 'meeting' | 'quoted' | 'won' | 'closed';

export const STAGE_GROUPS: Record<StageGroup, { label: string; stages: PipelineStage[] | null }> = {
  all: { label: 'All', stages: null },
  new: { label: 'New', stages: ['NEW'] },
  to_call: { label: 'To call', stages: ['TO_CALL', 'NEED_MORE_INFO'] },
  qualified: { label: 'Qualified', stages: ['QUALIFIED'] },
  meeting: { label: 'Meetings', stages: ['MEETING_SCHEDULED', 'VISIT_COMPLETED'] },
  quoted: { label: 'Quoted', stages: ['QUOTATION_SENT'] },
  won: { label: 'Converted', stages: ['WON', 'CONVERTED'] },
  closed: { label: 'Closed', stages: ['NOT_GENUINE', 'LOST', 'CANCELLED'] },
};

export const STAGE_GROUP_ORDER: StageGroup[] = ['all', 'new', 'to_call', 'qualified', 'meeting', 'quoted', 'won', 'closed'];

export function inGroup(lead: Pick<PipelineLead, 'stage'>, group: StageGroup): boolean {
  const stages = STAGE_GROUPS[group].stages;
  return stages === null || stages.includes(lead.stage);
}

export function countByGroup(leads: Pick<PipelineLead, 'stage'>[]): Record<StageGroup, number> {
  const counts = { all: 0, new: 0, to_call: 0, qualified: 0, meeting: 0, quoted: 0, won: 0, closed: 0 };
  for (const lead of leads) {
    for (const group of STAGE_GROUP_ORDER) {
      if (inGroup(lead, group)) counts[group] += 1;
    }
  }
  return counts;
}

/** Created it, calling it, or visiting it - the server's own "own lead" rule. */
export function isOwnLead(lead: Pick<PipelineLead, 'createdById' | 'telecallerId' | 'salesEmployeeId'>, myId: string): boolean {
  return lead.createdById === myId || lead.telecallerId === myId || lead.salesEmployeeId === myId;
}

export type LeadAction =
  | 'claim'
  | 'call'
  | 'genuine'
  | 'needInfo'
  | 'reject'
  | 'meeting'
  | 'followUp'
  | 'quote'
  | 'lost'
  | 'convert'
  | 'feedback';

/**
 * What to offer on a lead, in display order.
 *
 * - A NEW lead has to be claimed for verification first: the server only
 *   qualifies TO_CALL / NEED_MORE_INFO leads, and claiming is what moves
 *   NEW -> TO_CALL.
 * - Everything else needs the lead to be yours, or the sales manager's
 *   MANAGE_LEADS (a telecaller's VIEW_ALL_LEADS lets them see every lead but
 *   not act on someone else's).
 * - Quotations and converting are sales work: not offered to telecallers
 *   (they hold no CONVERT_LEAD), nor before the lead is verified.
 */
export function leadActions(lead: PipelineLead, persona: LeadPersona, myId: string): LeadAction[] {
  if (isTerminal(lead.stage)) return [];
  const canManage = persona === 'sales_manager' || isOwnLead(lead, myId);
  const actions: LeadAction[] = [];

  if (lead.stage === 'NEW') {
    if (persona !== 'sales') actions.push('claim');
    if (canManage) actions.push('call', 'followUp');
  } else if (!canManage) {
    return [];
  } else if (lead.stage === 'TO_CALL' || lead.stage === 'NEED_MORE_INFO') {
    actions.push('call', 'genuine');
    if (lead.stage === 'TO_CALL') actions.push('needInfo');
    actions.push('followUp', 'reject');
  } else {
    actions.push('meeting', 'call', 'followUp');
    if (persona === 'telecaller') actions.push('reject');
    else actions.push('quote', 'convert', 'lost');
  }

  if (canManage && lead.providerId) actions.push('feedback');
  return actions;
}

/** The lead roles that get the lead screens as their whole app (sales keeps the CRM app). */
export function leadPersonaForRole(role: string | null | undefined): LeadPersona | null {
  const r = (role || '').toLowerCase().trim();
  if (r === 'telecaller') return 'telecaller';
  if (r === 'sales_manager') return 'sales_manager';
  return null;
}

/** "CALL_LOGGED" -> "Call logged". */
export function actionLabel(action: string): string {
  const text = action.replace(/_/g, ' ').toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const SOURCE_LABELS: Record<string, string> = {
  google: 'Google',
  website: 'Website',
  referral: 'Referral',
  social_media: 'Social media',
  other: 'Other',
};
export const sourceLabel = (source: string | null) => (source ? SOURCE_LABELS[source] ?? source : '-');

/** What should happen to this lead next, in a few words - shown on each row of the lead list. */
export function nextStepLabel(stage: PipelineStage): string {
  switch (stage) {
    case 'NEW':
      return 'Call to verify';
    case 'TO_CALL':
      return 'Call today';
    case 'NEED_MORE_INFO':
      return 'Call again';
    case 'QUALIFIED':
      return 'Schedule meeting';
    case 'MEETING_SCHEDULED':
      return 'Visit customer';
    case 'VISIT_COMPLETED':
      return 'Send quotation';
    case 'QUOTATION_SENT':
      return 'Wait for response';
    case 'WON':
    case 'CONVERTED':
      return 'Customer created';
    default:
      return 'Closed';
  }
}

/**
 * The outcomes offered when a visit is finished. The server stores the outcome
 * as text only, so the chosen label leads the outcome note; `next` is the
 * screen the sales person is taken to straight afterwards.
 */
export type VisitNext = 'quote' | 'followUp' | 'convert' | 'lost' | null;
export const VISIT_OUTCOMES: { key: string; label: string; next: VisitNext }[] = [
  { key: 'quotation', label: 'Quotation provided', next: 'quote' },
  { key: 'interested', label: 'Customer interested', next: null },
  { key: 'not_interested', label: 'Customer not interested', next: 'lost' },
  { key: 'follow_up', label: 'Need follow-up', next: 'followUp' },
  { key: 'close', label: 'Close deal', next: 'convert' },
  { key: 'cancel', label: 'Cancel lead', next: 'lost' },
];

/** "Quotation provided: will send revised rates" - what is saved as the visit's outcome. */
export function visitOutcomeText(label: string, notes: string): string {
  const extra = notes.trim();
  return extra ? `${label}: ${extra}` : label;
}

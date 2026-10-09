import {
  countByGroup,
  inGroup,
  isOwnLead,
  leadActions,
  leadPersonaForRole,
  nextStepLabel,
  VISIT_OUTCOMES,
  visitOutcomeText,
} from '../src/leads/stage';
import { rangeDates } from '../src/leads/screens/ReportScreens';
import { validateNewLead } from '../src/leads/screens/LeadNewScreen';
import type { PipelineLead, PipelineStage } from '../src/leads/types';

const lead = (stage: PipelineStage, over: Partial<PipelineLead> = {}): PipelineLead => ({
  id: 'L1',
  leadNumber: 'LD-2026-000001',
  companyName: 'ABC Pharma',
  contactPerson: 'Ravi',
  phone: '9876543210',
  alternatePhone: '',
  email: '',
  address: 'Whitefield',
  source: 'google',
  amount: 150000,
  notes: '',
  stage,
  providerId: null,
  createdById: null,
  telecallerId: null,
  salesEmployeeId: null,
  createdAt: '2026-10-08T05:00:00.000Z',
  ...over,
});

describe('lead personas', () => {
  it('gives the lead app only to telecallers and sales managers', () => {
    expect(leadPersonaForRole('telecaller')).toBe('telecaller');
    expect(leadPersonaForRole(' Sales_Manager ')).toBe('sales_manager');
    // Sales executives keep the CRM app; providers are web-only.
    expect(leadPersonaForRole('sales')).toBeNull();
    expect(leadPersonaForRole('lead_provider')).toBeNull();
    expect(leadPersonaForRole(null)).toBeNull();
  });
});

describe('leadActions', () => {
  it('offers a telecaller only "claim" on a new lead that is not theirs', () => {
    expect(leadActions(lead('NEW'), 'telecaller', '7')).toEqual(['claim']);
  });

  it('never offers "claim" to a sales executive', () => {
    expect(leadActions(lead('NEW'), 'sales', '7')).toEqual([]);
    expect(leadActions(lead('NEW', { createdById: '7' }), 'sales', '7')).toEqual(['call', 'followUp']);
  });

  it('lets the assigned telecaller verify a lead, but not someone else', () => {
    const mine = lead('TO_CALL', { telecallerId: '7' });
    expect(leadActions(mine, 'telecaller', '7')).toEqual(['call', 'genuine', 'needInfo', 'followUp', 'reject']);
    expect(leadActions(mine, 'telecaller', '8')).toEqual([]);
  });

  it('does not offer "need more info" again once it is already set', () => {
    expect(leadActions(lead('NEED_MORE_INFO', { telecallerId: '7' }), 'telecaller', '7')).not.toContain('needInfo');
  });

  it('offers quotation / convert / lost to sales but none of them to a telecaller', () => {
    const qualified = lead('QUALIFIED', { telecallerId: '7', salesEmployeeId: '9' });
    expect(leadActions(qualified, 'sales', '9')).toEqual(['meeting', 'call', 'followUp', 'quote', 'convert', 'lost']);
    expect(leadActions(qualified, 'telecaller', '7')).toEqual(['meeting', 'call', 'followUp', 'reject']);
  });

  it('lets a sales manager act on any open lead', () => {
    expect(leadActions(lead('QUOTATION_SENT'), 'sales_manager', '1')).toContain('convert');
  });

  it('offers nothing on a closed lead', () => {
    for (const stage of ['CONVERTED', 'LOST', 'NOT_GENUINE', 'CANCELLED', 'WON'] as PipelineStage[]) {
      expect(leadActions(lead(stage, { providerId: '3' }), 'sales_manager', '1')).toEqual([]);
    }
  });

  it('adds provider feedback only for a provider lead the user can manage', () => {
    expect(leadActions(lead('TO_CALL', { telecallerId: '7', providerId: '3' }), 'telecaller', '7')).toContain('feedback');
    expect(leadActions(lead('TO_CALL', { telecallerId: '7' }), 'telecaller', '7')).not.toContain('feedback');
  });
});

describe('stage groups', () => {
  it('counts each lead in "all" and in its own group', () => {
    const counts = countByGroup([lead('NEW'), lead('TO_CALL'), lead('NEED_MORE_INFO'), lead('CONVERTED'), lead('LOST')]);
    expect(counts).toMatchObject({ all: 5, new: 1, to_call: 2, won: 1, closed: 1, qualified: 0 });
  });

  it('matches a stage to its group', () => {
    expect(inGroup(lead('VISIT_COMPLETED'), 'meeting')).toBe(true);
    expect(inGroup(lead('VISIT_COMPLETED'), 'quoted')).toBe(false);
  });
});

describe('isOwnLead', () => {
  it('is true for the creator, the telecaller or the sales person', () => {
    const l = lead('QUALIFIED', { createdById: '1', telecallerId: '2', salesEmployeeId: '3' });
    expect(['1', '2', '3'].every((id) => isOwnLead(l, id))).toBe(true);
    expect(isOwnLead(l, '4')).toBe(false);
  });
});

describe('rangeDates', () => {
  it('builds the report window from a fixed "today"', () => {
    expect(rangeDates('today', '2026-10-08')).toEqual({ from: '2026-10-08', to: '2026-10-08' });
    expect(rangeDates('week', '2026-10-03')).toEqual({ from: '2026-09-27', to: '2026-10-03' });
    expect(rangeDates('month', '2026-10-08')).toEqual({ from: '2026-10-01', to: '2026-10-08' });
  });
});

describe('validateNewLead', () => {
  const good = {
    companyName: 'ABC Pharma',
    contactPerson: 'Ravi Kumar',
    phone: '9876543210',
    alternatePhone: '',
    email: '',
    address: 'Whitefield, Bengaluru',
    source: 'google' as const,
    amount: '150000',
  };

  it('accepts a complete lead', () => {
    expect(validateNewLead(good)).toEqual({});
  });

  it('flags each missing or malformed field', () => {
    const errors = validateNewLead({ ...good, companyName: 'A', phone: '98765', alternatePhone: '123', email: 'nope', address: ' ', source: null, amount: '0' });
    expect(Object.keys(errors).sort()).toEqual(['address', 'alternatePhone', 'amount', 'companyName', 'email', 'phone', 'source']);
  });
});

describe('visit outcomes', () => {
  it('leads the saved outcome with the chosen label', () => {
    expect(visitOutcomeText('Quotation provided', '  will send revised rates ')).toBe('Quotation provided: will send revised rates');
    expect(visitOutcomeText('Customer interested', '   ')).toBe('Customer interested');
  });

  it('sends each outcome to the step that follows from it', () => {
    const next = Object.fromEntries(VISIT_OUTCOMES.map((o) => [o.key, o.next]));
    expect(next).toEqual({ quotation: 'quote', interested: null, not_interested: 'lost', follow_up: 'followUp', close: 'convert', cancel: 'lost' });
  });
});

describe('nextStepLabel', () => {
  it('names the next step for open leads and marks closed ones', () => {
    expect(nextStepLabel('NEW')).toBe('Call to verify');
    expect(nextStepLabel('QUALIFIED')).toBe('Schedule meeting');
    expect(nextStepLabel('CONVERTED')).toBe('Customer created');
    expect(nextStepLabel('LOST')).toBe('Closed');
  });
});

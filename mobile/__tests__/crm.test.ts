import { formatINR, initialsOf } from '../src/crm/format';
import { computeMonthlyAchievements } from '../src/crm/stats';
import { confirmationMessage, findLeadByPhone, newClientRef, suggestReferences, whatsappUrl } from '../src/crm/leadHelpers';
import { outboxToLead } from '../src/crm/outbox';
import { friendlyPaymentMessage } from '../src/crm/payment';
import { getGreeting } from '../src/utils/date';
import { getHouseTypes, getPlans, getPrice, getServices, type ServiceMasterRow } from '../src/crm/serviceMaster';
import { computeLeadStats } from '../src/crm/stats';
import type { Lead } from '../src/crm/types';
import { cleanPhoneInput, normalizePhone, parseAmount, phoneError, validateLead, type LeadFormValues } from '../src/crm/validation';

describe('formatINR', () => {
  it('uses Indian digit grouping', () => {
    expect(formatINR(0)).toBe('₹0');
    expect(formatINR(950)).toBe('₹950');
    expect(formatINR(4500)).toBe('₹4,500');
    expect(formatINR(24500)).toBe('₹24,500');
    expect(formatINR(123456)).toBe('₹1,23,456');
    expect(formatINR(1234567)).toBe('₹12,34,567');
  });
});

describe('getGreeting', () => {
  const at = (h: number, m = 0) => new Date(2026, 8, 19, h, m);
  it('follows the time of day, including night', () => {
    expect(getGreeting(at(5))).toBe('Good morning');
    expect(getGreeting(at(11, 59))).toBe('Good morning');
    expect(getGreeting(at(12))).toBe('Good afternoon');
    expect(getGreeting(at(16, 59))).toBe('Good afternoon');
    expect(getGreeting(at(17))).toBe('Good evening');
    expect(getGreeting(at(20, 59))).toBe('Good evening');
    expect(getGreeting(at(21))).toBe('Good night');
    expect(getGreeting(at(22))).toBe('Good night');
    expect(getGreeting(at(0))).toBe('Good night');
    expect(getGreeting(at(4, 59))).toBe('Good night');
  });
});

describe('friendlyPaymentMessage', () => {
  it('never shows raw JSON from Razorpay', () => {
    const raw =
      '{"error":{"code":"BAD_REQUEST_ERROR","description":"Payment Failed","source":"customer","step":"payment_authentication"}}';
    expect(friendlyPaymentMessage(raw)).toBe('The payment did not go through. Please try again.');
  });

  it('keeps a real human sentence, even one wrapped in JSON', () => {
    expect(friendlyPaymentMessage('Your card was declined by the bank')).toBe('Your card was declined by the bank');
    expect(friendlyPaymentMessage('{"error":{"description":"Insufficient funds in the account"}}')).toBe(
      'Insufficient funds in the account',
    );
  });

  it('falls back for empty or unreadable input', () => {
    expect(friendlyPaymentMessage(undefined)).toBe('The payment did not go through. Please try again.');
    expect(friendlyPaymentMessage('{not valid json')).toBe('The payment did not go through. Please try again.');
  });
});

describe('initialsOf', () => {
  it('takes first and last initial', () => {
    expect(initialsOf('Rajesh Kumar')).toBe('RK');
    expect(initialsOf('  suresh ')).toBe('S');
    expect(initialsOf('')).toBe('?');
  });
});

// The rows the backend serves from crm_services + crm_service_prices.
const MASTER: ServiceMasterRow[] = [
  { service: 'Cockroach Services', houseType: '1 BHK', plan: 'One Time', price: 2000 },
  { service: 'Cockroach Services', houseType: '2 BHK', plan: 'One Time', price: 2500 },
  { service: 'Cockroach Services', houseType: '1 BHK', plan: 'Annual AMC', price: 4000 },
  { service: 'Cockroach Services', houseType: '2 BHK', plan: 'Annual AMC', price: 5000 },
  { service: 'Bedbugs Services', houseType: '1 BHK', plan: '2 Service', price: 4000 },
  { service: 'Bedbugs Services', houseType: '2 BHK', plan: '2 Service with Steam', price: 7000 },
];

describe('service master helpers', () => {
  it('lists services and house types from the fetched rows', () => {
    expect(getServices(MASTER)).toEqual(['Cockroach Services', 'Bedbugs Services']);
    expect(getHouseTypes(MASTER)).toEqual(['1 BHK', '2 BHK']);
  });

  it('offers plans that depend on the selected service', () => {
    expect(getPlans(MASTER, 'Cockroach Services')).toEqual(['One Time', 'Annual AMC']);
    expect(getPlans(MASTER, 'Bedbugs Services')).toEqual(['2 Service', '2 Service with Steam']);
    expect(getPlans(MASTER, null)).toEqual([]);
  });

  it('prices a service + house type + plan combination', () => {
    expect(getPrice(MASTER, 'Cockroach Services', '2 BHK', 'Annual AMC')).toBe(5000);
    expect(getPrice(MASTER, 'Bedbugs Services', '2 BHK', '2 Service with Steam')).toBe(7000);
  });

  it('returns null for an incomplete, unpriced or mismatched selection', () => {
    expect(getPrice(MASTER, 'Cockroach Services', '1 BHK', null)).toBeNull();
    expect(getPrice(MASTER, 'Cockroach Services', '1 BHK', '2 Service')).toBeNull();
    expect(getPrice(MASTER, 'Bedbugs Services', '1 BHK', '2 Service with Steam')).toBeNull();
    expect(getPrice([], 'Cockroach Services', '1 BHK', 'One Time')).toBeNull();
  });
});

describe('computeLeadStats', () => {
  const now = new Date('2026-09-19T12:00:00');
  const lead = (over: Partial<Lead>): Lead => ({
    id: 'x',
    customerName: 'Test',
    phone: '9876543210',
    email: '',
    houseType: '2 BHK',
    service: 'Cockroach Services',
    plan: 'Annual AMC',
    amount: 5000,
    coupon: '',
    location: '',
    source: null,
    referenceBy: '',
    notes: '',
    paymentMethod: 'cash',
    paymentStatus: 'paid',
    leadStatus: 'new',
    createdAt: '2026-09-19T09:00:00',
    ...over,
  });

  it('counts todays leads and totals paid vs pending money', () => {
    const leads = [
      lead({ id: 'a', createdAt: '2026-09-19T09:00:00', paymentStatus: 'paid', amount: 5000 }),
      lead({ id: 'b', createdAt: '2026-09-19T10:00:00', paymentStatus: 'pending', amount: 8000 }),
      lead({ id: 'c', createdAt: '2026-09-18T10:00:00', paymentStatus: 'paid', amount: 2000 }),
    ];
    expect(computeLeadStats(leads, now)).toEqual({ todaysLeads: 2, paidTotal: 7000, pendingTotal: 8000 });
  });

  it('is all zeros with no leads', () => {
    expect(computeLeadStats([], now)).toEqual({ todaysLeads: 0, paidTotal: 0, pendingTotal: 0 });
  });
});

describe('validateLead', () => {
  const valid: LeadFormValues = {
    customerName: 'Rajesh Kumar',
    phone: '98765 43210',
    email: '',
    houseType: '2 BHK',
    service: 'Cockroach Services',
    plan: 'Annual AMC',
    amount: '5000',
    location: '',
    referenceBy: '',
    notes: '',
  };

  it('accepts a complete lead (optional fields may be empty)', () => {
    expect(validateLead(valid)).toEqual({});
  });

  it('requires name, phone, house type, service, plan and a positive amount', () => {
    const errors = validateLead({
      ...valid,
      customerName: ' ',
      phone: '',
      houseType: null,
      service: null,
      plan: null,
      amount: '0',
    });
    expect(Object.keys(errors).sort()).toEqual(['amount', 'customerName', 'houseType', 'phone', 'plan', 'service']);
  });

  it('email is optional but must look like an email when given', () => {
    expect(validateLead({ ...valid, email: 'a@b.com' })).toEqual({});
    expect(validateLead({ ...valid, email: 'not-an-email' }).email).toMatch(/email looks incomplete/);
  });

  it('rejects a phone that is not 10 digits', () => {
    expect(validateLead({ ...valid, phone: '12345' }).phone).toMatch(/10-digit/);
  });

  it('normalizes phone and amount text', () => {
    expect(normalizePhone('98765 43210')).toBe('9876543210');
    expect(parseAmount('4,500')).toBe(4500);
    expect(parseAmount('abc')).toBe(0);
  });
});

describe('cleanPhoneInput / phoneError', () => {
  it('keeps digits only and at most 10 of them', () => {
    expect(cleanPhoneInput('98765 43210')).toBe('9876543210');
    expect(cleanPhoneInput('98a76b54321099')).toBe('9876543210');
    expect(cleanPhoneInput('')).toBe('');
  });

  it('drops +91 and a leading 0 as they come from contacts or WhatsApp', () => {
    expect(cleanPhoneInput('+91 98765 43210')).toBe('9876543210');
    expect(cleanPhoneInput('919876543210')).toBe('9876543210');
    expect(cleanPhoneInput('098765 43210')).toBe('9876543210');
  });

  it('does not mistake a real number that starts with 91 for a country code', () => {
    expect(cleanPhoneInput('9123456789')).toBe('9123456789');
  });

  it('explains what is wrong in plain words', () => {
    expect(phoneError('')).toMatch(/Enter the customer/);
    expect(phoneError('12345')).toMatch(/10-digit/);
    expect(phoneError('1234567890')).toMatch(/start with 6, 7, 8 or 9/);
    expect(phoneError('9876543210')).toBeUndefined();
  });
});

describe('leadHelpers', () => {
  const mk = (over: Partial<Lead>): Lead => ({
    id: 'x', customerName: 'Meera Iyer', phone: '9811122233', email: '', houseType: '2 BHK', service: 'Cockroach Services',
    plan: 'Annual AMC', amount: 4000, coupon: '', location: '', source: null, referenceBy: '', notes: '',
    paymentMethod: 'cash', paymentStatus: 'paid', leadStatus: 'new', createdAt: '2026-09-20T10:00:00Z', ...over,
  });

  it('finds an existing lead by phone, in any format', () => {
    const leads = [mk({ id: 'a', phone: '9811122233' }), mk({ id: 'b', phone: '9000000000' })];
    expect(findLeadByPhone(leads, '98111 22233')?.id).toBe('a');
    expect(findLeadByPhone(leads, '9811122234')).toBeUndefined();
    expect(findLeadByPhone(leads, '98111')).toBeUndefined();
  });

  it('suggests earlier references, most used first, filtered by what is typed', () => {
    const leads = [
      mk({ referenceBy: 'Suresh' }), mk({ referenceBy: 'suresh' }), mk({ referenceBy: 'Anita' }),
      mk({ referenceBy: '' }), mk({ referenceBy: 'Sunita' }),
    ];
    expect(suggestReferences(leads, '')).toEqual(['Suresh', 'Anita', 'Sunita']);
    expect(suggestReferences(leads, 'su')).toEqual(['Suresh', 'Sunita']);
    expect(suggestReferences(leads, 'Suresh')).toEqual([]);
  });

  it('writes a friendly WhatsApp confirmation', () => {
    const text = confirmationMessage(mk({ paymentStatus: 'pending' }));
    expect(text).toContain('Hello Meera');
    expect(text).toContain('Cockroach Services (Annual AMC)');
    expect(text).toContain('Amount: ₹4,000');
    expect(confirmationMessage(mk({ paymentStatus: 'paid' }))).toContain('Payment received: ₹4,000');
    expect(whatsappUrl('98111 22233', 'Hi there')).toBe('https://wa.me/919811122233?text=Hi%20there');
  });

  it('makes client references that fit the server column and differ every time', () => {
    const a = newClientRef();
    const b = newClientRef();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^APP-[A-Za-z0-9-]{8,36}$/);
    expect(a.length).toBeLessThanOrEqual(40);
  });
});

describe('outbox', () => {
  it('shows a queued lead as pending and unsent, and never as paid online', () => {
    const lead = outboxToLead({
      clientRef: 'APP-1', createdAt: '2026-09-20T10:00:00Z',
      input: { customerName: 'A', phone: '9811122233', email: '', houseType: '2 BHK', service: 'S', plan: 'P', amount: 100, coupon: '', location: '', source: null, referenceBy: '', notes: '', paymentMethod: 'online', paymentStatus: 'paid', leadStatus: 'new' },
    });
    expect(lead.id).toBe('local-APP-1');
    expect(lead.pendingSync).toBe(true);
    expect(lead.paymentStatus).toBe('pending');
  });
});

describe('computeMonthlyAchievements', () => {
  const now = new Date('2026-09-21T12:00:00');
  const mk = (over: Partial<Lead>): Lead => ({
    id: 'x', customerName: 'A', phone: '9811122233', email: '', houseType: '2 BHK', service: 'S', plan: 'P', amount: 1000,
    coupon: '', location: '', source: null, referenceBy: '', notes: '', paymentMethod: 'cash', paymentStatus: 'pending',
    leadStatus: 'new', createdAt: '2026-09-10T10:00:00', ...over,
  });

  it('counts only this month, and works out money collected', () => {
    const leads = [
      mk({ amount: 4000, paymentStatus: 'paid', leadStatus: 'converted' }),
      mk({ amount: 6000 }),
      mk({ amount: 5000, paymentStatus: 'paid', createdAt: '2026-08-30T10:00:00' }),
    ];
    const a = computeMonthlyAchievements(leads, now);
    expect(a.monthLeads).toBe(2);
    expect(a.paidLeads).toBe(1);
    expect(a.convertedLeads).toBe(1);
    expect(a.collected).toBe(4000);
    expect(a.totalValue).toBe(10000);
    expect(a.collectedPercent).toBe(40);
    expect(a.paidPercent).toBe(50);
  });

  it('is all zeros (no divide-by-zero) when nothing was added this month', () => {
    expect(computeMonthlyAchievements([], now)).toEqual({
      monthLeads: 0, paidLeads: 0, convertedLeads: 0, collected: 0, totalValue: 0, collectedPercent: 0, paidPercent: 0,
    });
  });
});

import { formatINR, initialsOf } from '../src/crm/format';
import { discountedAmount } from '../src/crm/coupon';
import { friendlyPaymentMessage } from '../src/crm/payment';
import { getGreeting } from '../src/utils/date';
import { getHouseTypes, getPlans, getPrice, getServices, type ServiceMasterRow } from '../src/crm/serviceMaster';
import { computeLeadStats } from '../src/crm/stats';
import type { Lead } from '../src/crm/types';
import { normalizePhone, parseAmount, validateLead, type LeadFormValues } from '../src/crm/validation';

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

describe('discountedAmount', () => {
  it('takes the coupon percentage off the list price, rounded like the website', () => {
    expect(discountedAmount(5000, 20)).toBe(4000);
    expect(discountedAmount(2500, 20)).toBe(2000);
    expect(discountedAmount(3500, 20)).toBe(2800);
    expect(discountedAmount(6999, 20)).toBe(5599);
    expect(discountedAmount(5000, 0)).toBe(5000);
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
    coupon: '',
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
    expect(validateLead({ ...valid, email: 'not-an-email' }).email).toMatch(/valid email/);
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

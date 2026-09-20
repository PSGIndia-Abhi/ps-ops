export interface LeadFormValues {
  customerName: string;
  phone: string;
  email: string;
  houseType: string | null;
  service: string | null;
  plan: string | null;
  /** Kept as text while editing; parsed on save. */
  amount: string;
  coupon: string;
  location: string;
  referenceBy: string;
  notes: string;
}

export type LeadFormErrors = Partial<Record<keyof LeadFormValues, string>>;

export function parseAmount(text: string): number {
  const cleaned = text.replace(/[^0-9.]/g, '');
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : 0;
}

/** Digits only, so "98765 43210" and "9876543210" are the same phone number. */
export function normalizePhone(text: string): string {
  return text.replace(/\D/g, '');
}

/** Required: name, phone, house type, service, plan, and a positive amount. */
export function validateLead(values: LeadFormValues): LeadFormErrors {
  const errors: LeadFormErrors = {};

  if (values.customerName.trim().length < 2) {
    errors.customerName = 'Enter the customer name.';
  }

  const phone = normalizePhone(values.phone);
  if (!phone) {
    errors.phone = 'Enter a phone number.';
  } else if (phone.length !== 10) {
    errors.phone = 'Enter a valid 10-digit phone number.';
  }

  const email = values.email.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'Enter a valid email address.';
  }

  if (!values.houseType) errors.houseType = 'Select a house type.';
  if (!values.service) errors.service = 'Select a service.';
  if (!values.plan) errors.plan = 'Select a plan.';

  if (parseAmount(values.amount) <= 0) {
    errors.amount = 'Enter a valid amount.';
  }

  return errors;
}

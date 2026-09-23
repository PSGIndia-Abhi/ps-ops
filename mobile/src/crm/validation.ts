export interface LeadFormValues {
  customerName: string;
  phone: string;
  email: string;
  houseType: string | null;
  service: string | null;
  plan: string | null;
  /** Kept as text while editing; parsed on save. */
  amount: string;
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

/**
 * What the phone field keeps as the user types or pastes: digits only, at most 10.
 * "+91 98765 43210" and "098765 43210" (as they come from contacts or WhatsApp) become "9876543210".
 */
export function cleanPhoneInput(text: string): string {
  let digits = normalizePhone(text);
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits.slice(0, 10);
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function phoneError(text: string): string | undefined {
  const phone = normalizePhone(text);
  if (!phone) return "Enter the customer's mobile number.";
  if (phone.length !== 10) return 'Enter a valid 10-digit mobile number.';
  if (!/^[6-9]/.test(phone)) return 'Mobile numbers start with 6, 7, 8 or 9.';
  return undefined;
}

/** Required: name, phone, house type, service, plan, and a positive amount. */
export function validateLead(values: LeadFormValues): LeadFormErrors {
  const errors: LeadFormErrors = {};

  if (values.customerName.trim().length < 2) {
    errors.customerName = "Enter the customer's name.";
  }

  const phone = phoneError(values.phone);
  if (phone) errors.phone = phone;

  const email = values.email.trim();
  if (email && !EMAIL_PATTERN.test(email)) {
    errors.email = 'That email looks incomplete - check it (e.g. name@gmail.com).';
  }

  if (!values.houseType) errors.houseType = 'Select a house type.';
  if (!values.service) errors.service = 'Select a service.';
  if (!values.plan) errors.plan = 'Select a plan.';

  if (parseAmount(values.amount) <= 0) {
    errors.amount = 'Enter a valid amount.';
  }

  return errors;
}

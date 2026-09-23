import { httpClient } from './httpClient';
import type { Lead, LeadSource, LeadStatus, NewLeadInput, PaymentMethod, PaymentStatus } from '../crm/types';
import type { ServiceMasterRow } from '../crm/serviceMaster';

/**
 * CRM API (backend/src/routes/crm.routes.js). Every endpoint needs a CRM_*
 * permission, which the `sales` and `marketing` roles carry.
 */

interface ApiLead {
  id: string;
  customer_name: string;
  phone: string;
  email: string;
  house_type: string;
  service_name: string;
  plan_type: string;
  standard_amount: number | null;
  amount: number;
  coupon_code: string;
  location: string;
  lead_source: LeadSource | null;
  reference_by: string;
  notes: string;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  lead_status: LeadStatus;
  created_at: string;
}

interface ApiService {
  id: string;
  name: string;
  category: string;
  prices: { house_type: string; plan_type: string; price: number }[];
}

function toLead(row: ApiLead): Lead {
  return {
    id: row.id,
    customerName: row.customer_name,
    phone: row.phone,
    email: row.email ?? '',
    houseType: row.house_type,
    service: row.service_name,
    plan: row.plan_type,
    amount: row.amount,
    coupon: row.coupon_code,
    location: row.location,
    source: row.lead_source,
    referenceBy: row.reference_by ?? '',
    notes: row.notes,
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    leadStatus: row.lead_status,
    createdAt: row.created_at,
  };
}

/** GET /api/crm/leads - newest first. */
export async function listLeads(): Promise<Lead[]> {
  const { data } = await httpClient.get<ApiLead[]>('/api/crm/leads');
  return data.map(toLead);
}

/** POST /api/crm/leads - the server re-checks the price list and forces Online payments to "pending". */
export async function createLead(input: NewLeadInput, clientRef?: string): Promise<Lead> {
  const { data } = await httpClient.post<ApiLead>('/api/crm/leads', {
    client_ref: clientRef,
    customer_name: input.customerName,
    phone: input.phone,
    email: input.email,
    house_type: input.houseType,
    service_name: input.service,
    plan_type: input.plan,
    amount: input.amount,
    coupon_code: input.coupon,
    location: input.location,
    lead_source: input.source,
    reference_by: input.referenceBy,
    notes: input.notes,
    payment_method: input.paymentMethod,
    payment_status: input.paymentStatus,
    lead_status: input.leadStatus,
  });
  return toLead(data);
}

/** GET /api/crm/services - the price list, flattened to one row per service + house type + plan. */
export async function listServiceMaster(): Promise<ServiceMasterRow[]> {
  const { data } = await httpClient.get<ApiService[]>('/api/crm/services');
  return data.flatMap((service) =>
    service.prices.map((p) => ({
      service: service.name,
      houseType: p.house_type,
      plan: p.plan_type,
      price: p.price,
    })),
  );
}

export interface PaymentOrder {
  orderId: string;
  /** In paise. */
  amount: number;
  currency: string;
  /** The PUBLIC Razorpay key id (the secret never leaves the server). */
  keyId: string;
  name: string;
  phone: string;
}

/** POST /api/crm/leads/:id/payment-order - the server takes the amount from the lead, not from the app. */
export async function createPaymentOrder(leadId: string): Promise<PaymentOrder> {
  const { data } = await httpClient.post<{
    order_id: string;
    amount: number;
    currency: string;
    key_id: string;
    name: string;
    phone: string;
  }>(`/api/crm/leads/${leadId}/payment-order`);
  return {
    orderId: data.order_id,
    amount: data.amount,
    currency: data.currency,
    keyId: data.key_id,
    name: data.name,
    phone: data.phone,
  };
}

export interface PaymentProof {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

/** POST /api/crm/leads/:id/payment-verify - the server checks the signature, then marks the lead Paid. */
export async function verifyPayment(leadId: string, proof: PaymentProof): Promise<Lead> {
  const { data } = await httpClient.post<ApiLead>(`/api/crm/leads/${leadId}/payment-verify`, proof);
  return toLead(data);
}

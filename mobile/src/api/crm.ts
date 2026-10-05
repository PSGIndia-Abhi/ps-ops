import { httpClient } from './httpClient';
import type {
  Lead,
  LeadPhoto,
  LeadSource,
  LeadStatus,
  LeadType,
  LocalLeadPhoto,
  NewLeadInput,
  PaymentMethod,
  PaymentStatus,
} from '../crm/types';
import type { ServiceMasterRow } from '../crm/serviceMaster';

/** A photo over a slow mobile connection needs far longer than the default request timeout. */
const PHOTO_UPLOAD_TIMEOUT_MS = 60000;

/**
 * CRM API (backend/src/routes/crm.routes.js). Every endpoint needs a CRM_*
 * permission, which the `sales` and `marketing` roles carry.
 */

interface ApiLead {
  id: string;
  /** Not sent by a backend from before commercial leads existed. */
  lead_type?: LeadType;
  customer_name: string;
  company_name?: string;
  phone: string;
  alternate_phone?: string;
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
  const commercial = row.lead_type === 'commercial';
  return {
    id: row.id,
    leadType: commercial ? 'commercial' : 'consumer',
    customerName: row.customer_name,
    companyName: row.company_name ?? '',
    phone: row.phone,
    alternatePhone: row.alternate_phone ?? '',
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
    // A commercial lead has no payment (the server stores 'none' / 'na'); nothing shows these for it.
    paymentMethod: commercial ? 'other' : row.payment_method,
    paymentStatus: commercial ? 'pending' : row.payment_status,
    leadStatus: row.lead_status,
    createdAt: row.created_at,
  };
}

/** GET /api/crm/leads?lead_type=all - consumer and commercial leads together, newest first. */
export async function listLeads(): Promise<Lead[]> {
  const { data } = await httpClient.get<ApiLead[]>('/api/crm/leads', { params: { lead_type: 'all' } });
  return data.map(toLead);
}

/** POST /api/crm/leads - the server re-checks the price list and forces Online payments to "pending". */
export async function createLead(input: NewLeadInput, clientRef?: string): Promise<Lead> {
  const { data } = await httpClient.post<ApiLead>('/api/crm/leads', {
    client_ref: clientRef,
    lead_type: input.leadType ?? 'consumer',
    customer_name: input.customerName,
    company_name: input.companyName ?? '',
    phone: input.phone,
    alternate_phone: input.alternatePhone ?? '',
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

interface ApiLeadPhoto {
  id: string;
  file_name: string;
}

const toLeadPhoto = (row: ApiLeadPhoto): LeadPhoto => ({ id: row.id, fileName: row.file_name });

/** GET /api/crm/leads/:id/photos - oldest first. */
export async function listLeadPhotos(leadId: string): Promise<LeadPhoto[]> {
  const { data } = await httpClient.get<ApiLeadPhoto[]>(`/api/crm/leads/${leadId}/photos`);
  return data.map(toLeadPhoto);
}

/** POST /api/crm/leads/:id/photos - one photo per request; `ref` makes a retry safe. */
export async function uploadLeadPhoto(leadId: string, photo: LocalLeadPhoto): Promise<LeadPhoto> {
  const form = new FormData();
  form.append('client_ref', photo.ref);
  // RN's FormData streams this {uri,name,type} shape from the uri (see api/jobs.ts).
  form.append('file', { uri: photo.uri, name: photo.name, type: photo.type } as unknown as Blob);
  const { data } = await httpClient.post<ApiLeadPhoto>(`/api/crm/leads/${leadId}/photos`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: PHOTO_UPLOAD_TIMEOUT_MS,
  });
  return toLeadPhoto(data);
}

/** Relative path - the viewer adds API_BASE_URL and the Bearer header itself. */
export const leadPhotoViewPath = (leadId: string, photoId: string) =>
  `/api/crm/leads/${leadId}/photos/${photoId}/view`;

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

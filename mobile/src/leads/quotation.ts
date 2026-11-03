import { NativeModules } from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { httpClient, ApiError } from '../api/httpClient';
import { getToken } from '../auth/tokenStorage';
import { API_BASE_URL } from '../config/env';
import { proposalFileName } from './proposalName';
import type { Quotation } from './types';

/**
 * Quotations built from the quotation master (backend crm-quote-master.routes.js and the
 * preview / generate routes in crm-lead-quotations.routes.js) - the same flow as the web's
 * Create Quotation. The server checks everything again and draws the PDF.
 *
 * PDFs are written to the app's cache with react-native-blob-util and opened in the phone's
 * PDF viewer (which has its own Share button); "Save to Downloads" puts a copy where WhatsApp
 * and email can attach it.
 */

type Row = Record<string, unknown>;
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));

export type Billing = 'ONE_TIME' | 'MONTHLY' | 'YEARLY';
export type ContractType = 'ONE_TIME' | 'AMC';
export type TreatmentRow = { defense_area: string; material_used: string; treatment_area: string; frequency: string };
export type MasterService = { id: string; name: string; treatments: TreatmentRow[]; prices: { plan_id: string; price: number }[] };
export type MasterPlan = { id: string; name: string; billing: Billing; visits_per_month: number | null; sort_order: number };
export type MasterClause = { id: string; kind: 'VALUE_ADDED' | 'TERMS'; text: string; is_default: boolean };
export type QuoteMaster = { services: MasterService[]; plans: MasterPlan[]; clauses: MasterClause[] };

/** The body the preview / generate routes take (see backend utils/crmQuotationDocument.js). */
export type QuotationContent = {
  customer: { name: string; address: string; attention: string; phone: string };
  subject: string;
  revised: boolean;
  validDays: number;
  contractMonths: number;
  discount: number;
  services: { name: string; plan: string; billing: Billing; price: number | null; rows: TreatmentRow[] }[];
  pricing: { mode: 'PER_SERVICE' } | { mode: 'PACKAGE'; amount: number; billing: Billing; planLabel: string; description: string };
  /** Optional price table in the client's format (headings first, total row last). */
  priceTable: { rows: string[][]; title?: string } | null;
  /** The price is for one outlet. */
  perOutlet: boolean;
  /** One-time or AMC - on older quotations only (it is asked at Convert to customer now). */
  contractType?: ContractType | null;
  valueAdded: string[];
  terms: string[];
};

/** GET /api/crm/quote-master - the active services (with rows and prices), plans and clauses. */
export async function getQuoteMaster(): Promise<QuoteMaster> {
  const { data } = await httpClient.get<{ services: Row[]; plans: Row[]; clauses: Row[] }>('/api/crm/quote-master');
  const byOrder = (a: MasterPlan, b: MasterPlan) => a.sort_order - b.sort_order || a.name.localeCompare(b.name);
  return {
    services: data.services.map((s) => ({
      id: str(s.id),
      name: str(s.name),
      treatments: ((s.treatments as Row[]) || []).map((t) => ({
        defense_area: str(t.defense_area),
        material_used: str(t.material_used),
        treatment_area: str(t.treatment_area),
        frequency: str(t.frequency),
      })),
      prices: ((s.prices as Row[]) || []).map((p) => ({ plan_id: str(p.plan_id), price: Number(p.price) || 0 })),
    })),
    plans: data.plans
      .map((p) => ({
        id: str(p.id),
        name: str(p.name),
        billing: str(p.billing) as Billing,
        visits_per_month: p.visits_per_month === null || p.visits_per_month === undefined ? null : Number(p.visits_per_month),
        sort_order: Number(p.sort_order) || 0,
      }))
      .sort(byOrder),
    clauses: data.clauses.map((c) => ({ id: str(c.id), kind: str(c.kind) as MasterClause['kind'], text: str(c.text), is_default: !!c.is_default })),
  };
}

/** What a saved quotation was made from (GET .../content) - to open it again for Edit / Duplicate. */
export type SavedQuotationContent = Partial<Omit<QuotationContent, 'priceTable'>> & {
  priceTable?: { title?: string; header: string[]; body?: string[][]; totalLabel?: string; total?: number } | null;
  totals?: { discount?: number };
};

/** GET /leads/:id/quotations/:quotationId/content */
export async function getQuotationContent(leadId: string, quotationId: string): Promise<SavedQuotationContent> {
  const { data } = await httpClient.get<SavedQuotationContent>(`/api/crm/leads/${leadId}/quotations/${quotationId}/content`);
  return data;
}

/**
 * POST /leads/:id/quotations/generate - numbers and saves it; the lead moves to Quotation sent.
 * `replacesQuotationId` (an edit): that quotation is marked Cancelled, replaced by this one.
 */
export async function generateQuotation(leadId: string, content: QuotationContent, replacesQuotationId?: string): Promise<Quotation> {
  const body = replacesQuotationId ? { ...content, replacesQuotationId } : content;
  const { data } = await httpClient.post<Row>(`/api/crm/leads/${leadId}/quotations/generate`, body, { timeout: 60000 });
  return {
    id: str(data.id),
    number: str(data.quotation_number),
    total: Number(data.total_amount) || 0,
    status: str(data.status),
    sentAt: data.sent_at ? str(data.sent_at) : null,
    hasPdf: !!data.pdf_object_key,
    contractType: content.contractType ?? null,
    clientName: content.customer.name,
    fileName: proposalFileName(content.customer.name),
    hasContent: true,
    createdBy: str(data.created_by),
  };
}

// A file name that is safe on the phone, always ending in .pdf.
const safePdfName = (s: string) => `${(s || 'Quotation').replace(/\.pdf$/i, '').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'Quotation'}.pdf`;

/** Fetches a PDF with the session token into the app cache; returns the file path. */
// Each PDF goes into a folder of its own (cache/quote-pdf/<time>/<name>.pdf): the phone's PDF viewer
// remembers a file by its path, so writing a new preview over the same path showed the old one again.
const PDF_DIR = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/quote-pdf`;

/**
 * A fresh folder for the next PDF. Folders older than 10 minutes are cleared out (newer ones are
 * kept: an app the PDF was just shared to may still be reading it).
 */
async function freshPdfFolder(): Promise<string> {
  const fs = ReactNativeBlobUtil.fs;
  if (await fs.exists(PDF_DIR)) {
    const old = await fs.ls(PDF_DIR).catch(() => [] as string[]);
    const cutoff = Date.now() - 10 * 60 * 1000;
    await Promise.all(old.filter((name) => Number(name) < cutoff).map((name) => fs.unlink(`${PDF_DIR}/${name}`).catch(() => undefined)));
  } else {
    await fs.mkdir(PDF_DIR).catch(() => undefined);
  }
  const folder = `${PDF_DIR}/${Date.now()}`;
  await fs.mkdir(folder).catch(() => undefined);
  return folder;
}

async function fetchPdf(method: 'GET' | 'POST', path: string, fileName: string, body?: unknown): Promise<string> {
  const token = await getToken();
  const target = `${await freshPdfFolder()}/${fileName}`;
  const res = await ReactNativeBlobUtil.config({ path: target, overwrite: true, timeout: 60000 }).fetch(
    method,
    `${API_BASE_URL}${path}`,
    { Authorization: token ? `Bearer ${token}` : '', 'Content-Type': 'application/json', Accept: 'application/pdf' },
    body === undefined ? undefined : JSON.stringify(body),
  );
  const status = res.info().status;
  if (status < 200 || status >= 300) {
    // The error body was written to the file: read the server's message from it.
    let message = 'Could not make the PDF.';
    try {
      const text = await ReactNativeBlobUtil.fs.readFile(target, 'utf8');
      message = (JSON.parse(text) as { error?: string }).error || message;
    } catch {
      // not JSON - keep the plain message
    }
    await ReactNativeBlobUtil.fs.unlink(target).catch(() => undefined);
    throw new ApiError(message, status);
  }
  return target;
}

/** The quotation as a PDF (not saved, no number yet) - for Preview. Named CLIENTNAME_PROPOSAL_YEAR.pdf. */
export const previewQuotationPdf = (leadId: string, content: QuotationContent) =>
  fetchPdf('POST', `/api/crm/leads/${leadId}/quotations/preview`, proposalFileName(content.customer.name), content);

/** A saved quotation's PDF, under its file name (CLIENTNAME_PROPOSAL_YEAR.pdf). */
export const savedQuotationPdf = (leadId: string, quotationId: string, fileName: string) =>
  fetchPdf('GET', `/api/crm/leads/${leadId}/quotations/${quotationId}/pdf`, safePdfName(fileName));

/** A service agreement's PDF (or its signed copy), downloaded to the app's cache; returns its path. */
export const savedAgreementPdf = (leadId: string, agreementId: string, fileName: string, signed = false) =>
  fetchPdf('GET', `/api/crm/leads/${leadId}/agreements/${agreementId}/${signed ? 'signed' : 'pdf'}`, safePdfName(fileName));

/** Opens a PDF file in the phone's PDF viewer (it has its own Share button). */
export async function openPdf(path: string): Promise<void> {
  // No chooser title: with one, react-native-blob-util starts the chooser without FLAG_ACTIVITY_NEW_TASK
  // and Android refuses it. Android still asks which app to use when more than one can open PDFs.
  const opened = await ReactNativeBlobUtil.android.actionViewIntent(path, 'application/pdf');
  if (opened === false) throw new ApiError('No app on this phone can open PDF files. Install a PDF viewer or use Save to Downloads.');
}

// Android's own share sheet for a file (android/.../filesharer/FileSharerModule.kt).
const { FileSharer } = NativeModules as {
  FileSharer?: { share(path: string, mimeType: string, title: string, message: string | null): Promise<boolean> };
};

/** Shares a PDF through the phone's share sheet (WhatsApp, Gmail, Bluetooth...), with a short message. */
export async function sharePdf(path: string, message?: string): Promise<void> {
  if (!FileSharer) throw new ApiError('Sharing needs the latest version of the app. Use Save to Downloads instead.');
  await FileSharer.share(path, 'application/pdf', 'Share quotation', message || null);
}

/** Copies a PDF into Downloads/BestServe, where WhatsApp and email can attach it. */
export async function saveToDownloads(path: string): Promise<void> {
  const name = path.split('/').pop() || 'Quotation.pdf';
  await ReactNativeBlobUtil.MediaCollection.copyToMediaStore(
    { name, parentFolder: 'BestServe', mimeType: 'application/pdf' } as unknown as Parameters<typeof ReactNativeBlobUtil.MediaCollection.copyToMediaStore>[0],
    'Download',
    path,
  );
}

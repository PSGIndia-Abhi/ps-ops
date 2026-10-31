import { httpClient } from '../api/httpClient';

/**
 * Site Audits API (backend/src/routes/audits.routes.js). Same endpoints the web
 * app uses, so a draft started on the phone can be finished on the web and back.
 */

export type RiskLevelCode = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type AuditStatus = 'IN_PROGRESS' | 'SUBMITTED' | 'AMENDING' | 'CANCELLED';
export type AreaStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';

export interface Lookups {
  riskLevels: { code: RiskLevelCode; label: string; severityRank: number; defaultDays: number | null; bucket: string; color: string }[];
  riskCategories: { code: string; label: string; chainStep: string | null }[];
  auditTypes: string[];
  targetPests: string[];
  languages: string[];
}

export interface SiteOption {
  companyId: string;
  companyName: string;
  siteId: string;
  siteName: string | null;
  siteAddress: string | null;
}

export interface AuditListItem {
  id: string;
  auditNumber: string;
  companyName: string;
  siteName: string | null;
  siteAddress: string | null;
  auditDate: string;
  auditorName: string | null;
  areasCompleted: number;
  areasTotal: number;
  nextAreaNumber: number | null;
  findings: number;
  overallRisk: RiskLevelCode | null;
  status: AuditStatus;
  lastSavedAt: string | null;
}

/** Counters for the Audits home (GET /api/audits/summary). */
export interface AuditSummary {
  inProgress: number;
  submitted: number;
  dueToday: number;
  doneThisMonth: number;
  /** Not submitted, audit date after today. */
  scheduled: number;
  /** Not submitted, audit date today or earlier. */
  inProgressNow: number;
  /** High / Critical findings due within 7 days (or overdue). */
  urgentFindings: number;
}

export interface Finding {
  id: string;
  areaId: string;
  findingNumber: number;
  title: string;
  riskCategory: string;
  riskTypeText: string | null;
  riskLevel: RiskLevelCode;
  actionWithinDays: number | null;
  actionDueDate: string | null;
  observationText: string | null;
  customerActionText: string | null;
  bestserveActionText: string | null;
  noPhotoReason: string | null;
  photos: { id: string; url: string; displayOrder: number; marked?: boolean; v?: string | null }[];
  voice: { id: string; fieldType: VoiceField; status: VoiceStatus; durationSeconds: number | null }[];
  rowVersion: number;
}

export interface Area {
  id: string;
  areaNumber: number;
  areaName: string;
  zoneName: string | null;
  notes: string | null;
  status: AreaStatus;
  savedAt: string | null;
  rowVersion: number;
  findings: Finding[];
}

export interface Audit {
  id: string;
  auditNumber: string;
  status: AuditStatus;
  rowVersion: number;
  company: { id: string; name: string | null };
  site: { id: string; name: string | null; address: string | null };
  auditDate: string;
  auditType: string;
  targetPests: string[];
  auditor: { id: number; name: string } | null;
  escort: { name: string | null; designation: string | null; contact: string | null };
  customerActionLabel: string;
  overallRisk: RiskLevelCode | null;
  counts: { areas: number; areasCompleted: number; findings: number; CRITICAL: number; HIGH: number; MEDIUM: number; LOW: number };
  areas: Area[];
  signoff: {
    receivedByName: string;
    receivedByDesignation: string | null;
    nextAuditDate: string | null;
    remarks: string | null;
  } | null;
  reportOptions: Record<string, boolean> | null;
  lastSavedAt: string | null;
}

export interface FindingInput {
  id: string;
  rowVersion?: number;
  title: string;
  riskCategory: string;
  riskTypeText?: string;
  riskLevel: RiskLevelCode;
  actionWithinDays?: number;
  observationText?: string;
  customerActionText?: string;
  bestserveActionText?: string;
}

export interface SaveAreaResult {
  area: { id: string; areaNumber: number; status: AreaStatus; rowVersion: number; savedAt: string };
  findings: { id: string; findingNumber: number; actionDueDate: string | null; rowVersion: number }[];
  missing: string[];
}

export interface Readiness {
  ready: boolean;
  blockers: { code: string; message: string }[];
  warnings: { code: string; message: string }[];
}

const get = async <T>(url: string, params?: Record<string, unknown>) => (await httpClient.get<T>(url, { params })).data;

export const auditsApi = {
  lookups: () => get<Lookups>('/api/audits/lookups'),
  siteOptions: (q: string) => get<{ items: SiteOption[] }>('/api/audits/site-options', { q }),
  areaSuggestions: (siteId: string) =>
    get<{ fromAuditNumber: string | null; zones: string[]; areas: { areaName: string; zoneName: string | null }[] }>(
      '/api/audits/area-suggestions',
      { siteId },
    ),
  list: (params: { status?: string; mine?: string; pageSize?: number; q?: string; urgent?: string; from?: string; to?: string }) =>
    get<{ items: AuditListItem[]; total: number }>('/api/audits', params),
  summary: () => get<AuditSummary>('/api/audits/summary'),
  get: (id: string) => get<Audit>(`/api/audits/${id}`),
  create: async (body: Record<string, unknown>) =>
    (await httpClient.post<{ id: string; auditNumber: string }>('/api/audits', body)).data,
  /** Change the audit details (date, types, pests, escort). */
  update: async (id: string, body: Record<string, unknown>) =>
    (await httpClient.patch(`/api/audits/${id}`, body)).data,
  addAreas: async (id: string, areas: { id: string; areaName: string; zoneName?: string | null }[]) =>
    (await httpClient.post<{ areas: { id: string; areaNumber?: number; rowVersion: number }[] }>(`/api/audits/${id}/areas`, { areas })).data,
  saveArea: async (
    id: string,
    areaId: string,
    body: { rowVersion: number; areaName: string; zoneName?: string; targetPests?: string[]; notes?: string; markCompleted: boolean; findings: FindingInput[]; removedFindingIds: string[] },
  ) => (await httpClient.put<SaveAreaResult>(`/api/audits/${id}/areas/${areaId}`, body)).data,
  saveSignoff: async (id: string, body: Record<string, unknown>) =>
    (await httpClient.put(`/api/audits/${id}/signoff`, body)).data,
  readiness: (id: string, excludeNotStarted: boolean) =>
    get<Readiness>(`/api/audits/${id}/readiness`, excludeNotStarted ? { excludeNotStartedAreas: '1' } : undefined),
  submit: async (id: string, body: { rowVersion: number; excludeNotStartedAreas: boolean }) =>
    (await httpClient.post(`/api/audits/${id}/submit`, body)).data,

  /** Multipart upload of one photo or recording; `fileId` (made on the phone) makes retries safe. */
  uploadFile: async (
    id: string,
    file: { uri: string; name: string; type: string },
    fields: Record<string, string | number | undefined>,
  ) => {
    const form = new FormData();
    form.append('file', { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
    Object.entries(fields).forEach(([k, v]) => {
      if (v !== undefined && v !== null) form.append(k, String(v));
    });
    return (
      await httpClient.post<UploadedFile>(`/api/audits/${id}/files`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
      })
    ).data;
  },
  /** Site walkthrough: one recording for many areas -> the areas and findings the AI found (not saved yet). */
  walkthrough: async (id: string, file: { uri: string; name: string; type: string }) => {
    const form = new FormData();
    form.append('file', { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
    form.append('sourceLanguage', 'auto');
    return (
      await httpClient.post<{ areas: WalkthroughArea[]; detectedLanguage: string | null }>(`/api/audits/${id}/walkthrough`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 240000,
      })
    ).data;
  },
  /** Removes an area that has no evidence yet (the server refuses areas with photos or voice notes). */
  removeArea: async (id: string, areaId: string) => {
    await httpClient.delete(`/api/audits/${id}/areas/${areaId}`);
  },
  deletePhoto: async (id: string, photoId: string) => {
    await httpClient.delete(`/api/audits/${id}/photos/${photoId}`);
  },
  /** Circles, arrows, pen lines and labels drawn on a photo (points are 0-1 fractions of the photo). */
  getPhotoMarks: (id: string, photoId: string) => get<{ marks: PhotoMark[] }>(`/api/audits/${id}/photos/${photoId}/marks`),
  /** Saves the marks; the server draws them on a copy of the photo. An empty list goes back to the original. */
  savePhotoMarks: async (id: string, photoId: string, marks: PhotoMark[]) =>
    (await httpClient.put<UploadedPhoto>(`/api/audits/${id}/photos/${photoId}/marks`, { marks }, { timeout: 60000 })).data,
  getVoice: (id: string, voiceId: string) => get<VoiceNote>(`/api/audits/${id}/voice/${voiceId}`),
  retryVoice: async (id: string, voiceId: string, sourceLanguage?: string) =>
    (await httpClient.post<VoiceNote>(`/api/audits/${id}/voice/${voiceId}/process`, { sourceLanguage })).data,
  acceptVoice: async (id: string, voiceId: string, acceptedText: string, manual = false) =>
    (
      await httpClient.post<{ voice: VoiceNote; finding: { id: string; rowVersion: number } }>(
        `/api/audits/${id}/voice/${voiceId}/accept`,
        { acceptedText, manual },
      )
    ).data,
};

export interface AuditReport {
  id: string;
  version: number;
  status: 'QUEUED' | 'GENERATING' | 'GENERATED' | 'FAILED';
  pageCount: number | null;
  sizeBytes: number | null;
  generatedAt: string | null;
  error: string | null;
  fileUrl: string | null;
}

export const reportsApi = {
  list: (auditId: string) => get<{ items: AuditReport[] }>(`/api/audits/${auditId}/reports`),
  retry: async (auditId: string, reportId: string) => {
    await httpClient.post(`/api/audits/${auditId}/reports/${reportId}/retry`);
  },
};

export type VoiceField ='OBSERVATION' | 'CUSTOMER_ACTION' | 'BESTSERVE_ACTION';
export type VoiceStatus = 'UPLOADED' | 'QUEUED' | 'PROCESSING' | 'REVIEW_REQUIRED' | 'ACCEPTED' | 'FAILED' | 'MANUAL';

export interface VoiceNote {
  id: string;
  kind: 'VOICE';
  findingId: string;
  fieldType: VoiceField;
  status: VoiceStatus;
  sourceLanguage: string | null;
  detectedLanguage: string | null;
  transcript: string | null;
  englishDraft: string | null;
  acceptedText: string | null;
  /** "All in one" recording: the three parts Gemini split it into. */
  combined?: boolean;
  parts?: {
    observation: string; customerAction: string; bestserveAction: string;
    // Also read from the recording (empty when not said): area, zone, problem and a suggested risk.
    areaName?: string; zoneName?: string; targetPests?: string[]; title?: string; riskCategory?: string; riskLevel?: string; fixWithinDays?: number | null;
  } | null;
  durationSeconds: number | null;
  attempts: number;
  error: string | null;
  audioUrl: string;
}

export interface UploadedPhoto {
  id: string;
  kind: 'PHOTO';
  findingId: string;
  url: string;
  width: number | null;
  height: number | null;
  displayOrder: number;
  /** Drawn on by the supervisor; `v` changes with every save (reloads the picture). */
  marked?: boolean;
  v?: string | null;
}

export interface PhotoMark {
  t: 'circle' | 'arrow' | 'pen' | 'text';
  c: string;
  p: [number, number][];
  s?: string;
}

export type UploadedFile = UploadedPhoto | VoiceNote;

/** One area the AI found in a site walkthrough recording (empty strings when not said). */
export interface WalkthroughArea {
  areaName: string;
  zoneName: string;
  findings: {
    title: string;
    riskCategory: string;
    riskLevel: string;
    fixWithinDays: number | null;
    observation: string;
    customerAction: string;
    bestserveAction: string;
  }[];
}

/**
 * Ids for new areas and findings are made on the phone, so a save that is
 * retried after a network drop never creates a duplicate.
 */
export function newId(): string {
  const bytes = new Uint8Array(16);
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  // UUID v4 version/variant bits: bit operations are the point here.
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // eslint-disable-line no-bitwise
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // eslint-disable-line no-bitwise
  const h = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

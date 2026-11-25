import { Platform } from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { httpClient, ApiError } from '../api/httpClient';
import { getToken } from '../auth/tokenStorage';
import { API_BASE_URL } from '../config/env';
import { APP_VERSION } from '../config/appVersion';

/**
 * Helpdesk - the same backend as the web's Help button and Desk (backend/src/routes/helpdesk.routes.js).
 * Everyone except the technical team raises tickets; Technical Lead / Technical Team answer. The server
 * decides who is who and returns it in `summary().isAgent` and each ticket's `actions`.
 */

export type HelpdeskStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING_USER' | 'RESOLVED' | 'CLOSED';
export type HelpdeskPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export interface HelpdeskTicket {
  id: string;
  code: string;
  subject: string;
  status: HelpdeskStatus;
  priority: HelpdeskPriority;
  source: 'WEB' | 'APP';
  page: string | null;
  appVersion: string | null;
  device: string | null;
  raisedBy: { id: string; name: string | null; role: string | null };
  assignedTo: { id: string; name: string | null } | null;
  lastMessageAt: string;
  lastMessageBy: 'USER' | 'AGENT';
  lastMessagePreview?: string;
  unread?: boolean;
  reopenCount: number;
  createdAt: string;
}

export interface HelpdeskAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  isImage: boolean;
}

export interface HelpdeskMessage {
  id: string;
  kind: 'MESSAGE' | 'NOTE' | 'SYSTEM';
  body: string;
  createdAt: string;
  sender: { id: string; name: string | null; role: string | null } | null;
  side: 'USER' | 'AGENT' | 'SYSTEM';
  isMine: boolean;
  attachments: HelpdeskAttachment[];
}

export interface HelpdeskThread {
  ticket: HelpdeskTicket;
  messages: HelpdeskMessage[];
  actions: {
    reply: boolean;
    addNote: boolean;
    changeStatus: boolean;
    changePriority: boolean;
    assign: boolean;
    pickUp: boolean;
    confirmSolved: boolean;
    reopen: boolean;
  };
}

export interface HelpdeskSummary {
  isAgent: boolean;
  unread: number;
  open: number;
  /** Raisers: tickets waiting on them (needs reply / resolved). */
  waitingForYou?: number;
  /** Team only. */
  unassigned?: number;
  mine?: number;
  needsReply?: number;
}

export interface HelpdeskAgent {
  id: string;
  name: string;
  role: string;
}

/** A file picked on the phone (camera, gallery or file picker). */
export interface PickedFile {
  uri: string;
  name: string;
  type: string;
  size?: number;
}

export type TicketScope = 'all' | 'open' | 'closed' | 'unassigned' | 'mine';

export async function getSummary(): Promise<HelpdeskSummary> {
  const { data } = await httpClient.get('/api/helpdesk/summary');
  return data;
}

export async function listTickets(params: { scope?: TicketScope; q?: string; page?: number } = {}): Promise<{ tickets: HelpdeskTicket[]; page: number; hasMore: boolean }> {
  const { data } = await httpClient.get('/api/helpdesk/tickets', { params });
  return data;
}

export async function getTicket(id: string): Promise<HelpdeskThread> {
  const { data } = await httpClient.get(`/api/helpdesk/tickets/${id}`);
  return data;
}

function appendFiles(form: FormData, files: PickedFile[]) {
  // React Native's FormData streams this {uri,name,type} shape from the uri (same as api/jobs.ts).
  files.forEach((f) => form.append('files', { uri: f.uri, name: f.name, type: f.type } as unknown as Blob));
}

/** What the technical team sees with every ticket from the app, so they never have to ask. */
function deviceLine(): string {
  const c = (Platform.constants ?? {}) as { Brand?: string; Model?: string; Release?: string | number };
  const phone = [c.Brand, c.Model].filter(Boolean).join(' ');
  return `${phone || 'Android phone'} · Android ${c.Release ?? Platform.Version}`;
}

export async function createTicket(input: { message: string; files: PickedFile[]; from?: string }): Promise<HelpdeskThread> {
  const form = new FormData();
  form.append('message', input.message);
  form.append('source', 'APP');
  form.append('appVersion', APP_VERSION);
  form.append('device', deviceLine());
  if (input.from) form.append('page', input.from);
  appendFiles(form, input.files);
  const { data } = await httpClient.post('/api/helpdesk/tickets', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  });
  return data;
}

export async function sendMessage(id: string, input: { message: string; files: PickedFile[]; internal?: boolean }): Promise<HelpdeskThread> {
  const form = new FormData();
  form.append('message', input.message);
  if (input.internal) form.append('internal', 'true');
  appendFiles(form, input.files);
  const { data } = await httpClient.post(`/api/helpdesk/tickets/${id}/messages`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  });
  return data;
}

export async function confirmSolved(id: string): Promise<HelpdeskThread> {
  const { data } = await httpClient.post(`/api/helpdesk/tickets/${id}/confirm`);
  return data;
}

export async function reopenTicket(id: string, message?: string): Promise<HelpdeskThread> {
  const { data } = await httpClient.post(`/api/helpdesk/tickets/${id}/reopen`, { message: message || '' });
  return data;
}

/** Team only. `assignedTo`: "me", a user id, or null to unassign. */
export async function updateTicket(id: string, changes: { status?: HelpdeskStatus; priority?: HelpdeskPriority; assignedTo?: string | null }): Promise<HelpdeskThread> {
  const { data } = await httpClient.patch(`/api/helpdesk/tickets/${id}`, changes);
  return data;
}

export async function listAgents(): Promise<HelpdeskAgent[]> {
  const { data } = await httpClient.get('/api/helpdesk/agents');
  return data.agents;
}

/** The file's address - needs the login token (see attachmentHeaders). */
export const attachmentUri = (id: string) => `${API_BASE_URL}/api/helpdesk/attachments/${id}`;

export async function attachmentHeaders(): Promise<Record<string, string>> {
  const token = await getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Downloads a PDF (or other file) to the app's cache and opens it in the phone's viewer. */
export async function openAttachmentFile(file: HelpdeskAttachment): Promise<void> {
  const safe = file.name.replace(/[^\w.\- ]+/g, '_') || 'file';
  const target = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/helpdesk-${file.id}-${safe}`;
  const exists = await ReactNativeBlobUtil.fs.exists(target);
  if (!exists) {
    const res = await ReactNativeBlobUtil.config({ path: target, overwrite: true, timeout: 60000 }).fetch('GET', attachmentUri(file.id), await attachmentHeaders());
    const status = res.info().status;
    if (status < 200 || status >= 300) {
      await ReactNativeBlobUtil.fs.unlink(target).catch(() => undefined);
      throw new ApiError('Could not download the file.', status);
    }
  }
  const opened = await ReactNativeBlobUtil.android.actionViewIntent(target, file.mimeType || 'application/octet-stream');
  if (opened === false) throw new ApiError('No app on this phone can open this file.');
}

/** Same limits as the server. */
export const MAX_FILES = 5;
export const MAX_FILE_MB = 10;
const ALLOWED = /^(image\/(png|jpe?g|gif|webp|heic|heif)|application\/pdf)$/i;

export function checkFiles(current: PickedFile[], incoming: PickedFile[]): { files?: PickedFile[]; error?: string } {
  const next = [...current];
  for (const f of incoming) {
    if (!ALLOWED.test(f.type)) return { error: `"${f.name}" can't be attached - only photos and PDF files.` };
    if (f.size && f.size > MAX_FILE_MB * 1024 * 1024) return { error: `"${f.name}" is over ${MAX_FILE_MB} MB.` };
    next.push(f);
  }
  if (next.length > MAX_FILES) return { error: `You can attach up to ${MAX_FILES} files.` };
  return { files: next };
}

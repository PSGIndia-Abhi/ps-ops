// Helpdesk API calls (backend: /api/helpdesk, see backend/src/routes/helpdesk.routes.js).
import { apiFetch, safeJson } from "../api";

async function call(endpoint, options) {
  const res = await apiFetch(endpoint, options);
  if (!res) throw new Error("Not signed in");
  const data = await safeJson(res);
  if (!res.ok) throw new Error(data?.error || "Something went wrong. Please try again.");
  return data;
}

export const getSummary = () => call("/api/helpdesk/summary");

export function listTickets({ scope, q, priority, page } = {}) {
  const params = new URLSearchParams();
  if (scope) params.set("scope", scope);
  if (q) params.set("q", q);
  if (priority) params.set("priority", priority);
  if (page) params.set("page", String(page));
  return call(`/api/helpdesk/tickets?${params}`);
}

export const getTicket = (id) => call(`/api/helpdesk/tickets/${id}`);

// Context the technical team sees with every ticket, so they never have to ask.
function webContext() {
  const ua = navigator.userAgent;
  const browser =
    /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return {
    page: window.location.pathname + window.location.search,
    device: `${browser}${os ? ` on ${os}` : ""} · ${window.innerWidth}×${window.innerHeight}`,
  };
}

export function createTicket({ message, files }) {
  const form = new FormData();
  const ctx = webContext();
  form.append("message", message);
  form.append("source", "WEB");
  form.append("page", ctx.page);
  form.append("device", ctx.device);
  (files || []).forEach((f) => form.append("files", f));
  return call("/api/helpdesk/tickets", { method: "POST", body: form });
}

export function sendMessage(id, { message, files, internal }) {
  const form = new FormData();
  form.append("message", message || "");
  if (internal) form.append("internal", "true");
  (files || []).forEach((f) => form.append("files", f));
  return call(`/api/helpdesk/tickets/${id}/messages`, { method: "POST", body: form });
}

export const confirmSolved = (id) => call(`/api/helpdesk/tickets/${id}/confirm`, { method: "POST" });

export const reopenTicket = (id, message) =>
  call(`/api/helpdesk/tickets/${id}/reopen`, { method: "POST", body: JSON.stringify({ message: message || "" }) });

// Team only (used by the Desk).
export const updateTicket = (id, changes) =>
  call(`/api/helpdesk/tickets/${id}`, { method: "PATCH", body: JSON.stringify(changes) });

export const listAgents = () => call("/api/helpdesk/agents");

// Files need the login token, so they are fetched as blobs and shown through object URLs.
const blobCache = new Map();
export async function attachmentUrl(id) {
  if (blobCache.has(id)) return blobCache.get(id);
  const res = await apiFetch(`/api/helpdesk/attachments/${id}`);
  if (!res?.ok) throw new Error("Could not load the file");
  const url = URL.createObjectURL(await res.blob());
  blobCache.set(id, url);
  return url;
}

// Shared limits - the server enforces the same.
export const MAX_FILES = 5;
export const MAX_FILE_MB = 10;
export const ACCEPT = "image/png,image/jpeg,image/gif,image/webp,image/heic,image/heif,application/pdf";

export function checkFiles(current, incoming) {
  const ok = /^(image\/(png|jpe?g|gif|webp|heic|heif)|application\/pdf)$/i;
  const next = [...current];
  for (const f of incoming) {
    if (!ok.test(f.type)) return { error: `"${f.name}" can't be attached - only images and PDF files.` };
    if (f.size > MAX_FILE_MB * 1024 * 1024) return { error: `"${f.name}" is over ${MAX_FILE_MB} MB.` };
    next.push(f);
  }
  if (next.length > MAX_FILES) return { error: `You can attach up to ${MAX_FILES} files.` };
  return { files: next };
}

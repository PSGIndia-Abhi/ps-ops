import { apiFetch, safeJson } from "../../api";

// Error from the audit API, carrying its `code` (VERSION_CONFLICT, NOT_READY, ...)
// and any extra fields (blockers, server copy).
export class AuditApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.code = body?.code || null;
    this.body = body || {};
  }
}

async function request(path, { method = "GET", body } = {}) {
  const res = await apiFetch(`/api/audits${path}`, {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res) throw new AuditApiError("Not signed in", 401);
  if (res.status === 204) return null;
  const data = await safeJson(res);
  if (!res.ok) throw new AuditApiError(data?.error || `Request failed (${res.status})`, res.status, data);
  return data;
}

const qs = (params) => {
  const p = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") p.set(k, v);
  });
  const s = p.toString();
  return s ? `?${s}` : "";
};

export const auditsApi = {
  lookups: () => request("/lookups"),
  siteOptions: (q) => request(`/site-options${qs({ q })}`),
  areaSuggestions: (siteId) => request(`/area-suggestions${qs({ siteId })}`),
  summary: () => request("/summary"),
  auditors: () => request("/auditors"),
  list: (params) => request(`${qs(params)}`),
  get: (id) => request(`/${id}`),
  create: (body) => request("", { method: "POST", body }),
  update: (id, body) => request(`/${id}`, { method: "PATCH", body }),
  addAreas: (id, areas) => request(`/${id}/areas`, { method: "POST", body: { areas } }),
  saveArea: (id, areaId, body) => request(`/${id}/areas/${areaId}`, { method: "PUT", body }),
  removeArea: (id, areaId) => request(`/${id}/areas/${areaId}`, { method: "DELETE" }),
  saveSignoff: (id, body) => request(`/${id}/signoff`, { method: "PUT", body }),
  readiness: (id, excludeNotStarted) => request(`/${id}/readiness${qs({ excludeNotStartedAreas: excludeNotStarted ? "1" : "" })}`),
  submit: (id, body) => request(`/${id}/submit`, { method: "POST", body }),
  history: (id) => request(`/${id}/history`),
  deletePhoto: (id, photoId) => request(`/${id}/photos/${photoId}`, { method: "DELETE" }),
  /** Circles, arrows, pen lines and labels drawn on a photo (0-1 fractions of the photo). */
  getPhotoMarks: (id, photoId) => request(`/${id}/photos/${photoId}/marks`),
  /** Saves the marks; the server draws them on a copy of the photo. An empty list goes back to the original. */
  savePhotoMarks: (id, photoId, marks) => request(`/${id}/photos/${photoId}/marks`, { method: "PUT", body: { marks } }),
  /** Uploads one photo to a finding (JPEG, PNG or WebP, up to 15 MB). */
  uploadPhoto: async (id, findingId, file) => {
    const form = new FormData();
    form.append("file", file, file.name);
    form.append("kind", "PHOTO");
    form.append("fileId", newId());
    form.append("findingId", findingId);
    if (file.lastModified) form.append("capturedAt", new Date(file.lastModified).toISOString());
    const res = await apiFetch(`/api/audits/${id}/files`, { method: "POST", body: form });
    if (!res) throw new AuditApiError("Not signed in", 401);
    const data = await safeJson(res);
    if (!res.ok) throw new AuditApiError(data?.error || `Upload failed (${res.status})`, res.status, data);
    return data;
  },
};

// Area / finding ids are made by the client so a retried save never duplicates.
export function newId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = new Uint8Array(16);
  (typeof crypto !== "undefined" ? crypto : window.crypto).getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Downloads an audit's PDF: the final report when it is ready, otherwise a draft
 * preview made from the audit as it is now (marked DRAFT on every page).
 * Returns "final" or "draft".
 */
/** "<Customer>-AuditReport-<year>.pdf" (+ "-v2" for later versions, "-draft" for previews). */
export function reportFileName(customer, auditDate, { version = 1, draft = false } = {}) {
  const name = String(customer || "Audit").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "Audit";
  const year = String(auditDate || "").slice(0, 4) || String(new Date().getFullYear());
  return `${name}-AuditReport-${year}${version > 1 ? `-v${version}` : ""}${draft ? "-draft" : ""}.pdf`;
}

export async function downloadAuditPdf(auditId, customer, auditDate) {
  let path = `/api/audits/${auditId}/report-preview`;
  let name = reportFileName(customer, auditDate, { draft: true });
  let kind = "draft";
  try {
    const { items } = await request(`/${auditId}/reports`);
    const latest = items?.[0];
    if (latest?.status === "GENERATED") {
      path = `/api/audits/${auditId}/reports/${latest.id}/file?download=1`;
      name = reportFileName(customer, auditDate, { version: latest.version });
      kind = "final";
    }
  } catch {
    // no report list: fall back to the draft preview
  }
  const res = await apiFetch(path);
  if (!res || !res.ok) throw new AuditApiError("Could not download the PDF", res?.status || 0);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return kind;
}

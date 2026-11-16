import { useCallback, useEffect, useState } from "react";
import { apiFetch, safeJson } from "../../api";

// Calls to the Invoice Generation API (/api/billing, see backend/src/routes/billing.routes.js).

export class ApiError extends Error {
  constructor(message, status, errors) {
    super(message);
    this.status = status;
    this.errors = errors || [];
  }
}

async function request(method, path, body) {
  const res = await apiFetch(`/api/billing${path}`, {
    method,
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });
  if (!res) throw new ApiError("You need to log in again", 401);
  const data = await safeJson(res);
  if (!res.ok) throw new ApiError(data?.error || `Request failed (${res.status})`, res.status, data?.errors);
  return data;
}

export const billingGet = (path) => request("GET", path);
export const billingPost = (path, body) => request("POST", path, body ?? {});
export const billingPut = (path, body) => request("PUT", path, body ?? {});
export const billingDelete = (path) => request("DELETE", path);
export const billingUpload = (path, formData) => request("POST", path, formData);

/** "?a=1&b=2" from an object, leaving out empty values. */
export function qs(params) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) if (v !== undefined && v !== null && v !== "" && v !== false) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Opens a PDF from the API in a new tab (the request needs the login token, so it is fetched first). */
export async function openPdf(path) {
  const tab = window.open("", "_blank");
  try {
    const res = await apiFetch(`/api/billing${path}`);
    if (!res) throw new ApiError("You need to log in again", 401);
    if (!res.ok) throw new ApiError((await safeJson(res))?.error || "Could not open the PDF", res.status);
    const url = URL.createObjectURL(await res.blob());
    if (tab) tab.location.href = url;
    else window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (err) {
    tab?.close();
    throw err;
  }
}

/**
 * Loads `path` (null = nothing to load) and reloads when it changes.
 * Returns { data, error, loading, reload, setData }.
 */
export function useBilling(path) {
  const [tick, setTick] = useState(0);
  const key = path ? `${path}#${tick}` : null;
  const [state, setState] = useState({ key: null, data: null, error: "" });
  useEffect(() => {
    if (!key) return undefined;
    let live = true;
    billingGet(path)
      .then((data) => live && setState({ key, data, error: "" }))
      .catch((err) => live && setState((s) => ({ key, data: s.data, error: err.message })));
    return () => {
      live = false;
    };
  }, [key, path]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  const setData = useCallback((updater) => setState((s) => ({ ...s, data: typeof updater === "function" ? updater(s.data) : updater })), []);
  // While a new path loads, the previous data stays on screen (loading = true).
  return { data: path ? state.data : null, error: state.error, loading: Boolean(key) && state.key !== key, reload, setData };
}

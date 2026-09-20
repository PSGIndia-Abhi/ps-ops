import { apiFetch, safeJson } from "../../api";

// Remembers the import being reviewed, so the Review & Validate tab still shows it after a refresh
// or when opened from the sidebar. Storage can be blocked, so every call is guarded.
const KEY = "accountant.invoiceImportId";

export function rememberImportId(id) {
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch {
    // storage unavailable: the id in the URL still works
  }
}

export function recallImportId() {
  try {
    return localStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
}

// Saves a file returned by the API. Returns an error message, or null when it worked.
export async function downloadFile(url, fallbackName) {
  const res = await apiFetch(url);
  if (!res) return "You need to log in again";
  if (!res.ok) return (await safeJson(res))?.error || "Download failed";
  const disposition = res.headers.get("Content-Disposition") || "";
  const name = /filename="?([^";]+)"?/.exec(disposition)?.[1] || fallbackName;
  const href = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = href;
  link.download = name;
  link.click();
  URL.revokeObjectURL(href);
  return null;
}

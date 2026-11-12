import { apiFetch } from "../api";

// Fetches a portal file with the login token, then opens it in a new tab or saves it.
// Call it straight from a click handler so the new tab is not blocked as a popup.
export async function getPortalFile(path, { download = false, name = "document" } = {}) {
  const preview = download ? null : window.open("", "_blank");
  try {
    const res = await apiFetch(`${path}${download ? "?download=1" : ""}`);
    if (!res?.ok) throw new Error("Could not open the file");
    const url = URL.createObjectURL(await res.blob());
    if (download) {
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } else if (preview) {
      preview.location.href = url;
    } else {
      window.location.href = url;
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (err) {
    if (preview) preview.close();
    throw err;
  }
}

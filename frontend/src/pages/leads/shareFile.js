// Sharing helpers for the quotation PDF (the panel is ShareQuotation.jsx).

/** Downloads a File under its own name. */
export function download(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** India mobile number for wa.me: 10 digits -> 91XXXXXXXXXX. */
export const waNumber = (phone) => {
  const d = String(phone || "").replace(/\D/g, "");
  return d.length === 10 ? `91${d}` : d;
};

/**
 * Opens the system share sheet with the file. Returns false when this browser cannot share files
 * (the caller then shows ShareFallback). Throws only real failures; a cancelled share is fine.
 */
export async function shareFile(file, { title, text }) {
  if (!navigator.canShare || !navigator.canShare({ files: [file] })) return false;
  try {
    await navigator.share({ files: [file], title, text });
  } catch (err) {
    if (err?.name !== "AbortError") throw err;
  }
  return true;
}

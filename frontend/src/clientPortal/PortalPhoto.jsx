import { useEffect, useState } from "react";
import { FiFile, FiImage } from "react-icons/fi";
import { apiFetch } from "../api";

// Loads a client-portal attachment with the login token and shows it.
// Images render as thumbnails; other files show a file tile. Click calls onOpen(url, attachment).
// `attachment.path` overrides the default job-photo endpoint (e.g. complaint files).
export default function PortalPhoto({ attachment, onOpen }) {
  const path = attachment.path || `/api/client-portal/attachments/${encodeURIComponent(attachment.id)}`;
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  const isImage = String(attachment.file_type || "").startsWith("image/") || attachment.type === "IMAGE";

  useEffect(() => {
    let objectUrl = null;
    let cancelled = false;
    async function load() {
      try {
        const res = await apiFetch(path);
        if (!res?.ok) throw new Error("failed");
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setUrl(objectUrl);
      } catch {
        if (!cancelled) setFailed(true);
      }
    }
    load();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  if (failed) {
    return <div className="cp-photo cp-photo-missing" title="Could not load file"><FiImage aria-hidden="true" /></div>;
  }
  if (!url) return <div className="cp-photo cp-skeleton" />;

  if (!isImage) {
    return (
      <a className="cp-photo cp-photo-file" href={url} target="_blank" rel="noreferrer" download={attachment.file_name || undefined}>
        <FiFile aria-hidden="true" />
        <span>{attachment.file_name || "File"}</span>
      </a>
    );
  }

  return (
    <button type="button" className="cp-photo" onClick={() => onOpen?.(url, attachment)} aria-label={`Open ${attachment.file_name || "photo"}`}>
      <img src={url} alt={attachment.file_name || "Service photo"} loading="lazy" />
    </button>
  );
}

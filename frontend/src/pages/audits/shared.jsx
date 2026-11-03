import { useEffect, useState } from "react";
import { apiFetch } from "../../api";
import { AUDIT_STATUS, RISK_CLS, RISK_LABEL, titleCase } from "./format";

// Audit photos sit behind the login token, so <img src> cannot load them
// directly: fetch with the token, then show the blob.
export function AuthImage({ path, alt, className, onClick }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let url = null;
    let alive = true;
    apiFetch(path).then(async (res) => {
      if (!alive || !res?.ok) return;
      url = URL.createObjectURL(await res.blob());
      setSrc(url);
    }).catch(() => {});
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [path]);
  if (!src) return <div className={`${className || ""} au-img-loading`} />;
  return <img src={src} alt={alt} className={className} onClick={onClick} />;
}

export function StatusPill({ status, map = AUDIT_STATUS }) {
  const s = map[status] || { label: titleCase(status), cls: "au-pill-grey" };
  return <span className={`au-pill ${s.cls}`}>{s.label}</span>;
}

export function RiskBadge({ level }) {
  if (!level) return <span className="au-muted">—</span>;
  return <span className={`au-risk ${RISK_CLS[level] || ""}`}>{RISK_LABEL[level] || level}</span>;
}

export function Modal({ title, onClose, children, footer, wide }) {
  return (
    <div className="au-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`au-modal ${wide ? "au-modal-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="au-modal-head">
          <h3>{title}</h3>
          <button type="button" className="au-icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="au-modal-body">{children}</div>
        {footer && <div className="au-modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

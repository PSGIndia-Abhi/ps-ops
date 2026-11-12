import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { FiShield, FiEye, FiDownload, FiRefreshCw, FiX } from "react-icons/fi";
import { apiFetch, safeJson } from "../api";
import { formatDate, RISK_STYLE } from "./portalUtils";
import { getPortalFile } from "./portalFiles";

// Audit reports made by our supervisors (the generated PDF of each submitted audit).
export default function PortalAudits() {
  const { portal, outletId } = useOutletContext();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fileError, setFileError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const q = new URLSearchParams({ kind: "audit", page_size: "100" });
        if (outletId) q.set("site_id", outletId);
        const res = await apiFetch(`/api/client-portal/documents?${q}`);
        const body = await safeJson(res);
        if (!res?.ok) throw new Error(body?.error || "Failed to load audit reports");
        if (!cancelled) {
          setReports(body.documents || []);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [outletId, reloadKey]);

  async function open(report, download) {
    setBusy(`${report.id}:${download ? "d" : "v"}`);
    setFileError(null);
    try {
      const name = `${report.title.replace(/[^\w.-]+/g, "_")}-${report.site_name || "outlet"}.pdf`;
      await getPortalFile(report.download, { download, name });
    } catch (err) {
      setFileError(err.message);
    } finally {
      setBusy(null);
    }
  }

  const outletName = outletId ? portal.outlets.find((o) => o.id === outletId)?.name : null;

  return (
    <div className="cp-page">
      <section className="cp-hero">
        <div>
          <h2>Audit reports</h2>
          <p>{outletName ? `Showing ${outletName}` : "All outlets"} · site audit reports prepared by our supervisors</p>
        </div>
      </section>

      {error && <div className="cp-alert">{error}<button className="cp-btn cp-btn-ghost" onClick={() => setReloadKey((n) => n + 1)}><FiRefreshCw /> Retry</button></div>}
      {fileError && <div className="cp-alert">{fileError}<button className="cp-icon-btn" onClick={() => setFileError(null)} aria-label="Dismiss"><FiX /></button></div>}

      {loading && reports.length === 0 ? (
        <div className="cp-audit-grid">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="cp-card cp-skeleton" style={{ minHeight: 150 }} />)}</div>
      ) : reports.length === 0 ? (
        <div className="cp-card cp-empty-state">
          <FiShield aria-hidden="true" />
          <strong>No audit reports yet</strong>
          <span>When our supervisor completes a site audit, the report will appear here.</span>
        </div>
      ) : (
        <div className="cp-audit-grid">
          {reports.map((r) => {
            const risk = RISK_STYLE[String(r.risk || "").toUpperCase()];
            return (
              <article key={r.id} className="cp-card cp-audit-card">
                <div className="cp-audit-top">
                  <span className="cp-doc-icon kind-audit-icon"><FiShield aria-hidden="true" /></span>
                  <div className="cp-outlet-title">
                    <strong>{r.site_name || "Outlet"}</strong>
                    <small>{formatDate(r.date)}{r.audit_number ? ` · ${r.audit_number}` : ""}</small>
                  </div>
                  {risk && <span className={`cp-risk ${risk.className}`}>{risk.label} risk</span>}
                </div>
                <dl className="cp-audit-facts">
                  <div><dt>Report</dt><dd>{r.title}</dd></div>
                  {r.audit_type && <div><dt>Type</dt><dd>{r.audit_type}</dd></div>}
                  {r.auditor && <div><dt>Audited by</dt><dd>{r.auditor}</dd></div>}
                  {r.page_count ? <div><dt>Pages</dt><dd>{r.page_count}</dd></div> : null}
                </dl>
                <div className="cp-audit-actions">
                  <button className="cp-btn" onClick={() => open(r, false)} disabled={!!busy}>
                    <FiEye /> {busy === `${r.id}:v` ? "Opening…" : "View report"}
                  </button>
                  <button className="cp-btn cp-btn-ghost" onClick={() => open(r, true)} disabled={!!busy}>
                    <FiDownload /> {busy === `${r.id}:d` ? "…" : "Download"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { auditsApi, downloadAuditPdf, reportFileName } from "./auditsApi";
import { apiFetch } from "../../api";
import AreaEditorModal from "./AreaEditorModal";
import MarkPhotoModal from "./MarkPhotoModal";
import useMe from "../../hooks/useMe";
import { AuthImage, Modal, RiskBadge, StatusPill } from "./shared";
import { AREA_STATUS, AUDIT_TYPE_LABEL, fmtDate, fmtDateTime, titleCase, useAuditBase } from "./format";
import "./audits.css";

/**
 * The audit's PDF report: made by the server a few seconds after Submit.
 * Polls while it is being made; then downloads it with the session token.
 */
function ReportButton({ audit, onRefresh }) {
  const report = (audit.reports || [])[0];
  const making = report && (report.status === "QUEUED" || report.status === "GENERATING");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!making) return undefined;
    const t = setInterval(onRefresh, 3000);
    return () => clearInterval(t);
  }, [making, onRefresh]);

  // Not submitted yet (or no report row): download a draft preview of the PDF instead.
  if (audit.status !== "SUBMITTED" || !report) {
    return (
      <button
        type="button"
        className="au-btn au-btn-small au-btn-outline"
        disabled={busy}
        title={error || "Draft PDF made from what is entered so far (marked DRAFT)"}
        onClick={async () => {
          setBusy(true);
          setError("");
          try { await downloadAuditPdf(audit.id, audit.company?.name, audit.auditDate); } catch (err) { setError(err.message); } finally { setBusy(false); }
        }}
      >
        {busy ? "Downloading…" : error ? "Download failed – retry" : "↓ Draft PDF"}
      </button>
    );
  }
  if (making) return <button type="button" className="au-btn au-btn-small" disabled>Making report…</button>;
  if (report.status === "FAILED") {
    return (
      <button
        type="button"
        className="au-btn au-btn-small"
        onClick={async () => {
          await apiFetch(`/api/audits/${audit.id}/reports/${report.id}/retry`, { method: "POST" });
          onRefresh();
        }}
      >
        Report failed – try again
      </button>
    );
  }

  async function download() {
    setBusy(true);
    setError("");
    try {
      const res = await apiFetch(`/api/audits/${audit.id}/reports/${report.id}/file?download=1`);
      if (!res || !res.ok) throw new Error("Could not download the report");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = reportFileName(audit.company?.name, audit.auditDate, { version: report.version });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className="au-btn au-btn-primary au-btn-small" onClick={download} disabled={busy} title={error || `${report.pageCount || ""} pages`}>
      {busy ? "Downloading…" : error ? "Download failed – retry" : "↓ Download Report (PDF)"}
    </button>
  );
}

const TABS = ["Summary", "Areas & Findings", "Photos & Evidence", "Actions", "Sign Off", "History"];

export default function AuditDetail() {
  const { auditId } = useParams();
  const navigate = useNavigate();
  const base = useAuditBase();
  const [audit, setAudit] = useState(null);
  const [lookups, setLookups] = useState(null);
  const [tab, setTab] = useState("Summary");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null); // null | "new" | area
  const [showSubmit, setShowSubmit] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  const load = useCallback(() => auditsApi.get(auditId)
    .then((data) => { setAudit(data); setError(""); })
    .catch((err) => setError(err.status === 404 ? "Audit not found, or you do not have access to it." : err.message)),
  [auditId]);

  useEffect(() => {
    auditsApi.get(auditId)
      .then((data) => { setAudit(data); setError(""); })
      .catch((err) => setError(err.status === 404 ? "Audit not found, or you do not have access to it." : err.message));
  }, [auditId]);
  useEffect(() => { auditsApi.lookups().then(setLookups).catch(() => {}); }, []);

  if (error && !audit) {
    return (
      <div className="au-page">
        <button type="button" className="au-back" onClick={() => navigate(base)}>← Audits</button>
        <div className="au-error">{error}</div>
      </div>
    );
  }
  if (!audit) return <div className="au-page"><div className="au-muted">Loading audit…</div></div>;

  const editable = ["IN_PROGRESS", "AMENDING"].includes(audit.status);
  const c = audit.counts;
  const pct = c.areas ? Math.round((c.areasCompleted / c.areas) * 100) : 0;

  return (
    <div className="au-page">
      <button type="button" className="au-back" onClick={() => navigate(base)}>← Audits</button>

      <div className="au-card au-detail-card">
        <div className="au-detail-head">
          <h2>Audit Details – {audit.auditNumber}</h2>
          <div className="au-head-actions">
            <StatusPill status={audit.status} />
            <ReportButton audit={audit} onRefresh={load} />
            {editable && (
              <button type="button" className="au-btn au-btn-primary au-btn-small" onClick={() => setShowSubmit(true)}>Review & Submit</button>
            )}
          </div>
        </div>

        <div className="au-tabs au-tabs-line">
          {TABS.map((t) => (
            <button key={t} type="button" className={`au-tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>

        {tab === "Summary" && (
          <div className="au-stack au-pad">
            <div className="au-summary-grid">
              <div className="au-summary-info">
                <Info label="Customer" value={audit.company.name} />
                <Info label="Auditor" value={audit.auditor?.name} />
                <Info label="Site" value={`${audit.site.name || ""}${audit.site.address ? ` · ${audit.site.address}` : ""}`} />
                <Info label="Escort person" value={audit.escort.name ? `${audit.escort.name}${audit.escort.designation ? ` (${audit.escort.designation})` : ""}` : "—"} />
                <Info label="Audit Date" value={fmtDate(audit.auditDate)} />
                <div className="au-info">
                  <span>Overall Site Risk</span>
                  <div><RiskBadge level={audit.overallRisk} />
                    {audit.riskOverride && <span className="au-muted"> (set manually: {audit.riskOverride.reason})</span>}
                  </div>
                </div>
                <Info label="Target Pest" value={(audit.targetPests || []).map(titleCase).join(", ")} />
                <Info label="Audit Type"
                  value={(audit.auditTypes || [audit.auditType]).map((t) => AUDIT_TYPE_LABEL[t] || (/^[A-Z_]+$/.test(t) ? titleCase(t) : t)).join(", ")} />
              </div>
              {editable && (
                <button type="button" className="au-btn au-btn-small au-edit-btn" onClick={() => setShowEdit(true)}>✎ Edit</button>
              )}
            </div>

            <div className="au-risk-tiles">
              <div className="au-rtile"><span className="au-rtile-icon au-ic-total" aria-hidden="true">☰</span><div><strong>{c.findings}</strong><small>Total Findings</small></div></div>
              <div className="au-rtile"><span className="au-rtile-icon au-ic-high" aria-hidden="true">▲</span><div><strong>{c.CRITICAL + c.HIGH}</strong><small>High Risk</small></div></div>
              <div className="au-rtile"><span className="au-rtile-icon au-ic-med" aria-hidden="true">●</span><div><strong>{c.MEDIUM}</strong><small>Medium Risk</small></div></div>
              <div className="au-rtile"><span className="au-rtile-icon au-ic-low" aria-hidden="true">✓</span><div><strong>{c.LOW}</strong><small>Low Risk</small></div></div>
            </div>

            <div className="au-completion">
              <span className="au-strong">Area Completion</span>
              <div className="au-progress au-grow"><div style={{ width: `${pct}%` }} /></div>
              <span className="au-strong">{pct}%</span>
            </div>
            <div className="au-muted au-right">{c.areasCompleted} of {c.areas} areas completed · last saved {fmtDateTime(audit.lastSavedAt)}</div>
            {audit.siteNotes && <div><div className="au-label">Site notes</div>{audit.siteNotes}</div>}
          </div>
        )}
      </div>

      {tab === "Areas & Findings" && (
        <div className="au-stack">
          {editable && (
            <div><button type="button" className="au-btn au-btn-primary" onClick={() => setEditing("new")}>+ Add area</button></div>
          )}
          {!audit.areas.length && <div className="au-card au-empty">No areas yet.</div>}
          {audit.areas.map((a) => (
            <AreaCard key={a.id} area={a} audit={audit} editable={editable}
              onEdit={() => setEditing(a)}
              onRemove={async () => {
                if (!window.confirm(`Remove empty area "${a.areaName}"?`)) return;
                try { await auditsApi.removeArea(audit.id, a.id); load(); } catch (err) { alert(err.message); }
              }} />
          ))}
        </div>
      )}

      {tab === "Photos & Evidence" && (
        <PhotosPanel audit={audit} editable={editable} onChanged={load} onAddArea={() => setEditing("new")} />
      )}
      {tab === "Actions" && (
        <ActionsPanel audit={audit} editable={editable} onEditArea={(a) => setEditing(a)} onAddArea={() => setEditing("new")} />
      )}
      {tab === "Sign Off" && <SignoffPanel audit={audit} editable={editable} onSaved={load} />}
      {tab === "History" && <HistoryPanel auditId={audit.id} />}

      {/* Waits for the lookups: the known audit types decide what shows under "Other". */}
      {showEdit && lookups && (
        <EditAuditModal audit={audit} lookups={lookups} onClose={() => setShowEdit(false)}
          onSaved={() => { setShowEdit(false); load(); }} />
      )}

      {editing && (
        <AreaEditorModal
          audit={audit}
          area={editing === "new" ? null : editing}
          lookups={lookups}
          onClose={() => setEditing(null)}
          onSaved={(close) => { load(); if (close) setEditing(null); }}
        />
      )}
      {showSubmit && (
        <SubmitModal audit={audit} onClose={() => setShowSubmit(false)} onSubmitted={() => { setShowSubmit(false); load(); }} />
      )}
    </div>
  );
}

// Opens the full-size photo in a new tab (fetched with the login token).
async function apiOpen(path) {
  const win = window.open("", "_blank");
  const res = await apiFetch(path);
  if (!res?.ok) { win?.close(); return; }
  const url = URL.createObjectURL(await res.blob());
  if (win) win.location.href = url;
}

function Info({ label, value }) {
  return <div className="au-info"><span>{label}</span><div>{value || "—"}</div></div>;
}

function AreaCard({ area, audit, editable, onEdit, onRemove }) {
  const label = audit.customerActionLabel || "Customer action";
  return (
    <div className="au-card">
      <div className="au-area-head">
        <div className="au-area-no">{String(area.areaNumber).padStart(2, "0")}</div>
        <div className="au-grow">
          <div className="au-strong">{area.areaName}</div>
          <div className="au-muted">{area.zoneName ? `Pest: ${area.zoneName}` : "No target pest"} · saved {fmtDateTime(area.savedAt)}</div>
        </div>
        <StatusPill status={area.status} map={AREA_STATUS} />
        {editable && <button type="button" className="au-btn au-btn-small" onClick={onEdit}>{area.status === "NOT_STARTED" ? "Inspect" : "Edit"}</button>}
        {editable && area.status === "NOT_STARTED" && !area.findings.length && (
          <button type="button" className="au-btn au-btn-small au-btn-ghost-danger" onClick={onRemove}>Remove</button>
        )}
      </div>
      {area.findings.map((f) => (
        <div key={f.id} className="au-finding-view">
          <div className="au-finding-title">
            <span className="au-mono">{String(f.findingNumber).padStart(2, "0")}</span>
            <span className="au-strong">{f.title}</span>
            <RiskBadge level={f.riskLevel} />
            <span className="au-muted">{titleCase(f.riskCategory)}{f.actionDueDate ? ` · due ${fmtDate(f.actionDueDate)}` : ""}</span>
          </div>
          {f.photos.length > 0 && (
            <div className="au-photos">
              {f.photos.map((p) => (
                <AuthImage key={p.id} path={`${p.url}?size=thumb`} alt={f.title} className="au-photo"
                  onClick={() => apiOpen(p.url)} />
              ))}
            </div>
          )}
          {f.voice.length > 0 && (
            <div className="au-muted">
              Voice notes: {f.voice.map((v) => `${titleCase(v.fieldType)} (${titleCase(v.status)})`).join(" · ")}
            </div>
          )}
          <div className="au-grid3 au-finding-cols">
            <div><div className="au-label">Observed</div>{f.observationText || <span className="au-muted">—</span>}</div>
            <div><div className="au-label">{label}</div>{f.customerActionText || <span className="au-muted">—</span>}</div>
            <div><div className="au-label">BestServe action</div>{f.bestserveActionText || <span className="au-muted">—</span>}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SignoffPanel({ audit, editable, onSaved }) {
  const s = audit.signoff;
  const [form, setForm] = useState({
    receivedByName: s?.receivedByName || "",
    receivedByDesignation: s?.receivedByDesignation || "",
    nextAuditDate: s?.nextAuditDate || "",
    remarks: s?.remarks || "",
    reportOptions: { riskChain: true, riskByZone: true, priority: true, ipmCycle: true, ...(audit.reportOptions || {}) },
  });
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // "Report received by" not filled yet: the logged-in supervisor (can be changed).
  const { user: me } = useMe();
  useEffect(() => {
    if (me?.name && editable && !s?.receivedByName) setForm((f) => (f.receivedByName ? f : { ...f, receivedByName: me.name }));
  }, [me?.name, editable, s?.receivedByName]);

  const opt = (k) => (e) => setForm((f) => ({ ...f, reportOptions: { ...f.reportOptions, [k]: e.target.checked } }));

  async function save(e) {
    e.preventDefault();
    setMsg(""); setError(""); setSaving(true);
    try {
      await auditsApi.saveSignoff(audit.id, { ...form, nextAuditDate: form.nextAuditDate || null });
      setMsg("Sign-off saved");
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="au-card au-pad au-form" onSubmit={save}>
      <div className="au-grid2">
        <Info label="Auditor" value={audit.auditor?.name} />
        <Info label="Escort person" value={audit.escort.name} />
        <div className="au-field">
          <label>Report received by (name) *</label>
          <input className="au-input" disabled={!editable} value={form.receivedByName} maxLength={150}
            onChange={(e) => setForm({ ...form, receivedByName: e.target.value })} />
        </div>
        <div className="au-field">
          <label>Designation</label>
          <input className="au-input" disabled={!editable} value={form.receivedByDesignation} maxLength={100}
            onChange={(e) => setForm({ ...form, receivedByDesignation: e.target.value })} />
        </div>
        <div className="au-field">
          <label>Next audit date</label>
          {/* Earlier days than this audit's date cannot be picked. */}
          <input type="date" className="au-input" disabled={!editable} value={form.nextAuditDate} min={audit.auditDate || undefined}
            onChange={(e) => setForm({ ...form, nextAuditDate: e.target.value })} />
        </div>
        <div className="au-field">
          <label>Remarks</label>
          <input className="au-input" disabled={!editable} value={form.remarks} maxLength={500}
            onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
        </div>
      </div>
      <div className="au-field">
        <label>Optional report pages</label>
        <div className="au-chips">
          {[["riskChain", "Risk chain"], ["riskByZone", "Risks in each area"], ["priority", "This week's priority"], ["ipmCycle", "IPM cycle"]].map(([k, l]) => (
            <label key={k} className="au-check"><input type="checkbox" disabled={!editable} checked={!!form.reportOptions[k]} onChange={opt(k)} /> {l}</label>
          ))}
        </div>
      </div>
      {editable && (
        <div><button type="submit" className="au-btn au-btn-primary" disabled={saving}>{saving ? "Saving…" : "Save sign-off"}</button></div>
      )}
      {msg && <div className="au-ok">{msg}</div>}
      {error && <div className="au-error">{error}</div>}
    </form>
  );
}

function HistoryPanel({ auditId }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    auditsApi.history(auditId).then((r) => setItems(r.items)).catch((e) => setError(e.message));
  }, [auditId]);
  if (error) return <div className="au-error">{error}</div>;
  if (!items) return <div className="au-muted">Loading history…</div>;
  return (
    <div className="au-card">
      <table className="au-table">
        <thead><tr><th>When</th><th>Who</th><th>What</th><th>Details</th></tr></thead>
        <tbody>
          {items.map((h) => (
            <tr key={h.id}>
              <td className="au-nowrap">{fmtDateTime(h.at)}</td>
              <td>{h.by?.name || "—"}</td>
              <td><span className={`au-pill ${h.action === "HANDOVER" ? "au-pill-amber" : "au-pill-grey"}`}>{titleCase(h.action)}</span></td>
              <td>{h.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SubmitModal({ audit, onClose, onSubmitted }) {
  const [excludeNotStarted, setExcludeNotStarted] = useState(true);
  const [check, setCheck] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    auditsApi.readiness(audit.id, excludeNotStarted).then(setCheck).catch((e) => setError(e.message));
  }, [audit.id, excludeNotStarted]);

  async function submit() {
    setBusy(true); setError("");
    try {
      await auditsApi.submit(audit.id, { rowVersion: audit.rowVersion, excludeNotStartedAreas: excludeNotStarted });
      onSubmitted();
    } catch (err) {
      setError(err.code === "VERSION_CONFLICT" ? "The audit changed since you opened it. Close and reopen it, then submit again." : err.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Review & submit"
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="au-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="au-btn au-btn-primary" disabled={!check?.ready || busy} onClick={submit}>
            {busy ? "Submitting…" : "Submit audit"}
          </button>
        </>
      )}
    >
      <div className="au-form">
        <label className="au-check">
          <input type="checkbox" checked={excludeNotStarted} onChange={(e) => { setCheck(null); setExcludeNotStarted(e.target.checked); }} />
          Leave out areas that were never started
        </label>
        {!check && !error && <div className="au-muted">Checking…</div>}
        {check?.ready && <div className="au-ok">Ready to submit. After submitting, the audit is locked.</div>}
        {check && !check.ready && (
          <div className="au-warn">
            Fix these before submitting:
            <ul>{check.blockers.map((b, i) => <li key={i}>{b.message}</li>)}</ul>
          </div>
        )}
        {check?.warnings?.length > 0 && (
          <ul className="au-muted">{check.warnings.map((w, i) => <li key={i}>{w.message}</li>)}</ul>
        )}
        {error && <div className="au-error">{error}</div>}
      </div>
    </Modal>
  );
}

// "No findings yet": photos and actions belong to a finding, so the first step is an area.
function NoFindings({ editable, onAddArea, what }) {
  return (
    <div className="au-card au-empty">
      <div>No findings yet. Add an area with a finding, then {what}.</div>
      {editable && <button type="button" className="au-btn au-btn-primary au-mt8" onClick={onAddArea}>+ Add area</button>}
    </div>
  );
}

// Photos per finding: upload from the computer, open full size (new tab), remove (before submit).
function PhotosPanel({ audit, editable, onChanged, onAddArea }) {
  const groups = audit.areas.flatMap((a) => a.findings.map((f) => ({ area: a, f })));
  const [busy, setBusy] = useState(null); // finding id being uploaded to
  const [progress, setProgress] = useState("");
  const [error, setError] = useState(null);
  const [target, setTarget] = useState(""); // finding chosen in the top "Upload from computer" bar
  const [toMark, setToMark] = useState(null); // photo open in "Mark the photo"

  if (!groups.length) return <NoFindings editable={editable} onAddArea={onAddArea} what="add its photos here (or choose photos while adding the area)" />;
  const targetId = target || groups[0].f.id;

  async function upload(findingId, fileList) {
    const files = [...(fileList || [])];
    if (!files.length) return;
    setError(null);
    setBusy(findingId);
    const failed = [];
    for (let i = 0; i < files.length; i++) {
      setProgress(`Uploading ${i + 1} of ${files.length}…`);
      try {
        await auditsApi.uploadPhoto(audit.id, findingId, files[i]);
      } catch (err) {
        failed.push(`${files[i].name}: ${err.message}`);
      }
    }
    setBusy(null);
    setProgress("");
    if (failed.length) setError(failed.join(" · "));
    onChanged();
  }

  async function remove(p) {
    if (!window.confirm("Remove this photo from the report? The original stays saved as evidence.")) return;
    try {
      await auditsApi.deletePhoto(audit.id, p.id);
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="au-stack">
      {editable && (
        <div className="au-card au-pad au-upload-bar">
          <span className="au-strong">Upload from computer</span>
          <select className="au-input au-upload-select" value={targetId} onChange={(e) => setTarget(e.target.value)} disabled={!!busy}>
            {groups.map(({ area, f }) => (
              <option key={f.id} value={f.id}>
                Finding {String(f.findingNumber).padStart(2, "0")} · {area.areaName}{f.title ? ` · ${f.title}` : ""}
              </option>
            ))}
          </select>
          <label className={`au-btn au-btn-primary ${busy ? "au-disabled" : ""}`}>
            {busy === targetId ? progress : "⬆ Choose photos"}
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden disabled={!!busy}
              onChange={(e) => { upload(targetId, e.target.files); e.target.value = ""; }} />
          </label>
          <button type="button" className="au-btn" onClick={onAddArea} disabled={!!busy}>+ Add area</button>
        </div>
      )}
      {error && <div className="au-error">{error}</div>}
      {groups.map(({ area, f }) => (
        <div key={f.id} className="au-card au-pad">
          <div className="au-finding-title">
            <span className="au-mono">{String(f.findingNumber).padStart(2, "0")}</span>
            <span className="au-strong">{f.title}</span>
            <RiskBadge level={f.riskLevel} />
            <span className="au-muted">{area.areaName}{area.zoneName ? ` · ${area.zoneName}` : ""}</span>
          </div>
          <div className="au-photos au-mt8">
            {f.photos.map((p) => (
              <div key={p.id} className="au-photo-box">
                <AuthImage path={`${p.url}?size=thumb${p.v ? `&v=${p.v}` : ""}`} alt={f.title} className="au-photo au-photo-lg" onClick={() => apiOpen(`${p.url}?v=${p.v || 0}`)} />
                {p.marked && <span className="au-photo-tag au-photo-marked">Marked</span>}
                <div className="au-photo-actions">
                  <button type="button" className="au-btn au-btn-small" onClick={() => apiOpen(`${p.url}?v=${p.v || 0}`)}>Open</button>
                  {editable && (
                    <button type="button" className="au-btn au-btn-small au-btn-outline" onClick={() => setToMark(p)}>{p.marked ? "✎ Edit" : "✎ Mark"}</button>
                  )}
                  {editable && <button type="button" className="au-btn au-btn-small au-btn-ghost-danger" onClick={() => remove(p)}>Remove</button>}
                </div>
              </div>
            ))}
            {!f.photos.length && <div className="au-muted">No photos for this finding yet.</div>}
          </div>
          {editable && (
            <div className="au-mt8">
              <label className={`au-btn au-btn-small au-btn-dashed ${busy ? "au-disabled" : ""}`}>
                {busy === f.id ? progress : "+ Upload photos"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  hidden
                  disabled={!!busy}
                  onChange={(e) => { upload(f.id, e.target.files); e.target.value = ""; }}
                />
              </label>
              <span className="au-muted au-ml8">JPEG, PNG or WebP · up to 15 MB each</span>
            </div>
          )}
        </div>
      ))}
      {toMark && (
        <MarkPhotoModal audit={audit} photo={toMark} onClose={() => setToMark(null)}
          onSaved={() => { setToMark(null); onChanged(); }} />
      )}
    </div>
  );
}

// Every finding's customer action, BestServe action and deadline in one table; "Edit" opens the area editor.
function ActionsPanel({ audit, editable, onEditArea, onAddArea }) {
  const rows = audit.areas.flatMap((a) => a.findings.map((f) => ({ area: a, f })));
  const label = audit.customerActionLabel || "Customer action";
  if (!rows.length) return <NoFindings editable={editable} onAddArea={onAddArea} what="write its actions here" />;
  return (
    <div className="au-stack">
    {editable && <div><button type="button" className="au-btn au-btn-primary" onClick={onAddArea}>+ Add area</button></div>}
    <div className="au-card au-table-wrap">
      <table className="au-table">
        <thead>
          <tr><th>No.</th><th>Area / Finding</th><th>Risk</th><th>{label}</th><th>BestServe action</th><th>Due</th>{editable && <th />}</tr>
        </thead>
        <tbody>
          {rows.map(({ area, f }) => (
            <tr key={f.id}>
              <td className="au-mono">{String(f.findingNumber).padStart(2, "0")}</td>
              <td>
                <div className="au-strong">{f.title}</div>
                <div className="au-muted">{area.areaName}{area.zoneName ? ` · ${area.zoneName}` : ""}</div>
              </td>
              <td><RiskBadge level={f.riskLevel} /></td>
              <td>{f.customerActionText || <span className="au-muted">—</span>}</td>
              <td>{f.bestserveActionText || <span className="au-muted">—</span>}</td>
              <td className="au-nowrap">{f.actionDueDate ? fmtDate(f.actionDueDate) : "Monitor"}</td>
              {editable && (
                <td><button type="button" className="au-btn au-btn-small au-btn-outline" onClick={() => onEditArea(area)}>Edit</button></td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </div>
  );
}

// Edit the audit header (before submit only).
function EditAuditModal({ audit, lookups, onClose, onSaved }) {
  const [form, setForm] = useState({
    auditDate: audit.auditDate,
    escortName: audit.escort.name || "",
    escortDesignation: audit.escort.designation || "",
    escortContact: audit.escort.contact || "",
    customerActionLabel: audit.customerActionLabel || "Customer action",
    siteNotes: audit.siteNotes || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  // Audit types (one or more), the same as the mobile app; a typed type is shown under "Other".
  const knownTypes = (lookups?.auditTypes || []).filter((t) => t !== "OTHER");
  const savedTypes = String(audit.auditType || "").split(",").map((t) => t.trim()).filter(Boolean);
  const customType = savedTypes.find((t) => !knownTypes.includes(t));
  const [auditTypes, setAuditTypes] = useState(() => [...savedTypes.filter((t) => knownTypes.includes(t)), ...(customType ? ["OTHER"] : [])]);
  // An old type code that is no longer offered is shown (and saved) as its name under "Other".
  const [otherType, setOtherType] = useState(() => (customType ? (AUDIT_TYPE_LABEL[customType] || customType).slice(0, 20) : ""));
  const otherTypeOn = auditTypes.includes("OTHER");
  const toggleType = (t) => setAuditTypes((list) => (list.includes(t) ? list.filter((x) => x !== t) : [...list, t]));

  async function save() {
    setError("");
    if (!auditTypes.length) return setError("Choose at least one audit type");
    if (otherTypeOn && !otherType.trim()) return setError("Type the other audit type");
    setSaving(true);
    try {
      const auditType = [...auditTypes.filter((t) => t !== "OTHER"), ...(otherTypeOn ? [otherType.trim()] : [])];
      await auditsApi.update(audit.id, { rowVersion: audit.rowVersion, ...form, auditType });
      onSaved();
    } catch (err) {
      setError(err.code === "VERSION_CONFLICT" ? "The audit changed since you opened it. Close this and try again." : err.message);
      setSaving(false);
    }
  }

  return (
    <Modal title="Edit audit details" onClose={onClose} footer={(
      <>
        <button type="button" className="au-btn" onClick={onClose}>Cancel</button>
        <button type="button" className="au-btn au-btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
      </>
    )}>
      <div className="au-form">
        {error && <div className="au-error">{error}</div>}
        <div className="au-grid2">
          <div className="au-field"><label>Audit date</label>
            <input type="date" className="au-input" value={form.auditDate} onChange={set("auditDate")} /></div>
          <div className="au-field"><label>Customer action label (in report)</label>
            <input className="au-input" value={form.customerActionLabel} onChange={set("customerActionLabel")} maxLength={40} /></div>
          <div className="au-field"><label>Escort person (optional)</label>
            <input className="au-input" value={form.escortName} onChange={set("escortName")} maxLength={150} /></div>
          <div className="au-field"><label>Designation</label>
            <input className="au-input" value={form.escortDesignation} onChange={set("escortDesignation")} maxLength={100} /></div>
          <div className="au-field"><label>Contact number</label>
            <input className="au-input" value={form.escortContact} onChange={set("escortContact")} maxLength={20} /></div>
        </div>
        <div className="au-field"><label>Audit type * <span className="au-muted">(one or more)</span></label>
          <div className="au-chips">
            {knownTypes.map((t) => (
              <button type="button" key={t} className={`au-chip ${auditTypes.includes(t) ? "active" : ""}`} onClick={() => toggleType(t)}>
                {AUDIT_TYPE_LABEL[t] || titleCase(t)}
              </button>
            ))}
            <button type="button" className={`au-chip ${otherTypeOn ? "active" : ""}`} onClick={() => toggleType("OTHER")}>
              {otherTypeOn ? "Other ✓" : "＋ Other"}
            </button>
          </div>
          {otherTypeOn && (
            <input className="au-input au-mt8" value={otherType} onChange={(e) => setOtherType(e.target.value)} maxLength={20}
              placeholder="Type the other audit type, e.g. Fumigation" />
          )}
        </div>
        <div className="au-field"><label>Site notes</label>
          <textarea className="au-input" rows={2} value={form.siteNotes} onChange={set("siteNotes")} /></div>
      </div>
    </Modal>
  );
}

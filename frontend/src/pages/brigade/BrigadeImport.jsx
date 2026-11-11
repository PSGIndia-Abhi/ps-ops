import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ConfirmDialog from "../../components/ConfirmDialog";
import { checkImportFile, formatDate, listImports, startImportFile, undoImport } from "./brigadeShared";
import KpiTile from "./KpiTile";
import "./brigade.css";

// Brigade bulk import (/brigade/import): the client's Excel tracker (one sheet per
// property, one row per flat) into BestServe.
//   1. Choose the file -> Check: nothing is saved; every sheet is matched to a
//      property, site and requested-by contact, and every problem is listed.
//   2. Fix the Excel (or the mapping) and check again until there are no errors.
//   3. Import: completed services become completed jobs, services still to do go to
//      Pending. It runs in the background; an import can be undone from the history.
export default function BrigadeImport() {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [mapping, setMapping] = useState({});
  const [report, setReport] = useState(null);
  const [checkedMapping, setCheckedMapping] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [confirmImport, setConfirmImport] = useState(false);
  const [starting, setStarting] = useState(false);
  const [history, setHistory] = useState([]);
  const [undoTarget, setUndoTarget] = useState(null);
  const [notice, setNotice] = useState("");

  const loadHistory = useCallback(() => {
    listImports()
      .then((rows) => setHistory(Array.isArray(rows) ? rows : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Poll while an import is running.
  const running = history.find((h) => h.status === "RUNNING");
  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(loadHistory, 2000);
    return () => clearInterval(t);
  }, [running, loadHistory]);

  function pickFile(e) {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setReport(null);
    setMapping({});
    setCheckedMapping("");
    setError("");
    setNotice("");
  }

  async function runCheck(useMapping = mapping) {
    if (!file) return;
    setChecking(true);
    setError("");
    setNotice("");
    try {
      const data = await checkImportFile(file, useMapping);
      const next = {};
      for (const s of data.sheets) if (s.is_project) next[s.name] = s.mapping;
      setReport(data);
      setMapping(next);
      setCheckedMapping(JSON.stringify(next));
    } catch (err) {
      setReport(null);
      setError(err.message || "Could not check the file");
    } finally {
      setChecking(false);
    }
  }

  async function runImport() {
    setConfirmImport(false);
    setStarting(true);
    setError("");
    try {
      await startImportFile(file, mapping);
      setNotice("Import started. You can follow it below; it keeps running if you leave this page.");
      setReport(null);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      loadHistory();
    } catch (err) {
      if (err.data?.totals) setReport((r) => ({ ...r, ...err.data }));
      setError(err.message || "Could not start the import");
    } finally {
      setStarting(false);
    }
  }

  async function runUndo() {
    const target = undoTarget;
    setUndoTarget(null);
    setError("");
    try {
      const res = await undoImport(target.id);
      setNotice(`Import undone: removed ${res.removed.jobs} jobs and ${res.removed.pending} Pending flats.`);
      loadHistory();
    } catch (err) {
      setError(err.message || "Could not undo the import");
    }
  }

  const dirty = report && JSON.stringify(mapping) !== checkedMapping;
  const totals = report?.totals;
  const canImport = Boolean(report?.can_import) && !dirty && !running && !starting;

  return (
    <div className="bg-page bgb">
      <div className="bgb-topbar">
        <div>
          <h2 className="bgb-h1">Import from Excel</h2>
          <p className="bgb-lede">
            Bring existing Brigade work from the project tracker into BestServe. One sheet per property, one row per flat.
            "Yes" means the service is done and becomes a completed job; a service listed in PO Items but not marked Yes goes to
            Pending. Checking saves nothing.
          </p>
        </div>
      </div>

      {error && <div className="bg-error">{error}</div>}
      {notice && <div className="bgx-notice">{notice}</div>}

      <section className="bgb-sheet bgx-step">
        <div className="bgx-step-head">
          <span className="bgx-step-no">1</span>
          <div>
            <h3>Choose the Excel file</h3>
            <p>The .xlsx tracker as the client keeps it. Filters and hidden rows are ignored: every row is read.</p>
          </div>
        </div>
        <div className="bgx-file-row">
          <input ref={inputRef} type="file" accept=".xlsx" onChange={pickFile} aria-label="Excel file" />
          <button type="button" className="primary" disabled={!file || checking} onClick={() => runCheck({})}>
            {checking && !report ? "Checking…" : report ? "Check from scratch" : "Check file"}
          </button>
        </div>
      </section>

      {report && (
        <>
          <section className="bgk-grid" aria-label="Check summary">
            <KpiTile icon="home" tone="blue" label="Flats" value={totals.flats} note={`${totals.sheets} sheet${totals.sheets === 1 ? "" : "s"} · ${totals.nothing_to_import} with nothing to import`} />
            <KpiTile icon="check" tone="green" label="Completed jobs" value={totals.completed} note={totals.already ? `${totals.already} already in BestServe - skipped` : "New completed jobs"} />
            <KpiTile icon="calendar" tone="violet" label="To Pending" value={totals.pending_flats} note={`${totals.pending_services} service${totals.pending_services === 1 ? "" : "s"} still to do`} />
            <KpiTile
              icon="alert"
              tone={totals.errors ? "red" : totals.warnings ? "amber" : "green"}
              label="Errors · warnings"
              value={`${totals.errors} · ${totals.warnings}`}
              note={totals.errors ? "Fix the errors, then check again" : "No errors - warnings do not block"}
              noteTone={totals.errors ? "bad" : undefined}
            />
          </section>

          <SheetMapping report={report} mapping={mapping} setMapping={setMapping} dirty={dirty} checking={checking} onRecheck={() => runCheck(mapping)} />

          <Issues issues={report.issues} fileName={report.file_name} />

          <section className="bgb-sheet bgx-step">
            <div className="bgx-step-head">
              <span className="bgx-step-no">4</span>
              <div>
                <h3>Import</h3>
                <p>
                  {dirty
                    ? "The sheet matching changed - check again before importing."
                    : totals.errors
                      ? `Fix the ${totals.errors} error${totals.errors === 1 ? "" : "s"} in the Excel and check again. Nothing is imported while there are errors.`
                      : !report.can_import
                        ? "Nothing new to import."
                        : `Creates ${totals.completed} completed job${totals.completed === 1 ? "" : "s"} and ${totals.pending_flats} Pending flat${totals.pending_flats === 1 ? "" : "s"}. No notifications are sent.`}
                </p>
              </div>
              <button type="button" className="primary bgx-import-btn" disabled={!canImport} onClick={() => setConfirmImport(true)}>
                {starting ? "Starting…" : "Import"}
              </button>
            </div>
          </section>
        </>
      )}

      <ImportHistory history={history} onUndo={setUndoTarget} />

      <ConfirmDialog
        open={confirmImport}
        title="Import this file?"
        message={totals ? `This creates ${totals.completed} completed jobs and ${totals.pending_flats} Pending flats from ${report.file_name}. You can undo it from the import history until any of it is invoiced or scheduled.` : ""}
        confirmLabel="Yes, import"
        onConfirm={runImport}
        onCancel={() => setConfirmImport(false)}
      />
      <ConfirmDialog
        open={Boolean(undoTarget)}
        title="Undo this import?"
        message={undoTarget ? `This removes the ${undoTarget.counts.jobs} jobs and ${undoTarget.counts.pending} Pending flats created by ${undoTarget.file_name}. It cannot be undone.` : ""}
        confirmLabel="Yes, undo import"
        onConfirm={runUndo}
        onCancel={() => setUndoTarget(null)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Step 2: which property, site and contact each sheet belongs to     */
/* ------------------------------------------------------------------ */

function SheetMapping({ report, mapping, setMapping, dirty, checking, onRecheck }) {
  const options = report.options || [];
  const projectSheets = report.sheets.filter((s) => s.is_project);
  const otherSheets = report.sheets.filter((s) => !s.is_project);

  function change(sheet, patch) {
    setMapping((m) => {
      const cur = { ...m[sheet], ...patch };
      // A new property picks its only site / contact; a new site picks its only contact.
      if ("company_id" in patch) {
        const company = options.find((c) => String(c.id) === String(cur.company_id));
        cur.site_id = company?.sites.length === 1 ? company.sites[0].id : "";
        cur.contact_id = "";
      }
      if ("company_id" in patch || "site_id" in patch) {
        const site = options.find((c) => String(c.id) === String(cur.company_id))?.sites.find((s) => String(s.id) === String(cur.site_id));
        cur.contact_id = site?.contacts.length === 1 ? site.contacts[0].id : "";
      }
      return { ...m, [sheet]: cur };
    });
  }

  return (
    <section className="bgb-sheet bgx-step">
      <div className="bgx-step-head">
        <span className="bgx-step-no">2</span>
        <div>
          <h3>Match each sheet to a property</h3>
          <p>Guessed from the sheet name. A property, site or contact that is missing must be added first (Companies / Contacts).</p>
        </div>
        <button type="button" className={dirty ? "primary" : "bgb-btn-ghost"} disabled={checking} onClick={onRecheck}>
          {checking ? "Checking…" : "Check again"}
        </button>
      </div>
      <div className="bg-table-wrap">
        <table className="bgb-ledger bgx-map">
          <thead>
            <tr>
              <th>Sheet</th>
              <th>Property</th>
              <th>Site</th>
              <th>Requested by</th>
              <th className="num">Flats</th>
              <th className="num">Completed</th>
              <th className="num">Pending</th>
              <th className="num">Errors</th>
              <th className="num">Warnings</th>
              <th>Import</th>
            </tr>
          </thead>
          <tbody>
            {projectSheets.map((s) => {
              const m = mapping[s.name] || {};
              const company = options.find((c) => String(c.id) === String(m.company_id));
              const site = company?.sites.find((x) => String(x.id) === String(m.site_id));
              const skip = Boolean(m.skip);
              return (
                <Fragment key={s.name}>
                <tr className={`${skip ? "bgx-muted" : ""} ${s.notes?.length && !skip ? "bgx-has-notes" : ""}`}>
                  <td><strong>{s.name}</strong></td>
                  <td>
                    <select value={m.company_id || ""} disabled={skip} onChange={(e) => change(s.name, { company_id: e.target.value })} aria-label={`Property for ${s.name}`}>
                      <option value="">Choose…</option>
                      {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </td>
                  <td>
                    <select value={m.site_id || ""} disabled={skip || !company} onChange={(e) => change(s.name, { site_id: e.target.value })} aria-label={`Site for ${s.name}`}>
                      <option value="">Choose…</option>
                      {(company?.sites || []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </select>
                  </td>
                  <td>
                    <select value={m.contact_id || ""} disabled={skip || !site} onChange={(e) => change(s.name, { contact_id: e.target.value })} aria-label={`Requested by for ${s.name}`}>
                      <option value="">Choose…</option>
                      {(site?.contacts || []).map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</option>)}
                    </select>
                  </td>
                  <td className="num">{s.flats}</td>
                  <td className="num">{skip ? "—" : s.completed}</td>
                  <td className="num">{skip ? "—" : s.pending_flats}</td>
                  <td className={`num ${s.errors ? "bgx-bad" : ""}`}>{skip ? "—" : s.errors}</td>
                  <td className={`num ${s.warnings ? "bgx-warn" : ""}`}>{skip ? "—" : s.warnings}</td>
                  <td>
                    <input
                      type="checkbox"
                      className="bgx-skip"
                      checked={!skip}
                      onChange={(e) => change(s.name, { skip: !e.target.checked })}
                      aria-label={`Import sheet ${s.name}`}
                      title={skip ? "Skipped - tick to import this sheet" : "Untick to skip this sheet"}
                    />
                  </td>
                </tr>
                {s.notes?.length > 0 && !skip && (
                  <tr className="bgx-notes-row">
                    <td />
                    <td colSpan={9}>{s.notes.join(" · ")}</td>
                  </tr>
                )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {otherSheets.length > 0 && (
        <p className="bgx-other">
          Not imported: {otherSheets.map((s) => s.name).join(", ")} - no Flat No and service columns, so not a project sheet.
        </p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Step 3: problems, grouped by kind                                  */
/* ------------------------------------------------------------------ */

// "Flat L-0136 is in this sheet 2 times (rows 12, 40)" -> one group for every duplicate.
const groupKey = (msg) =>
  msg
    .replace(/(?<!like )[A-Z]-\d{4}/g, "…")
    .replace(/\(rows [\d, ]+\)/, "")
    .replace(/\d+ times/, "more than once")
    .replace(/"[^"]*" (could not be read|is not Yes)/, "$1")
    .replace(/date "[^"]*"/, "date")
    .replace(/\("[^"]*"\)/, "")
    .replace(/PO "[^"]*"/, "PO")
    .replace(/Flat number "[^"]*"/, "Flat number")
    .trim();

function Issues({ issues, fileName }) {
  const [level, setLevel] = useState(issues.some((i) => i.level === "error") ? "error" : "warning");
  const [open, setOpen] = useState(null);
  const counts = { error: issues.filter((i) => i.level === "error").length, warning: issues.filter((i) => i.level === "warning").length };

  const groups = useMemo(() => {
    const map = new Map();
    for (const i of issues.filter((x) => x.level === level)) {
      const k = groupKey(i.message);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(i);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [issues, level]);

  function download() {
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [["Level", "Sheet", "Row", "Flat", "Problem"].join(",")];
    for (const i of issues) lines.push([i.level, i.sheet, i.row ?? "", i.flat ?? "", i.message].map(esc).join(","));
    const url = URL.createObjectURL(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `Import problems - ${fileName.replace(/\.xlsx$/i, "")}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  return (
    <section className="bgb-sheet bgx-step">
      <div className="bgx-step-head">
        <span className="bgx-step-no">3</span>
        <div>
          <h3>Problems in the file</h3>
          <p>Errors stop the import - fix them in the Excel. Warnings are imported as described.</p>
        </div>
        <button type="button" className="bgb-btn-ghost" disabled={!issues.length} onClick={download}>
          Download list (.csv)
        </button>
      </div>
      <div className="bgb-sheet-toolbar">
        <div className="bgb-tabs" role="tablist" aria-label="Problem level">
          {[["error", "Errors"], ["warning", "Warnings"]].map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={level === key} className={`bgb-tab ${level === key ? "active" : ""}`} onClick={() => { setLevel(key); setOpen(null); }}>
              {label}
              <span>{counts[key]}</span>
            </button>
          ))}
        </div>
      </div>
      {!groups.length ? (
        <div className="bg-empty-state">
          <strong>{level === "error" ? "No errors" : "No warnings"}</strong>
          {level === "error" ? "The file can be imported." : "Nothing to note."}
        </div>
      ) : (
        <ul className="bgx-groups">
          {groups.map(([key, rows]) => (
            <li key={key} className={`bgx-group is-${level}`}>
              <button type="button" className="bgx-group-head" aria-expanded={open === key} onClick={() => setOpen(open === key ? null : key)}>
                <span className="bgx-count">{rows.length}</span>
                <span className="bgx-msg">{rows.length === 1 ? rows[0].message : key}</span>
                <span className="bgx-chev" aria-hidden="true">{open === key ? "▴" : "▾"}</span>
              </button>
              {open === key && (
                <div className="bgx-rows-wrap">
                  <table className="bgx-rows">
                    <thead>
                      <tr>
                        <th>Sheet</th>
                        <th className="num">Excel row</th>
                        <th>Flat</th>
                        {rows.some((i) => i.message !== rows[0].message) && <th>Detail</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 300).map((i, n) => (
                        <tr key={`${i.sheet}-${i.row}-${n}`}>
                          <td>{i.sheet}</td>
                          <td className="num">{i.row ?? "—"}</td>
                          <td>{i.flat ?? "—"}</td>
                          {rows.some((x) => x.message !== rows[0].message) && <td>{i.message}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {rows.length > 300 && <div className="bgx-more">Showing 300 of {rows.length}. Download the list for all of them.</div>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Import history, progress and undo                                  */
/* ------------------------------------------------------------------ */

const STATUS_LABEL = { RUNNING: "Running", DONE: "Done", FAILED: "Failed", UNDONE: "Undone" };

function ImportHistory({ history, onUndo }) {
  if (!history.length) return null;
  return (
    <section className="bgb-sheet bgx-step">
      <div className="bgx-step-head">
        <div>
          <h3>Import history</h3>
          <p>An import can be undone while none of its jobs is invoiced and none of its Pending flats is scheduled.</p>
        </div>
      </div>
      <div className="bg-table-wrap">
        <table className="bgb-ledger">
          <thead>
            <tr>
              <th>File</th>
              <th>Started</th>
              <th>By</th>
              <th>Status</th>
              <th className="num">Completed jobs</th>
              <th className="num">Pending flats</th>
              <th>Notes</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {history.map((h) => {
              const s = h.summary || {};
              const pct = s.flats_total ? Math.round((100 * (s.flats_done || 0)) / s.flats_total) : 0;
              return (
                <tr key={h.id}>
                  <td><strong>{h.file_name}</strong></td>
                  <td>{formatDate(h.created_at)}</td>
                  <td>{h.created_by || "—"}</td>
                  <td>
                    <span className={`bgx-status ${h.status.toLowerCase()}`}>{STATUS_LABEL[h.status] || h.status}</span>
                    {h.status === "RUNNING" && (
                      <div className="bgx-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                        <span style={{ width: `${pct}%` }} />
                        <em>{s.flats_done || 0} / {s.flats_total || 0} flats</em>
                      </div>
                    )}
                  </td>
                  <td className="num">{h.counts.jobs}</td>
                  <td className="num">{h.counts.pending}</td>
                  <td className="bgx-small">
                    {h.status === "FAILED" && h.error}
                    {s.failed?.length > 0 && `${s.failed.length} flat${s.failed.length === 1 ? "" : "s"} failed: ${s.failed.slice(0, 3).map((f) => `${f.sheet} ${f.flat}`).join(", ")}${s.failed.length > 3 ? "…" : ""}`}
                    {h.status === "UNDONE" && `Undone ${formatDate(h.undone_at)}${h.undone_by ? ` by ${h.undone_by}` : ""}`}
                  </td>
                  <td className="num">
                    {h.status === "DONE" && (
                      <button type="button" className="bg-link-btn" onClick={() => onUndo(h)}>Undo</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

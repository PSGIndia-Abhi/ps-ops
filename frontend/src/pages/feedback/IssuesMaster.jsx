import { useCallback, useEffect, useState } from "react";
import { FiBriefcase, FiChevronDown, FiChevronUp, FiFileText, FiPlus, FiTool, FiX } from "react-icons/fi";
import { OPERATIONS, departmentHint, getDepartmentSetup, getIssueTypes, saveDepartments, saveIssueTypes } from "./feedbackApi";
import { useFeedbackAccess } from "./feedbackContext";
import { Card, ErrorBox, Loading, PageHead, Switch, Toast } from "./ui";

// Feedback Desk › Issues (admin and service coordinators): the departments that take feedback
// tickets - picked from the user hierarchy - and each department's issues (Operations: Services,
// Technicians, Grooming, Behaviour...). When raising a ticket the collector ticks the issues of each
// chosen department and types the details; "Services" shows the month's services instead.
let tempKey = 0;
const newKey = () => `new-${++tempKey}`;

export default function IssuesMaster() {
  const { reloadDepartments } = useFeedbackAccess();
  const [setup, setSetup] = useState(null);
  const [types, setTypes] = useState(null);
  const [dept, setDept] = useState("");
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const clearNotice = useCallback(() => setNotice(""), []);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    Promise.all([getDepartmentSetup(), getIssueTypes(true)])
      .then(([d, t]) => {
        setSetup(d);
        setTypes(t.issue_types || []);
      })
      .catch((err) => setError(err.message));
  }, []);
  useEffect(load, [load]);

  const active = (setup?.departments || []).filter((d) => d.is_active);
  const current = active.find((d) => d.kind === dept) || active[0] || null;
  const savedRows = useCallback(
    (kind) => (types || []).filter((t) => t.department === kind).map((t) => ({ ...t, key: `t-${t.id}` })),
    [types],
  );
  // The editor shows the chosen department's issues.
  useEffect(() => {
    if (current) setRows(savedRows(current.kind));
  }, [current?.kind, savedRows]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!setup || !types) return error ? <ErrorBox error={error} onRetry={load} /> : <Loading />;

  const clean = (list) => list.map((r) => ({ id: r.id ?? null, name: r.name.trim(), is_active: r.is_active }));
  const dirty = current && JSON.stringify(clean(rows)) !== JSON.stringify(clean(savedRows(current.kind)));
  const countOf = (kind) => types.filter((t) => t.department === kind && t.is_active).length;
  const change = (key, patch) => setRows((l) => l.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  function move(key, by) {
    setRows((l) => {
      const i = l.findIndex((r) => r.key === key);
      const j = i + by;
      if (j < 0 || j >= l.length) return l;
      const next = [...l];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function changeDepartments(list, message) {
    setError("");
    try {
      setSetup(await saveDepartments(list));
      reloadDepartments();
      setNotice(message);
    } catch (err) {
      setError(err.message);
    }
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const d = await saveIssueTypes(current.kind, clean(rows));
      setTypes(d.issue_types || []);
      setNotice(`${current.name}: issues saved.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function pickDept(kind) {
    if (dirty && !window.confirm("Leave without saving the issues you changed?")) return;
    setDept(kind);
  }

  return (
    <>
      <PageHead
        title="Issues"
        actions={
          current && (
            <>
              {dirty && (
                <button type="button" className="fb-btn" onClick={() => setRows(savedRows(current.kind))} disabled={saving}>
                  Undo changes
                </button>
              )}
              <button type="button" className="fb-btn fb-btn-ok" onClick={save} disabled={!dirty || saving}>
                {saving ? "Saving…" : "Save issues"}
              </button>
            </>
          )
        }
      />
      <Toast notice={notice ? { text: notice } : null} onClose={clearNotice} />
      {error && (
        <div style={{ marginBottom: 16 }}>
          <ErrorBox error={error} />
        </div>
      )}

      <DepartmentsBar setup={setup} filter={current?.kind || ""} onFilter={pickDept} count={countOf} onChange={changeDepartments} />

      {current && (
        <Card title={`${current.name} · issues`} aside="Ticked when a ticket is raised for this department">
          <div className="fb-stack" style={{ gap: 12 }}>
            {!rows.length && <div className="fb-muted">No issues yet. Add the first one.</div>}
            <div className="fb-issue-list">
            {rows.map((r, n) => (
              <div key={r.key} className={`fb-issue-row ${r.is_active ? "" : "is-off"}`}>
                <div className="fb-issue-move">
                  <button type="button" aria-label="Move up" disabled={n === 0} onClick={() => move(r.key, -1)}>
                    <FiChevronUp />
                  </button>
                  <button type="button" aria-label="Move down" disabled={n === rows.length - 1} onClick={() => move(r.key, 1)}>
                    <FiChevronDown />
                  </button>
                </div>
                <input className="fb-input" maxLength={100} value={r.name} placeholder="e.g. Grooming" onChange={(e) => change(r.key, { name: e.target.value })} aria-label="Issue name" />
                {r.is_service && <span className="fb-issue-tag" title="Shows the month's services instead of a text box">Services list</span>}
                {r.id ? (
                  <Switch checked={r.is_active} onChange={(v) => change(r.key, { is_active: v })} label={`${r.name || "Issue"} on`} />
                ) : (
                  <button type="button" className="fb-icon-btn" aria-label="Remove this new issue" onClick={() => setRows((l) => l.filter((x) => x.key !== r.key))}>
                    <FiX />
                  </button>
                )}
              </div>
            ))}
            </div>
            <div>
              <button type="button" className="fb-btn fb-btn-sm" onClick={() => setRows((l) => [...l, { key: newKey(), id: null, name: "", is_service: false, is_active: true }])} disabled={rows.length >= 50}>
                <FiPlus /> Add issue
              </button>
            </div>
            <div className="fb-small fb-muted">
              {current.kind === OPERATIONS
                ? "Services shows the month's services (the visit and technician go on the ticket); every other issue gets a text box."
                : "Each ticked issue gets a text box for the details."}{" "}
              Switch an issue off to stop offering it - old tickets keep it.
            </div>
          </div>
        </Card>
      )}
    </>
  );
}

const deptIcon = (d) => (d.kind === OPERATIONS ? FiTool : d.with_invoices ? FiFileText : FiBriefcase);

/**
 * The departments that take feedback tickets - picked from the user hierarchy (Admin ›
 * Departments) - each a tab that opens its issues. Adding or removing one is
 * saved at once. A removed department gets no new tickets; its old tickets and questions stay.
 * onChange(rows, message) saves the departments (PUT /departments).
 */
function DepartmentsBar({ setup, filter, onFilter, count, onChange }) {
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState(false);
  if (!setup) return <Loading />;
  const active = setup.departments.filter((d) => d.is_active);
  const used = new Set(active.map((d) => d.org_unit_id));
  const free = setup.org_units.filter((u) => !used.has(u.id));
  const rowOf = (d, patch = {}) => ({ kind: d.kind, org_unit_id: d.org_unit_id, is_active: d.is_active, with_invoices: d.with_invoices, ...patch });

  async function run(rows, message) {
    setBusy(true);
    await onChange(rows, message);
    setBusy(false);
  }
  async function add() {
    const unit = setup.org_units.find((u) => u.id === adding);
    if (!unit) return;
    const before = setup.departments.find((d) => d.org_unit_id === unit.id);
    await run([before ? rowOf(before, { is_active: true }) : { org_unit_id: unit.id, is_active: true, with_invoices: false }], `${unit.name} added. Now add its issues.`);
    setAdding("");
  }
  async function remove(d) {
    if (!window.confirm(`Remove ${d.name}? It gets no new tickets and its people lose Customer Feedback. Old tickets and questions stay.`)) return;
    if (filter === d.kind) onFilter("");
    await run([rowOf(d, { is_active: false })], `${d.name} removed.`);
  }

  return (
    <Card title="Departments" aside="From the user hierarchy · who gets feedback tickets" className="fb-dept-bar">
      <div className="fb-stack" style={{ gap: 14 }}>
        <div className="fb-dept-tags" role="group" aria-label="Department">
          {active.map((d) => {
            const Icon = deptIcon(d);
            return (
              <span key={d.kind} className={`fb-dept-tag ${filter === d.kind ? "is-on" : ""}`}>
                <button type="button" className="fb-dept-tag-main" aria-pressed={filter === d.kind} onClick={() => onFilter(d.kind)} title={departmentHint(d)}>
                  <Icon aria-hidden="true" /> {d.name} <span className="fb-qtab-count">{count(d.kind)}</span>
                </button>
                {d.kind !== OPERATIONS && (
                  <label className="fb-dept-tag-inv" title="This department can pick the customer's invoices on a ticket">
                    <input type="checkbox" checked={d.with_invoices} disabled={busy} onChange={(e) => run([rowOf(d, { with_invoices: e.target.checked })], `${d.name}: invoices ${e.target.checked ? "on" : "off"}.`)} />
                    Invoices
                  </label>
                )}
                {d.kind !== OPERATIONS && (
                  <button type="button" className="fb-dept-tag-x" aria-label={`Remove ${d.name}`} title="Remove" disabled={busy} onClick={() => remove(d)}>
                    <FiX />
                  </button>
                )}
              </span>
            );
          })}
        </div>
        <div className="fb-row" style={{ gap: 8, flexWrap: "wrap" }}>
          <select className="fb-select" style={{ maxWidth: 280 }} value={adding} onChange={(e) => setAdding(e.target.value)} aria-label="Department to add">
            <option value="">Add a department…</option>
            {free.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <button type="button" className="fb-btn" onClick={add} disabled={!adding || busy}>
            <FiPlus /> Add department
          </button>
          <span className="fb-small fb-muted">People in these departments get Customer Feedback next to Task Management and see only their department's tickets.</span>
        </div>
      </div>
    </Card>
  );
}


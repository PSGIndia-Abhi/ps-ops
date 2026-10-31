// Employee feedback - the Managing Director's private notes on their team (only the MD sees this
// page; the server refuses everyone else). Left: the team with each person's average stars. Right:
// the chosen employee's report - overall stars, stars per type, every entry (edit / delete) - and a
// printable copy. "Add Feedback" picks the employee, a free type (types used before are offered as
// chips, like the task type), what to say, and 1-5 stars.

import { useEffect, useMemo, useState } from "react";
import { FiEdit2, FiMessageSquare, FiPlus, FiPrinter, FiSearch, FiStar, FiTrash2 } from "react-icons/fi";
import { apiFetch, safeJson } from "../../api";
import { useToast } from "./toastContext";
import { Avatar, EmptyState, Modal, Skeleton } from "./ui";
import "./feedback.css";

export const FEEDBACK_ROLE = "Managing Director";

async function call(method, path, body) {
  const res = await apiFetch(`/api/employee-feedback${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await safeJson(res);
  if (!res || !res.ok) throw new Error(data?.error || "Something went wrong. Please try again.");
  return data;
}

const fmtDate = (s) =>
  s ? new Date(s.replace(" ", "T")).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";
const fmtWhen = (s) =>
  s
    ? new Date(s.replace(" ", "T")).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })
    : "";
const roleOf = (e) => e?.designation || e?.role || "";

/** Read-only stars; `value` may be a decimal (4.3 shows 4 full stars and a partly filled fifth). */
function Stars({ value, size = 16 }) {
  return (
    <span className="tp-fb-stars" style={{ fontSize: size }} aria-label={value ? `${value} out of 5` : "No rating"}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.max(0, Math.min(1, (value || 0) - (i - 1)));
        return (
          <span key={i} className="tp-fb-star">
            <FiStar className="off" />
            <span className="on" style={{ width: `${fill * 100}%` }}>
              <FiStar />
            </span>
          </span>
        );
      })}
    </span>
  );
}

/** The 1-5 star picker on the form. */
function StarPicker({ value, onChange }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  const words = ["", "Poor", "Needs work", "Good", "Very good", "Excellent"];
  return (
    <div className="tp-fb-picker" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          className={`tp-fb-pick ${i <= shown ? "on" : ""}`}
          onMouseEnter={() => setHover(i)}
          onClick={() => onChange(i)}
          aria-label={`${i} star${i > 1 ? "s" : ""}`}
        >
          <FiStar />
        </button>
      ))}
      <span className="tp-fb-pick-word">{shown ? words[shown] : "Tap to rate"}</span>
    </div>
  );
}

export default function Feedback() {
  const toast = useToast();
  const isMD = localStorage.getItem("role") === FEEDBACK_ROLE;
  const [people, setPeople] = useState(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null); // employee id
  const [report, setReport] = useState(null);
  const [editing, setEditing] = useState(null); // null | { entry? }
  const [removing, setRemoving] = useState(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!isMD) return;
    let alive = true;
    call("GET", "/employees")
      .then((list) => {
        if (!alive) return;
        setPeople(list);
        setError("");
        // Open the first person who has feedback (else the first one) the first time.
        setSelected((cur) => cur ?? (list.find((p) => p.count > 0) || list[0])?.id ?? null);
      })
      .catch((err) => alive && setError(err.message));
    return () => {
      alive = false;
    };
  }, [isMD, reload]);

  useEffect(() => {
    if (!selected) return;
    let alive = true;
    call("GET", `/report/${selected}`)
      .then((r) => alive && setReport(r))
      .catch((err) => alive && toast.push({ type: "error", title: "Could not load the report", text: err.message }));
    return () => {
      alive = false;
    };
  }, [selected, reload, toast]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (people || []).filter((p) => !q || p.name.toLowerCase().includes(q) || roleOf(p).toLowerCase().includes(q));
  }, [people, query]);

  if (!isMD) {
    return <EmptyState icon={FiMessageSquare} title="Not available" text="Employee feedback is only for the Managing Director." />;
  }

  async function remove(entry) {
    try {
      await call("DELETE", `/${entry.id}`);
      toast.push({ type: "success", title: "Feedback deleted" });
      setReload((n) => n + 1);
    } catch (err) {
      toast.push({ type: "error", title: "Could not delete", text: err.message });
    }
  }

  function printReport() {
    if (!report) return;
    const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
    const star = (n) => "★".repeat(Math.round(n || 0)) + "☆".repeat(5 - Math.round(n || 0));
    const e = report.employee;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Feedback - ${esc(e.name)}</title>
<style>
  body{font-family:Inter,Segoe UI,Arial,sans-serif;color:#0f172a;margin:32px;}
  h1{font-size:22px;margin:0} .sub{color:#64748b;margin:4px 0 18px}
  .sum{display:flex;gap:28px;padding:14px 18px;border:1px solid #e6eaf2;border-radius:12px;margin-bottom:18px}
  .sum b{font-size:22px} .st{color:#f59e0b;letter-spacing:2px}
  table{width:100%;border-collapse:collapse;margin-bottom:18px} th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #eef1f6;font-size:13px;vertical-align:top}
  th{background:#f4f6fb;font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:#64748b}
  h2{font-size:14px;margin:18px 0 8px;text-transform:uppercase;letter-spacing:.8px;color:#475569}
  .foot{color:#94a3b8;font-size:11px;margin-top:24px}
</style></head><body>
<h1>Employee feedback - ${esc(e.name)}</h1>
<div class="sub">${esc(roleOf(e))}${e.unit_name ? ` · ${esc(e.unit_name)}` : ""} · Confidential</div>
<div class="sum"><div>Overall<br><b>${report.average ?? "-"}</b> <span class="st">${star(report.average)}</span></div><div>Feedback given<br><b>${report.count}</b></div></div>
<h2>By type</h2>
<table><tr><th>Type</th><th>Average</th><th>Count</th></tr>${report.by_type
      .map((t) => `<tr><td>${esc(t.type)}</td><td><span class="st">${star(t.average)}</span> ${t.average}</td><td>${t.count}</td></tr>`)
      .join("")}</table>
<h2>All feedback</h2>
<table><tr><th>Date</th><th>Type</th><th>Stars</th><th>Feedback</th></tr>${report.entries
      .map((x) => `<tr><td>${esc(fmtDate(x.created_at))}</td><td>${esc(x.feedback_type)}</td><td class="st">${star(x.rating)}</td><td>${esc(x.comments)}</td></tr>`)
      .join("")}</table>
<div class="foot">Printed ${esc(new Date().toLocaleString("en-IN"))} · BestServe Task Management</div>
<script>window.onload=()=>{window.print();}</script></body></html>`;
    const w = window.open("", "_blank");
    if (!w) return toast.push({ type: "error", title: "Allow pop-ups to print the report" });
    w.document.write(html);
    w.document.close();
  }

  const current = (people || []).find((p) => p.id === selected);
  // The report on screen belongs to someone else until the chosen one's arrives.
  const reportLoading = !!selected && (!report || report.employee.id !== selected);

  return (
    <>
      <div className="tp-page-head">
        <div>
          <h1>Employee Feedback</h1>
          <p>Your private notes on your team - only you can see them.</p>
        </div>
        <div className="tp-head-right-row">
          {report && report.count > 0 && (
            <button type="button" className="tp-btn ghost" onClick={printReport}>
              <FiPrinter /> Print report
            </button>
          )}
          <button type="button" className="tp-btn primary" onClick={() => setEditing({})} disabled={!people?.length}>
            <FiPlus /> Add Feedback
          </button>
        </div>
      </div>

      {error ? (
        <EmptyState icon={FiMessageSquare} title="Could not load your team" text={error} />
      ) : (
        <div className="tp-fb-grid">
          {/* the team */}
          <div className="tp-card tp-fb-people">
            <label className="tp-fb-search">
              <FiSearch />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search employees" />
            </label>
            {!people ? (
              <div className="tp-fb-pad">
                <Skeleton height={44} />
                <Skeleton height={44} />
                <Skeleton height={44} />
              </div>
            ) : shown.length === 0 ? (
              <p className="tp-fb-none">{people.length ? "No one matches." : "No one in your team yet."}</p>
            ) : (
              <ul className="tp-fb-list">
                {shown.map((p) => (
                  <li key={p.id}>
                    <button type="button" className={`tp-fb-person ${p.id === selected ? "on" : ""}`} onClick={() => setSelected(p.id)}>
                      <Avatar name={p.name} size={38} />
                      <span className="tp-fb-person-text">
                        <strong>{p.name}</strong>
                        <small>{roleOf(p)}</small>
                      </span>
                      <span className="tp-fb-person-score">
                        {p.count ? (
                          <>
                            <b>
                              <FiStar /> {p.average}
                            </b>
                            <small>{p.count}</small>
                          </>
                        ) : (
                          <small className="muted">-</small>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* the chosen employee's report */}
          <div className="tp-fb-report">
            {!current ? (
              <div className="tp-card">
                <EmptyState icon={FiMessageSquare} title="Pick an employee" text="Their feedback and stars show here." />
              </div>
            ) : reportLoading ? (
              <div className="tp-card tp-fb-pad">
                <Skeleton height={80} />
                <Skeleton height={140} />
              </div>
            ) : report ? (
              <>
                <div className="tp-card tp-fb-hero">
                  <Avatar name={report.employee.name} size={58} />
                  <div className="tp-fb-hero-text">
                    <h2>{report.employee.name}</h2>
                    <p>
                      {roleOf(report.employee)}
                      {report.employee.unit_name ? ` · ${report.employee.unit_name}` : ""}
                    </p>
                  </div>
                  <div className="tp-fb-score">
                    <span className="tp-fb-score-num">{report.average ?? "-"}</span>
                    <Stars value={report.average} size={18} />
                    <small>
                      {report.count} feedback{report.count === 1 ? "" : "s"}
                    </small>
                  </div>
                  <button type="button" className="tp-btn ghost tp-fb-hero-add" onClick={() => setEditing({ employeeId: report.employee.id })}>
                    <FiPlus /> Add
                  </button>
                </div>

                {report.count === 0 ? (
                  <div className="tp-card">
                    <EmptyState icon={FiStar} title="No feedback yet" text={`Add the first note for ${report.employee.name}.`}>
                      <button type="button" className="tp-btn primary" onClick={() => setEditing({ employeeId: report.employee.id })}>
                        <FiPlus /> Add Feedback
                      </button>
                    </EmptyState>
                  </div>
                ) : (
                  <>
                    <div className="tp-card">
                      <h3 className="tp-fb-h3">By type</h3>
                      <div className="tp-fb-types">
                        {report.by_type.map((t) => (
                          <div key={t.type} className="tp-fb-type">
                            <span className="tp-fb-type-name">{t.type}</span>
                            <span className="tp-fb-bar">
                              <span style={{ width: `${(t.average / 5) * 100}%` }} />
                            </span>
                            <Stars value={t.average} size={14} />
                            <span className="tp-fb-type-n">
                              {t.average} · {t.count}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="tp-card">
                      <h3 className="tp-fb-h3">All feedback</h3>
                      <ul className="tp-fb-entries">
                        {report.entries.map((x) => (
                          <li key={x.id} className="tp-fb-entry">
                            <div className="tp-fb-entry-top">
                              <span className="tp-fb-chip">{x.feedback_type}</span>
                              <Stars value={x.rating} size={14} />
                              <span className="tp-fb-entry-date" title={x.updated_at ? `Edited ${fmtWhen(x.updated_at)}` : undefined}>
                                {fmtWhen(x.created_at)}
                                {x.updated_at ? " · edited" : ""}
                              </span>
                              <span className="tp-fb-entry-actions">
                                <button type="button" className="tp-icon-btn" onClick={() => setEditing({ entry: x })} aria-label="Edit">
                                  <FiEdit2 />
                                </button>
                                <button type="button" className="tp-icon-btn" onClick={() => setRemoving(x)} aria-label="Delete">
                                  <FiTrash2 />
                                </button>
                              </span>
                            </div>
                            <p>{x.comments}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </>
                )}
              </>
            ) : null}
          </div>
        </div>
      )}

      {editing && (
        <FeedbackForm
          people={people || []}
          entry={editing.entry}
          employeeId={editing.employeeId ?? selected}
          onClose={() => setEditing(null)}
          onSaved={(row) => {
            setEditing(null);
            setSelected(row.employee_id);
            setReload((n) => n + 1);
          }}
        />
      )}

      {removing && (
        <Modal title="Delete this feedback?" size="sm" onClose={() => setRemoving(null)}>
          {(close) => (
            <div className="tp-fb-confirm">
              <p>
                <b>{removing.feedback_type}</b> for {removing.employee_name} will be removed for good.
              </p>
              <div className="tp-fb-form-foot">
                <button type="button" className="tp-btn ghost" onClick={close}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="tp-btn danger"
                  onClick={() => {
                    remove(removing);
                    close();
                  }}
                >
                  <FiTrash2 /> Delete
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}

/** Add or edit one feedback: employee, type (free, with past types as chips), what to say, stars. */
function FeedbackForm({ people, entry, employeeId, onClose, onSaved }) {
  const toast = useToast();
  const [employee, setEmployee] = useState(String(entry?.employee_id ?? employeeId ?? ""));
  const [type, setType] = useState(entry?.feedback_type ?? "");
  const [comments, setComments] = useState(entry?.comments ?? "");
  const [rating, setRating] = useState(entry?.rating ?? 0);
  const [types, setTypes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    call("GET", "/types").then(setTypes).catch(() => setTypes([]));
  }, []);
  const suggestions = types.filter((t) => t.toLowerCase() !== type.trim().toLowerCase() && (!type.trim() || t.toLowerCase().includes(type.trim().toLowerCase()))).slice(0, 8);

  async function save(close) {
    setError("");
    if (!employee) return setError("Choose the employee.");
    if (!type.trim()) return setError("Enter the feedback type.");
    if (comments.trim().length < 3) return setError("Write the feedback.");
    if (!rating) return setError("Give 1 to 5 stars.");
    setBusy(true);
    try {
      const body = { employee_id: Number(employee), feedback_type: type.trim(), comments: comments.trim(), rating };
      const row = entry ? await call("PUT", `/${entry.id}`, body) : await call("POST", "", body);
      toast.push({ type: "success", title: entry ? "Feedback updated" : "Feedback saved" });
      close();
      setTimeout(() => onSaved(row), 180);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal title={entry ? "Edit Feedback" : "Add Feedback"} onClose={onClose}>
      {(close) => (
        <div className="tp-fb-form">
          <label className="tp-fb-field">
            <span>Employee</span>
            <select className="tp-input" value={employee} onChange={(e) => setEmployee(e.target.value)}>
              <option value="">Select an employee</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {roleOf(p) ? ` - ${roleOf(p)}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="tp-fb-field">
            <span>Type</span>
            <input className="tp-input" value={type} maxLength={100} onChange={(e) => setType(e.target.value)} placeholder="e.g. Punctuality, Customer handling, Teamwork" />
          </label>
          {suggestions.length > 0 && (
            <div className="tp-fb-suggest">
              {suggestions.map((t) => (
                <button key={t} type="button" className="tp-fb-chip pick" onClick={() => setType(t)}>
                  {t}
                </button>
              ))}
            </div>
          )}

          <label className="tp-fb-field">
            <span>Feedback</span>
            <textarea className="tp-input" rows={4} maxLength={2000} value={comments} onChange={(e) => setComments(e.target.value)} placeholder="What do you want to note about them?" />
          </label>

          <div className="tp-fb-field">
            <span>Rating</span>
            <StarPicker value={rating} onChange={setRating} />
          </div>

          {!!error && <p className="tp-fb-error">{error}</p>}

          <div className="tp-fb-form-foot">
            <button type="button" className="tp-btn ghost" onClick={close} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="tp-btn primary" onClick={() => save(close)} disabled={busy}>
              {busy ? "Saving..." : entry ? "Save changes" : "Save Feedback"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

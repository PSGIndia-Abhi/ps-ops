// Employee feedback - the Managing Director's private notes on their team (only the MD sees this
// page; the server refuses everyone else). Left: the team with each person's average mark. Right:
// the chosen employee's report - overall mark, mark per type, every entry (edit / delete) - and a
// printable copy. "Add Feedback" picks the employee, a free type (types used before are offered as
// chips, like the task type), what to say, a tone (Positive / Neutral / Negative), a mark out of 10
// and an optional reward.

import { useEffect, useId, useMemo, useState } from "react";
import { FiAward, FiEdit2, FiMessageSquare, FiMinusCircle, FiPlus, FiPrinter, FiSearch, FiStar, FiTag, FiThumbsDown, FiThumbsUp, FiTrash2, FiUser, FiX, FiZap } from "react-icons/fi";
import { apiFetch, safeJson } from "../../api";
import { useToast } from "./toastContext";
import { PersonPicker, Prop } from "./NewTaskModal";
import { Avatar, Drawer, EmptyState, Modal, Skeleton } from "./ui";
import "./feedback.css";

export const FEEDBACK_ROLE = "Managing Director";
const MAX_MARK = 10;
const SENTIMENTS = ["Positive", "Neutral", "Negative"];
const MARK_WORDS = ["", "Very poor", "Poor", "Weak", "Below average", "Average", "Fair", "Good", "Very good", "Excellent", "Outstanding"];
/** Colour band of a mark: red when low, amber in the middle, blue when good, green at the top. */
const markBand = (m) => (m >= 9 ? "top" : m >= 7 ? "good" : m >= 5 ? "mid" : "low");
const TONE_ICONS = { Positive: FiThumbsUp, Neutral: FiMinusCircle, Negative: FiThumbsDown };
/** Quick picks under the reward box, so it rarely needs typing. */
const REWARD_TITLE = "Reward / Achievement";
/** A field label with the red "required" star. */
const req = (text) => (
  <>
    {text}
    <b className="tp-fb-req">*</b>
  </>
);
const FORM_ID = "tp-feedback-form";

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

/** "8/10" in the mark's colour; `value` may be a decimal (an average). */
function Mark({ value }) {
  if (value == null) return <span className="tp-fb-mark">-</span>;
  return (
    <span className={`tp-fb-mark ${markBand(value)}`} aria-label={`${value} out of ${MAX_MARK}`}>
      {value}
      <small>/{MAX_MARK}</small>
    </span>
  );
}

/** The mark as a ring that fills up to it, the number in the middle; `value` may be an average. */
function Ring({ value, size = 52, stroke = 5 }) {
  const r = (size - stroke) / 2;
  const len = 2 * Math.PI * r;
  const fill = Math.min(value || 0, MAX_MARK) / MAX_MARK;
  const gradId = `ring${useId().replace(/:/g, "")}`;
  return (
    <span className={`tp-fb-ring ${markBand(value || 0)}`} style={{ width: size, height: size }} aria-label={`${value} out of ${MAX_MARK}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" className="g1" />
            <stop offset="1" className="g2" />
          </linearGradient>
        </defs>
        {/* soft glow, the track, then the filled arc */}
        <circle className="glow" cx={size / 2} cy={size / 2} r={r - stroke / 2 - 1} />
        <circle className="track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />
        <circle
          className="fill"
          stroke={`url(#${gradId})`}
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          strokeDasharray={len}
          strokeDashoffset={len * (1 - fill)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <b style={{ fontSize: Math.round(size * 0.32) }}>{value ?? "-"}</b>
    </span>
  );
}

function Tone({ value }) {
  return (
    <span className={`tp-fb-tone ${value.toLowerCase()}`}>
      <i />
      {value}
    </span>
  );
}

/** The 1-10 marks as one rounded track: it fills up to the picked mark, which sits in a raised bubble. */
function MarkPicker({ value, onChange }) {
  return (
    <div className="tp-fb-meter">
      {/* the gradient is sized to the whole track, so each mark keeps its own colour */}
      <span className="tp-fb-meter-fill" style={{ width: `${(value / MAX_MARK) * 100}%`, backgroundSize: value ? `${(MAX_MARK / value) * 100}% 100%` : undefined }} />
      {Array.from({ length: MAX_MARK }, (_, i) => i + 1).map((m) => (
        <button
          key={m}
          type="button"
          className={`tp-fb-meter-cell ${m < value ? "filled" : ""} ${m === value ? `on ${markBand(m)}` : ""}`}
          onClick={() => onChange(m)}
          aria-label={`${m} out of ${MAX_MARK}`}
          aria-pressed={m === value}
        >
          <span>{m}</span>
        </button>
      ))}
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
    const mark = (n) => (n == null ? "-" : `${n}/${MAX_MARK}`);
    const e = report.employee;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Feedback - ${esc(e.name)}</title>
<style>
  body{font-family:Inter,Segoe UI,Arial,sans-serif;color:#0f172a;margin:32px;}
  h1{font-size:22px;margin:0} .sub{color:#64748b;margin:4px 0 18px}
  .sum{display:flex;gap:28px;padding:14px 18px;border:1px solid #e6eaf2;border-radius:12px;margin-bottom:18px}
  .sum b{font-size:22px} .st{color:#b45309;font-weight:700;white-space:nowrap}
  table{width:100%;border-collapse:collapse;margin-bottom:18px} th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #eef1f6;font-size:13px;vertical-align:top}
  th{background:#f4f6fb;font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:#64748b}
  h2{font-size:14px;margin:18px 0 8px;text-transform:uppercase;letter-spacing:.8px;color:#475569}
  .foot{color:#94a3b8;font-size:11px;margin-top:24px}
</style></head><body>
<h1>Employee feedback - ${esc(e.name)}</h1>
<div class="sub">${esc(roleOf(e))}${e.unit_name ? ` · ${esc(e.unit_name)}` : ""} · Confidential</div>
<div class="sum"><div>Overall<br><b>${mark(report.average)}</b></div><div>Feedback given<br><b>${report.count}</b></div></div>
<h2>By type</h2>
<table><tr><th>Type</th><th>Average</th><th>Count</th></tr>${report.by_type
      .map((t) => `<tr><td>${esc(t.type)}</td><td class="st">${mark(t.average)}</td><td>${t.count}</td></tr>`)
      .join("")}</table>
<h2>All feedback</h2>
<table><tr><th>Date</th><th>Type</th><th>Mark</th><th>Tone</th><th>Feedback</th><th>${REWARD_TITLE}</th></tr>${report.entries
      .map(
        (x) =>
          `<tr><td>${esc(fmtDate(x.created_at))}</td><td>${esc(x.feedback_type)}</td><td class="st">${mark(x.rating)}</td><td>${esc(x.sentiment || "-")}</td><td>${esc(x.comments)}</td><td>${esc(x.reward || "-")}</td></tr>`
      )
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
                              {p.average}
                              <small>/{MAX_MARK}</small>
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
                <EmptyState icon={FiMessageSquare} title="Pick an employee" text="Their feedback and marks show here." />
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
                    {report.average != null ? (
                      <Ring value={report.average} size={64} stroke={6} />
                    ) : (
                      <span className="tp-fb-ring-empty" aria-hidden="true">
                        –
                      </span>
                    )}
                    <span>
                      <b>{report.average != null ? `Average ${report.average}/${MAX_MARK}` : "No marks yet"}</b>
                      <small>
                        {report.count} feedback{report.count === 1 ? "" : "s"}
                      </small>
                    </span>
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
                              <span className={markBand(t.average)} style={{ width: `${(t.average / MAX_MARK) * 100}%` }} />
                            </span>
                            <Mark value={t.average} />
                            <span className="tp-fb-type-n">
                              {t.count} feedback{t.count === 1 ? "" : "s"}
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
                            <Ring value={x.rating} />
                            <div className="tp-fb-entry-body">
                              <div className="tp-fb-entry-top">
                                <span className="tp-fb-chip">{x.feedback_type}</span>
                                {x.sentiment && <Tone value={x.sentiment} />}
                                <span className="tp-fb-entry-date" title={x.updated_at ? `Edited ${fmtWhen(x.updated_at)}` : undefined}>
                                  {fmtWhen(x.created_at)}
                                  {x.updated_at ? " · edited" : ""}
                                </span>
                              </div>
                              <p>{x.comments}</p>
                              {x.reward && (
                                <span className="tp-fb-reward">
                                  <i className="tp-fb-gloss amber">
                                    <FiAward />
                                  </i>
                                  <span>
                                    <small>{REWARD_TITLE}</small>
                                    <b>{x.reward}</b>
                                  </span>
                                </span>
                              )}
                            </div>
                            <span className="tp-fb-entry-actions">
                              <button type="button" className="tp-fb-gloss blue" onClick={() => setEditing({ entry: x })} aria-label="Edit" title="Edit">
                                <FiEdit2 />
                              </button>
                              <button type="button" className="tp-fb-gloss red" onClick={() => setRemoving(x)} aria-label="Delete" title="Delete">
                                <FiTrash2 />
                              </button>
                            </span>
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

/** Add or edit one feedback: employee, type (free, with past types as chips), what to say, tone, mark, reward. */
function FeedbackForm({ people, entry, employeeId, onClose, onSaved }) {
  const toast = useToast();
  const [employee, setEmployee] = useState(String(entry?.employee_id ?? employeeId ?? ""));
  const [type, setType] = useState(entry?.feedback_type ?? "");
  const [comments, setComments] = useState(entry?.comments ?? "");
  const [rating, setRating] = useState(entry?.rating ?? 0);
  const [sentiment, setSentiment] = useState(entry?.sentiment ?? "");
  const [reward, setReward] = useState(entry?.reward ?? "");
  const [types, setTypes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    call("GET", "/types").then(setTypes).catch(() => setTypes([]));
  }, []);
  // A few at a time, not the whole list - narrows as you type (like the task type).
  const suggestions = types.filter((t) => t.toLowerCase() !== type.trim().toLowerCase() && (!type.trim() || t.toLowerCase().includes(type.trim().toLowerCase()))).slice(0, 4);

  async function save(close) {
    setError("");
    if (!employee) return setError("Choose the employee.");
    if (!type.trim()) return setError("Enter the feedback type.");
    if (comments.trim().length < 3) return setError("Write the feedback.");
    if (!sentiment) return setError("Choose Positive, Neutral or Negative.");
    if (!rating) return setError(`Give a mark out of ${MAX_MARK}.`);
    setBusy(true);
    try {
      const body = { employee_id: Number(employee), feedback_type: type.trim(), comments: comments.trim(), rating, sentiment, reward: reward.trim() };
      const row = entry ? await call("PUT", `/${entry.id}`, body) : await call("POST", "", body);
      toast.push({ type: "success", title: entry ? "Feedback updated" : "Feedback saved" });
      close();
      setTimeout(() => onSaved(row), 180);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  // The task form's person picker groups by `dept` and shows `designation`; feedback's team carries
  // them as unit_name and (often) only a role.
  const team = useMemo(() => people.map((p) => ({ ...p, dept: p.unit_name, designation: roleOf(p) })), [people]);
  const who = team.find((p) => p.id === Number(employee));

  return (
    <Drawer
      title={entry ? "Edit feedback" : "Add feedback"}
      subtitle={entry ? `For ${entry.employee_name}. Change anything you need, then save.` : "A private note on someone in your team"}
      onClose={onClose}
      footer={(close) => (
        <>
          <span className="tp-nt-kbd">
            <kbd>Ctrl</kbd> + <kbd>Enter</kbd>
          </span>
          <button type="button" className="tp-btn ghost" onClick={close} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form={FORM_ID} className="tp-btn primary" disabled={busy}>
            {busy ? "Saving…" : entry ? "Save changes" : "Save feedback"}
          </button>
        </>
      )}
    >
      {(close) => (
        <form
          id={FORM_ID}
          className="tp-nt tp-fb-panel"
          onSubmit={(e) => {
            e.preventDefault();
            save(close);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              save(close);
            }
          }}
          noValidate
        >
          {/* what was said, up top like the task title */}
          <div className="tp-nt-head">
            <textarea
              className="tp-fb-note"
              rows={3}
              maxLength={2000}
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="What do you want to note about them?"
              aria-label="Feedback"
              autoFocus
            />
            <div className="tp-fb-counter">
              <span>{req("Feedback")}</span>
              <small>{comments.length}/2000</small>
            </div>
          </div>

          <div className="tp-nt-props">
            <Prop icon={FiUser} label={req("Employee")}>
              <PersonPicker people={team} value={Number(employee)} onChange={(id) => setEmployee(String(id))} />
            </Prop>

            <Prop icon={FiTag} label={req("Type")} top>
              <input className="tp-input" value={type} maxLength={100} onChange={(e) => setType(e.target.value)} placeholder="e.g. Punctuality, Teamwork" />
              {suggestions.length > 0 && (
                <div className="tp-fb-suggest">
                  {suggestions.map((t) => (
                    <button key={t} type="button" className="tp-fb-chip pick" onClick={() => setType(t)}>
                      <FiPlus /> {t}
                    </button>
                  ))}
                </div>
              )}
            </Prop>

            <Prop icon={FiThumbsUp} label={req("Tone")}>
              <div className="tp-fb-seg">
                {SENTIMENTS.map((t) => {
                  const Icon = TONE_ICONS[t];
                  return (
                    <button key={t} type="button" className={`${t.toLowerCase()} ${sentiment === t ? "on" : ""}`} onClick={() => setSentiment(t)} aria-pressed={sentiment === t}>
                      <Icon /> {t}
                    </button>
                  );
                })}
              </div>
            </Prop>

            <Prop icon={FiStar} label={req("Marks")} top>
              <MarkPicker value={rating} onChange={setRating} />
              <span className={`tp-fb-live ${rating ? markBand(rating) : ""}`}>{rating ? `${rating}/${MAX_MARK} · ${MARK_WORDS[rating]}` : "Pick a mark"}</span>
            </Prop>

            <Prop icon={FiAward} label={REWARD_TITLE} top>
              <div className="tp-fb-iconinput">
                <input value={reward} maxLength={500} onChange={(e) => setReward(e.target.value)} placeholder="Optional - e.g. Gift voucher, Top performer of the month" aria-label={REWARD_TITLE} />
                {!!reward && (
                  <button type="button" onClick={() => setReward("")} aria-label="Clear reward">
                    <FiX />
                  </button>
                )}
              </div>
            </Prop>
          </div>

          {/* one line saying what will be saved, like the task form */}
          <div className="tp-nt-summary" aria-live="polite">
            <span className="tp-nt-summary-icon">
              <FiZap />
            </span>
            <p>
              <strong>{who ? who.name : "Someone"}</strong> gets {sentiment ? `a ${sentiment.toLowerCase()}` : "a"}{" "}
              {rating ? `${rating}/${MAX_MARK}` : "unrated"} feedback{type.trim() ? ` on ${type.trim()}` : ""}
              {reward.trim() ? `, with ${reward.trim()}` : ""}.
            </p>
          </div>

          {!!error && <em className="tp-error">{error}</em>}
        </form>
      )}
    </Drawer>
  );
}

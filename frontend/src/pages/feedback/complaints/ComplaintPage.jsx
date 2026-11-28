import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { FiChevronRight, FiMessageSquare, FiPaperclip, FiSearch, FiSend, FiX } from "react-icons/fi";
import { apiFetch } from "../../../api";
import { BackButton, CallButton, ErrorBox, Loading, Toast } from "../ui";
import { COMPLAINT_PRIORITY, COMPLAINT_STATUS, COMPLAINT_TYPE, QUICK_REPLIES, QUICK_REPLY_GROUPS, complaintRef, complaintRequest } from "./complaintApi";
import "./complaints.css";

// Feedback Desk > Complaints > one complaint: the conversation with the client, status and
// priority, stages and the client / outlet details.

const STAGES = ["OPEN", "IN_PROGRESS", "VISIT_SCHEDULED", "RESOLVED", "CLOSED"];
const STAGE_LABEL = { OPEN: "Raised", IN_PROGRESS: "In progress", VISIT_SCHEDULED: "Visit scheduled", RESOLVED: "Resolved", CLOSED: "Closed" };
const ymd = (v) => (v ? new Date(v).toLocaleDateString("en-CA") : "");
const dayLabel = (v) => (v ? new Date(v).toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" }) : "");
const MAX_FILES = 10;

const when = (v) => (v ? new Date(v).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" }) : "—");
const initials = (name) => String(name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

// A photo / PDF of the thread, loaded with the login token.
function Attachment({ file }) {
  const [url, setUrl] = useState(null);
  const isPdf = /pdf/i.test(file.file_type || file.file_name || "");
  useEffect(() => {
    let objectUrl = null;
    let live = true;
    apiFetch(`/api/complaint-desk/files/${encodeURIComponent(file.id)}`)
      .then((res) => (res?.ok ? res.blob() : null))
      .then((blob) => {
        if (!blob || !live) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {});
    return () => {
      live = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file.id]);
  if (!url) return <span className="fbc-att fbc-att-wait" />;
  return (
    <a className={`fbc-att ${isPdf ? "pdf" : ""}`} href={url} target="_blank" rel="noreferrer" title={file.file_name}>
      {isPdf ? <span>PDF</span> : <img src={url} alt={file.file_name} />}
    </a>
  );
}

export default function ComplaintPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ status: "", priority: "" });
  const [saving, setSaving] = useState(false);
  const [reply, setReply] = useState("");
  const [files, setFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState(null);
  const [qrTab, setQrTab] = useState(null); // quick-reply tab; null = the complaint's own type
  const [qrSearch, setQrSearch] = useState("");
  const fileInput = useRef(null);
  const replyBox = useRef(null);

  // Reply box grows with its text (2 lines minimum, then scrolls past ~10 lines).
  useEffect(() => {
    const box = replyBox.current;
    if (!box) return;
    box.style.height = "auto";
    box.style.height = `${Math.min(box.scrollHeight + 2, 260)}px`;
  }, [reply]);

  const load = useCallback(async () => {
    try {
      const body = await complaintRequest(`/complaints/${encodeURIComponent(id)}`);
      setData(body);
      setForm({
        status: body.complaint.status, priority: body.complaint.priority,
        visit_date: ymd(body.complaint.visit_date), visit_slot: body.complaint.visit_slot || "",
      });
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setSaving(true);
    try {
      await complaintRequest(`/complaints/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(form.status === "VISIT_SCHEDULED" ? form : { status: form.status, priority: form.priority }) });
      setNotice({ tone: "ok", text: "Complaint updated. The client sees the new status in their portal." });
      await load();
    } catch (err) {
      setNotice({ tone: "warn", text: err.message });
    } finally {
      setSaving(false);
    }
  }

  function addFiles(list) {
    const incoming = Array.from(list || []).filter((f) => f.type.startsWith("image/") || f.type === "application/pdf");
    setFiles((prev) => [...prev, ...incoming].slice(0, MAX_FILES));
  }

  async function send(e) {
    e.preventDefault();
    if (!reply.trim() && !files.length) return;
    setSending(true);
    try {
      const fd = new FormData();
      fd.set("message", reply.trim());
      files.forEach((f) => fd.append("files", f, f.name));
      const body = await complaintRequest(`/complaints/${encodeURIComponent(id)}/messages`, { method: "POST", body: fd });
      setReply("");
      setFiles([]);
      setNotice(body.warning ? { tone: "warn", text: body.warning } : { tone: "ok", text: "Reply sent. The client is notified in their portal." });
      await load();
    } catch (err) {
      setNotice({ tone: "warn", text: err.message });
    } finally {
      setSending(false);
    }
  }

  // A quick-reply chip adds its sentence to the box; a [date] / [time] blank gets selected so it
  // is typed over straight away.
  // A reply with [date] / [time] first asks for them (pre-filled with the scheduled visit, else
  // tomorrow), then goes into the box with real values.
  const [fill, setFill] = useState(null); // { text, date, time }
  function pickQuick(text) {
    if (/\[(date|time)\]/.test(text)) {
      const c = data.complaint;
      const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString("en-CA");
      setFill({ text, date: form.visit_date || ymd(c.visit_date) || tomorrow, time: form.visit_slot || c.visit_slot || "" });
      return;
    }
    insertQuick(text);
  }
  function applyFill(e) {
    e?.preventDefault();
    const dayText = fill.date ? dayLabel(`${fill.date}T00:00:00`) : "";
    let text = fill.text.replace("[date]", dayText || "[date]");
    text = fill.time.trim() ? text.replace("[time]", fill.time.trim()) : text.replace(/\s*between \[time\]/, "").replace("[time]", "");
    setFill(null);
    insertQuick(text);
  }
  function insertQuick(text) {
    const next = reply.trim() ? `${reply.trim()}\n${text}` : text;
    setReply(next);
    setTimeout(() => {
      const box = replyBox.current;
      if (!box) return;
      box.focus();
      const at = next.indexOf("[", next.length - text.length);
      if (at >= 0) box.setSelectionRange(at, next.indexOf("]", at) + 1);
      else box.setSelectionRange(next.length, next.length);
    }, 0);
  }

  if (error && !data) return <ErrorBox error={error} onRetry={load} />;
  if (!data) return <Loading text="Loading complaint…" />;

  const c = data.complaint;
  const st = COMPLAINT_STATUS[c.status] || { label: c.status, tone: "muted" };
  const pr = COMPLAINT_PRIORITY[c.priority] || COMPLAINT_PRIORITY.MEDIUM;
  const stageIdx = Math.max(0, STAGES.indexOf(c.status));
  const changed = form.status !== c.status || form.priority !== c.priority
    || (form.status === "VISIT_SCHEDULED" && (form.visit_date !== ymd(c.visit_date) || form.visit_slot !== (c.visit_slot || "")));
  const visitText = [dayLabel(c.visit_date), c.visit_slot].filter(Boolean).join(", ");
  // Quick replies: the picked tab (default: this complaint's type), or every tab while searching.
  const activeTab = qrTab || (c.category.includes("SERVICE") ? "SERVICE" : c.category[0] || "GENERAL");
  const qrTerm = qrSearch.trim().toLowerCase();
  const quickShown = QUICK_REPLIES.filter((q) =>
    qrTerm ? `${q.label} ${q.text}`.toLowerCase().includes(qrTerm) : q.group === activeTab
  );

  return (
    <div className="fbc-page">
      {/* Compact header: where (number · company › outlet), what (raised, type, priority); status on the right. */}
      <header className="fbc-head">
        <BackButton fallback="/feedback-desk/complaints" />
        <div className="fbc-head-main">
          <h1 title={c.subject}>{c.subject}</h1>
          <div className="fbc-head-where">
            <span className="fbc-ref">{complaintRef(c.id)}</span>
            <span>{c.company_name || "—"}</span>
            <FiChevronRight aria-hidden="true" />
            <span>{c.site_name || "—"}</span>
          </div>
          <div className="fbc-head-what">
            <span>Raised {when(c.created_at)} by {c.raised_by_name}</span>
            <span className="fbc-head-sep" aria-hidden="true" />
            {c.category.map((k) => <span key={k} className={`fbc-type t-${k.toLowerCase()}`}>{COMPLAINT_TYPE[k] || k}</span>)}
            <span className="fbc-head-sep" aria-hidden="true" />
            <span className={`fbc-prio p-${String(c.priority || "").toLowerCase()}`}>● {pr.label}</span>
          </div>
        </div>
        <span className={`fbc-head-status s-${String(c.status || "").toLowerCase()}`}>{st.label}</span>
      </header>
      {notice && <Toast notice={notice} onClose={() => setNotice(null)} />}

      <div className="fbc-grid">
        <section className="fb-card fbc-thread-card">
          <div className="fb-card-h"><h2>Conversation</h2><span className="fb-card-aside">The client sees every reply in their portal</span></div>
          <div className="fbc-thread">
            {data.messages.map((m) => (
              <div key={m.id} className={`fbc-msg ${m.from_client ? "client" : "team"} ${m.auto ? "auto" : ""}`}>
                <span className="fbc-av" aria-hidden="true">{initials(m.author)}</span>
                <div className="fbc-msg-body">
                  <div className="fbc-msg-meta"><b>{m.mine ? "You" : m.author}</b>{m.auto ? "" : ` · ${m.role_label}`} · {when(m.created_at)}</div>
                  <div className="fbc-bubble">
                    {m.message && m.message !== "(attachment)" && <p>{m.message}</p>}
                    {m.attachments.length > 0 && <div className="fbc-atts">{m.attachments.map((f) => <Attachment key={f.id} file={f} />)}</div>}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {c.status === "CLOSED" ? (
            <div className="fbc-closed">This complaint is closed. Change the status to reply again.</div>
          ) : (
            <form className="fbc-reply" onSubmit={send}>
              <div className="fbc-compose">
                <div className="fbc-compose-main">
                  {fill && (
                    <div className="fbc-fill" role="group" aria-label="Fill in the visit date and time">
                      <span className="fbc-fill-title">Visit date &amp; time for this reply</span>
                      <input className="fb-input" type="date" value={fill.date} onChange={(e) => setFill({ ...fill, date: e.target.value })} aria-label="Visit date" />
                      <input className="fb-input" value={fill.time} maxLength={40} placeholder="Time, e.g. 3 - 5 PM" onChange={(e) => setFill({ ...fill, time: e.target.value })} aria-label="Visit time"
                        onKeyDown={(e) => e.key === "Enter" && applyFill(e)} />
                      <button type="button" className="fb-btn fb-btn-primary" onClick={applyFill}>Insert</button>
                      <button type="button" className="fb-btn" onClick={() => setFill(null)}>Cancel</button>
                    </div>
                  )}
                  <textarea
                    ref={replyBox} className="fb-textarea" rows={2} value={reply} onChange={(e) => setReply(e.target.value)}
                    placeholder="Write a reply to the client… or pick a quick reply on the right"
                    onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send(e); }}
                  />
                  {files.length > 0 && (
                    <ul className="fbc-files">
                      {files.map((f, i) => (
                        <li key={`${f.name}-${i}`}>{f.name}<button type="button" onClick={() => setFiles(files.filter((_, x) => x !== i))} aria-label={`Remove ${f.name}`}><FiX /></button></li>
                      ))}
                    </ul>
                  )}
                  <div className="fbc-reply-row">
                    <button type="button" className="fb-btn" onClick={() => fileInput.current?.click()} disabled={files.length >= MAX_FILES}><FiPaperclip /> Attach photos</button>
                    <input ref={fileInput} type="file" hidden multiple accept="image/*,application/pdf" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
                    <button type="submit" className="fb-btn fb-btn-primary fbc-send" disabled={sending || (!reply.trim() && !files.length)}><FiSend /> {sending ? "Sending…" : "Send reply"}</button>
                  </div>
                </div>

                {/* Quick replies panel: tabs by type, search, one card per reply; click to insert. */}
                <aside className="fbc-qp" aria-label="Quick replies">
                  <div className="fbc-qp-tabs" role="tablist">
                    {QUICK_REPLY_GROUPS.map((g) => (
                      <button
                        type="button" role="tab" key={g.key} aria-selected={activeTab === g.key}
                        className={`g-${g.key.toLowerCase()} ${activeTab === g.key && !qrTerm ? "on" : ""}`}
                        onClick={() => setQrTab(g.key)}
                      >
                        {g.label}
                      </button>
                    ))}
                  </div>
                  <label className="fbc-qp-search">
                    <FiSearch aria-hidden="true" />
                    <input type="search" placeholder="Search quick replies" value={qrSearch} onChange={(e) => setQrSearch(e.target.value)} />
                  </label>
                  <div className="fbc-qp-list">
                    {quickShown.length === 0 && <p className="fbc-qp-none">No reply matches.</p>}
                    {quickShown.map((q) => (
                      <button type="button" key={q.label} className={`fbc-qp-card g-${q.group.toLowerCase()}`} onClick={() => pickQuick(q.text)} title="Insert into the reply">
                        <b>{q.label}</b>
                        <span>{q.text}</span>
                      </button>
                    ))}
                  </div>
                </aside>
              </div>
            </form>
          )}
        </section>

        <aside className="fbc-side">
          <section className="fb-card">
            <div className="fb-card-h"><h2>Update</h2></div>
            <div className="fb-card-b fbc-update">
              <label>Status
                <select className="fb-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {STAGES.map((s) => <option key={s} value={s}>{COMPLAINT_STATUS[s].label}</option>)}
                </select>
              </label>
              {form.status === "VISIT_SCHEDULED" && (
                <div className="fbc-visit">
                  <label>Visit date <small>(optional)</small>
                    <input className="fb-input" type="date" value={form.visit_date} onChange={(e) => setForm({ ...form, visit_date: e.target.value })} />
                  </label>
                  <label>Time <small>(optional)</small>
                    <input className="fb-input" value={form.visit_slot} maxLength={40} placeholder="e.g. 3 - 5 PM" onChange={(e) => setForm({ ...form, visit_slot: e.target.value })} />
                  </label>
                  <small className="fbc-visit-note">The client sees this and gets a notification.</small>
                </div>
              )}
              <label>Priority
                <select className="fb-select" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                  {Object.entries(COMPLAINT_PRIORITY).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
                </select>
              </label>
              <button type="button" className="fb-btn fb-btn-primary" onClick={save} disabled={saving || !changed}>{saving ? "Saving…" : "Save"}</button>
            </div>
          </section>

          <section className="fb-card">
            <div className="fb-card-h"><h2>Stages</h2></div>
            <ol className="fbc-stages">
              {STAGES.map((s, i) => (
                <li key={s} className={i < stageIdx || (i === stageIdx && s === "CLOSED") ? "done" : i === stageIdx ? "now" : ""}>
                  <span className="fbc-stage-dot" aria-hidden="true" />
                  <span>{STAGE_LABEL[s]}{i === 0 && <small>{when(c.created_at)}</small>}{s === "VISIT_SCHEDULED" && visitText && i <= stageIdx && <small>Visit: {visitText}</small>}{i === stageIdx && i > 0 && <small>Updated {when(c.updated_at)}</small>}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className="fb-card">
            <div className="fb-card-h"><h2>Details</h2></div>
            <dl className="fbc-kv">
              <div><dt>Complaint</dt><dd>{complaintRef(c.id)}</dd></div>
              <div><dt>Type</dt><dd>{c.category.map((k) => COMPLAINT_TYPE[k] || k).join(" + ")}</dd></div>
              <div><dt>Company</dt><dd>{c.company_name || "—"}</dd></div>
              <div><dt>Outlet</dt><dd>{c.site_name || "—"}{c.site_city ? `, ${c.site_city}` : ""}</dd></div>
              {data.jobs.length > 0 && <div><dt>Job</dt><dd>{data.jobs.map((j) => `${j.code}${j.sub_service ? ` · ${j.sub_service}` : ""}`).join(", ")}</dd></div>}
              <div><dt>Raised by</dt><dd>{c.raised_by_name}</dd></div>
              {c.raised_by_phone && <div><dt>Phone</dt><dd>{c.raised_by_phone}</dd></div>}
              {c.raised_by_email && <div><dt>Email</dt><dd>{c.raised_by_email}</dd></div>}
              {visitText && <div><dt>Scheduled visit</dt><dd>{visitText}</dd></div>}
              <div><dt>Last visit</dt><dd>{data.last_visit ? `${when(data.last_visit.completed_at)}${data.last_visit.sub_service ? ` · ${data.last_visit.sub_service}` : ""}` : "—"}</dd></div>
            </dl>
            {c.raised_by_phone && (
              <div className="fb-card-b fbc-call">
                <CallButton name={c.raised_by_name} phone={c.raised_by_phone} className="fb-btn">Call {c.raised_by_name}</CallButton>
              </div>
            )}
          </section>
          <p className="fbc-hint"><FiMessageSquare aria-hidden="true" /> Your first reply moves an Open complaint to In progress.</p>
        </aside>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  FiAlertCircle, FiArrowLeft, FiCalendar, FiCheck, FiCheckCircle, FiClock, FiEdit3, FiFileText, FiMessageSquare,
  FiPhone, FiPlay, FiPlusCircle, FiRotateCcw, FiUser, FiX,
} from "react-icons/fi";
import FollowUpOutcomeModal from "../../components/accountant/FollowUpOutcomeModal";
import DateInput from "../../components/accountant/DateInput";
import { Badge, DataError, EmptyRow, Skeleton } from "./ui";
import { money } from "./format";
import { byDue, cleanFollowUp, showDate, todayYmd, useAccountantData } from "./data";
import {
  addFollowUpComment, completeFollowUp, fetchCustomerContact, fetchFollowUp, fetchFollowUpComments, fetchFollowUpHistory,
  reopenFollowUp, rescheduleFollowUp, showDue, startFollowUp,
} from "./followups";

const TABS = [
  { key: "payment", label: "Payment Info" },
  { key: "details", label: "Details" },
  { key: "history", label: "History" },
  { key: "comments", label: "Comments" },
];

const HISTORY_LABEL = {
  CREATE: "Follow-up created", START: "Started", UPDATE: "Update", RESCHEDULE: "Rescheduled", COMPLETE: "Completed",
  REOPEN: "Reopened", PAUSE: "Paused", RESUME: "Resumed", REASSIGN: "Reassigned", EDIT: "Edited", CANCEL: "Cancelled",
  RESCHEDULE_REQUEST: "Reschedule requested",
};

const dash = (v) => (v == null || v === "" ? "—" : v);
const showDateTime = (v) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
};

export default function FollowUpDetails() {
  const navigate = useNavigate();
  const { taskId } = useParams();
  const { invoices, payments, followUps, loading: dataLoading, error: dataError, reload: reloadData } = useAccountantData();

  const [raw, setRaw] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [history, setHistory] = useState([]);
  const [comments, setComments] = useState([]);
  const [contact, setContact] = useState(null); // { phone } once loaded
  const [tab, setTab] = useState("payment");
  const [busy, setBusy] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState(""); // "outcome" | "reschedule" | "complete" | "reopen"

  const loadTask = useCallback(async () => {
    try {
      const [task, hist, notes] = await Promise.all([
        fetchFollowUp(taskId),
        fetchFollowUpHistory(taskId).catch(() => []),
        fetchFollowUpComments(taskId).catch(() => []),
      ]);
      setRaw(task);
      setHistory(hist);
      setComments(notes);
      setLoadError("");
    } catch (err) {
      setLoadError(err.message || "Could not load this follow-up");
    }
  }, [taskId]);

  useEffect(() => {
    loadTask();
  }, [loadTask]);

  const byId = useMemo(() => new Map(invoices.map((i) => [i.id, i])), [invoices]);
  const names = useMemo(() => new Map(invoices.map((i) => [i.customer_id, i.customer_name])), [invoices]);
  const task = useMemo(() => (raw ? cleanFollowUp(raw, byId, names) : null), [raw, byId, names]);
  const isPaymentFollowUp = raw && (raw.source_module === "PAYMENT_CUSTOMER" || raw.source_module === "PAYMENT_INVOICE");

  const customerId = task?.customer_id || "";
  useEffect(() => {
    if (!customerId) return undefined;
    let cancelled = false;
    fetchCustomerContact(customerId)
      .then((c) => { if (!cancelled) setContact(c || { phone: null }); })
      .catch(() => { if (!cancelled) setContact({ phone: null }); });
    return () => { cancelled = true; };
  }, [customerId]);

  // Live payment picture, always read from the invoices (never stored on the task).
  const customerInvoices = invoices.filter((i) => i.customer_id === customerId && i.status !== "CANCELLED");
  const customerUnpaid = customerInvoices.filter((i) => i.pending_amount > 0);
  const customerOutstanding = customerUnpaid.reduce((s, i) => s + i.pending_amount, 0);
  const invoice = task?.scope === "INVOICE" ? byId.get(task.invoice_id) : null;
  const outstanding = task?.scope === "INVOICE" ? invoice?.pending_amount ?? 0 : customerOutstanding;
  const shownInvoices = task?.scope === "INVOICE"
    ? [invoice, ...customerUnpaid.filter((i) => i.id !== task.invoice_id)].filter(Boolean)
    : customerUnpaid;
  const customerCode = customerInvoices[0]?.customer_code || "";
  const lastPayment = payments
    .filter((p) => p.customer_id === customerId && p.status !== "CANCELLED")
    .map((p) => p.payment_date)
    .sort()
    .pop();
  const otherOpen = followUps.filter((f) => f.active && f.customer_id === customerId && f.id !== task?.id).sort(byDue);

  async function run(label, action, message) {
    setBusy(label);
    setActionError("");
    setNotice("");
    try {
      await action();
      await Promise.all([loadTask(), reloadData()]);
      if (message) setNotice(message);
      return true;
    } catch (err) {
      setActionError(err.message || "That did not work. Please try again.");
      return false;
    } finally {
      setBusy("");
    }
  }

  async function afterOutcome({ outcome, rescheduled }) {
    setDialog("");
    await Promise.all([loadTask(), reloadData()]);
    setNotice(rescheduled ? "Update saved and the follow-up was rescheduled." : "Update saved.");
    if (outcome === "PAYMENT_RECEIVED") {
      navigate("/accountant/payments/record", { state: { customerId, followUpId: task.id } });
    }
  }

  const recordPayment = () => navigate("/accountant/payments/record", { state: { customerId, followUpId: task?.id } });

  if (loadError && !raw) {
    return (
      <div className="ac-page">
        <button type="button" className="ac-back" onClick={() => navigate(-1)}><FiArrowLeft /> Back</button>
        <DataError error={loadError} onRetry={loadTask} />
      </div>
    );
  }

  const active = task?.active;
  const phone = contact?.phone;

  return (
    <div className="ac-page ac-fu-page">
      <button type="button" className="ac-back" onClick={() => navigate(-1)}><FiArrowLeft /> Back</button>

      <DataError error={dataError} onRetry={reloadData} />
      {actionError && <div className="ac-info error" role="alert"><FiAlertCircle style={{ flexShrink: 0 }} /><span>{actionError}</span></div>}
      {notice && <div className="ac-info ok" role="status"><FiCheckCircle style={{ flexShrink: 0 }} /><span>{notice}</span></div>}

      <div className="ac-card ac-fu-hero">
        <div className="ac-fu-hero-main">
          <span className="ac-fu-hero-icon" aria-hidden="true"><FiCalendar /></span>
          <div style={{ minWidth: 0 }}>
            <h2 className="ac-title">{task ? task.title : <Skeleton width={260} height={24} />}</h2>
            <div className="ac-sub">
              {task ? (
                <>
                  {task.customer_name || "Customer"}{customerCode ? ` (${customerCode})` : ""}
                  {" · "}{task.scope === "INVOICE" ? `Invoice ${task.invoice_number || ""}` : "Entire customer outstanding"}
                </>
              ) : <Skeleton width={180} />}
            </div>
            {task && (
              <div className="ac-fu-badges">
                <Badge value={task.display_status} />
                {(task.status === "IN_PROGRESS" || task.status === "PAUSED") && <Badge value={task.status} />}
                <Badge value={task.priority} />
              </div>
            )}
          </div>
        </div>

        {task && isPaymentFollowUp && (
          <div className="ac-actions ac-fu-actions">
            {phone && <a className="ac-btn" href={`tel:${phone.replace(/[^\d+]/g, "")}`}><FiPhone /> Call Customer</a>}
            {task.status === "OPEN" && (
              <button type="button" className="ac-btn" disabled={Boolean(busy)} onClick={() => run("start", () => startFollowUp(task.id), "Follow-up started.")}>
                <FiPlay /> {busy === "start" ? "Starting…" : "Start"}
              </button>
            )}
            {active && <button type="button" className="ac-btn ac-btn-primary" disabled={Boolean(busy)} onClick={() => setDialog("outcome")}><FiEdit3 /> Update Follow-up</button>}
            {active && <button type="button" className="ac-btn" disabled={Boolean(busy)} onClick={() => setDialog("reschedule")}><FiCalendar /> Reschedule</button>}
            {active && <button type="button" className="ac-btn" disabled={Boolean(busy)} onClick={() => setDialog("complete")}><FiCheck /> Complete</button>}
            {active && outstanding > 0 && <button type="button" className="ac-btn" onClick={recordPayment}><FiPlusCircle /> Record Payment</button>}
            {task.status === "COMPLETED" && <button type="button" className="ac-btn" disabled={Boolean(busy)} onClick={() => setDialog("reopen")}><FiRotateCcw /> Reopen</button>}
          </div>
        )}
      </div>

      {raw && !isPaymentFollowUp && (
        <div className="ac-info error">This task is not a payment follow-up.</div>
      )}

      <div className="ac-stats ac-fu-stats-row">
        <div className="ac-stat orange"><div className="ac-stat-label">{task?.scope === "INVOICE" ? "Invoice Outstanding" : "Total Outstanding"}</div><div className="ac-stat-value">{task && !dataLoading ? money(outstanding) : "—"}</div></div>
        <div className="ac-stat blue"><div className="ac-stat-label">Pending Invoices</div><div className="ac-stat-value">{task && !dataLoading ? customerUnpaid.length : "—"}</div></div>
        <div className="ac-stat red"><div className="ac-stat-label">{task?.status === "COMPLETED" ? "Completed On" : "Next Follow-up"}</div><div className="ac-stat-value ac-fu-stat-small">{task ? (task.status === "COMPLETED" ? showDateTime(task.completed_at) : showDue(task.due_date, task.due_time)) : "—"}</div></div>
        <div className="ac-stat green"><div className="ac-stat-label">Assigned To</div><div className="ac-stat-value ac-fu-stat-small">{dash(task?.assigned_to_name)}</div></div>
      </div>

      <div className="ac-card">
        <div className="ac-tabs" style={{ marginBottom: 14 }}>
          {TABS.map((t) => (
            <button key={t.key} type="button" className={`ac-tab ${tab === t.key ? "active" : ""}`} onClick={() => setTab(t.key)}>
              {t.label}{t.key === "history" && history.length ? ` (${history.length})` : ""}{t.key === "comments" && comments.length ? ` (${comments.length})` : ""}
            </button>
          ))}
        </div>

        {tab === "payment" && (
          <div className="ac-fu-pay">
            <div className="ac-fu-pay-side">
              <h3 className="ac-card-title">Customer Details</h3>
              <dl className="ac-kv">
                <dt>Customer</dt><dd>{dash(task?.customer_name)}{customerCode ? ` (${customerCode})` : ""}</dd>
                <dt>Phone</dt>
                <dd>
                  {contact == null ? "…" : phone ? <a className="ac-link" href={`tel:${phone.replace(/[^\d+]/g, "")}`}><FiPhone /> {phone}</a> : "No phone number saved"}
                </dd>
                <dt>Total Outstanding</dt><dd className="ac-money-red">{dataLoading ? "…" : money(customerOutstanding)}</dd>
                <dt>Pending Invoices</dt><dd>{dataLoading ? "…" : customerUnpaid.length}</dd>
                <dt>Last Payment</dt><dd>{showDate(lastPayment) || "—"}</dd>
                {task?.scope === "INVOICE" && (
                  <><dt>This follow-up is for</dt><dd>{dash(task.invoice_number)} {invoice ? `(${money(invoice.pending_amount)} pending)` : ""}</dd></>
                )}
              </dl>
              <div className="ac-actions" style={{ marginTop: 14 }}>
                <button type="button" className="ac-btn" onClick={() => navigate("/accountant/payments/customer-outstanding", { state: { search: task?.customer_name || "" } })}>View Outstanding</button>
                {task?.scope === "INVOICE" && task.invoice_id && (
                  <button type="button" className="ac-btn" onClick={() => navigate(`/accountant/invoices/${task.invoice_id}`)}>View Invoice</button>
                )}
              </div>
              {otherOpen.length > 0 && (
                <p className="ac-sub" style={{ marginTop: 12 }}>
                  This customer also has {otherOpen.length} other open follow-up{otherOpen.length === 1 ? "" : "s"}.
                </p>
              )}
            </div>

            <div style={{ minWidth: 0 }}>
              <h3 className="ac-card-title">Pending Invoices</h3>
              <div className="ac-table-wrap">
                <table className="ac-table ac-stack">
                  <thead>
                    <tr><th>Invoice No</th><th>Date</th><th>Due Date</th><th className="ac-num">Amount</th><th className="ac-num">Paid</th><th className="ac-num">Pending</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {shownInvoices.length ? shownInvoices.map((i) => (
                      <tr key={i.id} className={task?.scope === "INVOICE" && i.id === task.invoice_id ? "ac-fu-row-focus" : ""}>
                        <td><button type="button" className="ac-link" onClick={() => navigate(`/accountant/invoices/${i.id}`)}>{i.invoice_number}</button></td>
                        <td>{showDate(i.invoice_date)}</td>
                        <td>{showDate(i.due_date) || "—"}</td>
                        <td className="ac-num">{money(i.invoice_amount)}</td>
                        <td className="ac-num">{money(i.paid_amount)}</td>
                        <td className={`ac-num ${i.pending_amount > 0 ? "ac-money-red" : ""}`}>{money(i.pending_amount)}</td>
                        <td><Badge value={i.status} /></td>
                      </tr>
                    )) : <EmptyRow cols={7} loading={dataLoading} text="Nothing pending — the outstanding is cleared" />}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {tab === "details" && task && (
          <dl className="ac-kv ac-fu-kv">
            <dt>Title</dt><dd>{task.title}</dd>
            <dt>Follow-up For</dt><dd>{task.scope === "INVOICE" ? `Invoice ${dash(task.invoice_number)}` : "Entire customer outstanding"}</dd>
            <dt>Status</dt><dd><Badge value={task.status === "OPEN" ? task.display_status : task.status} /></dd>
            <dt>Priority</dt><dd><Badge value={task.priority} /></dd>
            <dt>Due</dt><dd>{showDue(task.due_date, task.due_time)}</dd>
            <dt>Assigned To</dt><dd>{dash(task.assigned_to_name)}</dd>
            <dt>Created By</dt><dd>{dash(task.created_by_name)}</dd>
            <dt>Created On</dt><dd>{showDateTime(task.created_at)}</dd>
            <dt>Started</dt><dd>{showDateTime(task.started_at)}</dd>
            <dt>Completed</dt><dd>{showDateTime(task.completed_at)}</dd>
            {task.completion_note && <><dt>Completion Note</dt><dd>{task.completion_note}</dd></>}
            <dt>Notes</dt><dd style={{ whiteSpace: "pre-wrap" }}>{dash(task.notes)}</dd>
          </dl>
        )}

        {tab === "history" && (
          history.length ? (
            <ol className="ac-fu-timeline">
              {[...history].reverse().map((h) => (
                <li key={h.id} className={`act-${String(h.action).toLowerCase()}`}>
                  <span className="dot" aria-hidden="true" />
                  <div>
                    <strong>{HISTORY_LABEL[h.action] || h.action}</strong>
                    {h.note && <p>{h.note}</p>}
                    <span className="ac-sub">{showDateTime(h.changed_at)}{h.changed_by_name ? ` · ${h.changed_by_name}` : ""}</span>
                  </div>
                </li>
              ))}
            </ol>
          ) : <p className="ac-sub">{raw ? "No history yet." : "Loading…"}</p>
        )}

        {tab === "comments" && task && (
          <Comments task={task} comments={comments} onAdded={loadTask} />
        )}
      </div>

      {dialog === "outcome" && <FollowUpOutcomeModal task={task} onClose={() => setDialog("")} onSaved={afterOutcome} />}
      {dialog === "reschedule" && (
        <RescheduleDialog
          task={task}
          onClose={() => setDialog("")}
          onSave={async (date, time, reason) => {
            const ok = await run("reschedule", () => rescheduleFollowUp(task.id, date, time, reason), "Follow-up rescheduled.");
            if (ok) setDialog("");
          }}
        />
      )}
      {dialog === "complete" && (
        <CompleteDialog
          outstanding={outstanding}
          onClose={() => setDialog("")}
          onSave={async (note) => {
            const ok = await run("complete", () => completeFollowUp(task, note), "Follow-up completed.");
            if (ok) setDialog("");
          }}
        />
      )}
      {dialog === "reopen" && (
        <SimpleDialog
          title="Reopen Follow-up"
          label="Reason (optional)"
          button="Reopen"
          onClose={() => setDialog("")}
          onSave={async (reason) => {
            const ok = await run("reopen", () => reopenFollowUp(task.id, reason), "Follow-up reopened.");
            if (ok) setDialog("");
          }}
        />
      )}
    </div>
  );
}

function Comments({ task, comments, onAdded }) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const closed = !task.active;
  const notStarted = task.status === "OPEN";

  async function add(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setSaving(true);
    setError("");
    try {
      await addFollowUpComment(task.id, text.trim());
      setText("");
      await onAdded();
    } catch (err) {
      setError(err.message || "The comment could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {comments.length ? (
        <ul className="ac-fu-comments">
          {comments.map((c) => (
            <li key={c.id}>
              <span className="ac-fu-avatar" aria-hidden="true"><FiUser /></span>
              <div>
                <strong>{c.user_name || "User"}</strong> <span className="ac-sub">{showDateTime(c.created_at)}</span>
                <p>{c.comment}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : <p className="ac-sub" style={{ marginBottom: 12 }}><FiMessageSquare /> No comments yet.</p>}

      {closed ? (
        <p className="ac-sub">This follow-up is {task.status.toLowerCase()}, so comments are closed.</p>
      ) : notStarted ? (
        <p className="ac-sub">Start the follow-up to add comments.</p>
      ) : (
        <form onSubmit={add} className="ac-fu-comment-form">
          <textarea className="ac-textarea" value={text} maxLength={5000} onChange={(e) => setText(e.target.value)} placeholder="Add a comment" />
          {error && <div className="ac-info error" role="alert"><span>{error}</span></div>}
          <div className="ac-actions" style={{ justifyContent: "flex-end" }}>
            <button type="submit" className="ac-btn ac-btn-primary" disabled={saving || !text.trim()}>{saving ? "Saving…" : "Add Comment"}</button>
          </div>
        </form>
      )}
    </div>
  );
}

function RescheduleDialog({ task, onClose, onSave }) {
  const [date, setDate] = useState(task.due_date && task.due_date >= todayYmd() ? task.due_date : "");
  const [time, setTime] = useState(task.due_time || "10:00");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!date) return setError("Please choose the new date.");
    if (date < todayYmd()) return setError("The new date can't be in the past.");
    setSaving(true);
    await onSave(date, time, reason.trim());
    setSaving(false);
  }

  return (
    <div className="ac-overlay" onMouseDown={() => !saving && onClose()}>
      <form className="ac-modal ac-fu-modal" onMouseDown={(e) => e.stopPropagation()} onSubmit={submit} noValidate>
        <div className="ac-fu-modal-head">
          <h3>Reschedule Follow-up</h3>
          <button type="button" className="ac-link" aria-label="Close" onClick={onClose}><FiX /></button>
        </div>
        {error && <div className="ac-info error" style={{ marginBottom: 12 }} role="alert"><span>{error}</span></div>}
        <div className="ac-fu-form">
          <p className="ac-sub">Currently due {showDue(task.due_date, task.due_time)}. The same follow-up is moved; the change is kept in its history.</p>
          <div className="ac-grid-2">
            <div className="ac-field"><label>New Date *</label><DateInput value={date} onChange={setDate} ariaLabel="New follow-up date" /></div>
            <div className="ac-field"><label>Time</label><input className="ac-input" type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="New follow-up time" /></div>
          </div>
          <div className="ac-field">
            <label>Reason</label>
            <textarea className="ac-textarea" value={reason} maxLength={450} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Customer asked to call next week" />
          </div>
        </div>
        <div className="ac-modal-foot">
          <button type="button" className="ac-btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="ac-btn ac-btn-primary" disabled={saving}>{saving ? "Saving…" : "Reschedule"}</button>
        </div>
      </form>
    </div>
  );
}

// Completing by hand: when money is still outstanding a closing note is required,
// so a follow-up is never closed by accident.
function CompleteDialog({ outstanding, onClose, onSave }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const stillOwed = outstanding > 0;

  async function submit(e) {
    e.preventDefault();
    if (stillOwed && !note.trim()) return setError("Please say why you are closing it while money is still outstanding.");
    setSaving(true);
    await onSave(note.trim());
    setSaving(false);
  }

  return (
    <div className="ac-overlay" onMouseDown={() => !saving && onClose()}>
      <form className="ac-modal ac-fu-modal" onMouseDown={(e) => e.stopPropagation()} onSubmit={submit} noValidate>
        <div className="ac-fu-modal-head">
          <h3>Complete Follow-up</h3>
          <button type="button" className="ac-link" aria-label="Close" onClick={onClose}><FiX /></button>
        </div>
        {stillOwed ? (
          <div className="ac-note" style={{ color: "#b45309", marginBottom: 12 }}>
            <FiClock /> {money(outstanding)} is still outstanding. Reschedule the follow-up instead, or give a closing reason.
          </div>
        ) : (
          <div className="ac-note ok" style={{ marginBottom: 12 }}><FiCheckCircle /> The outstanding is cleared.</div>
        )}
        {error && <div className="ac-info error" style={{ marginBottom: 12 }} role="alert"><span>{error}</span></div>}
        <div className="ac-field">
          <label>Closing Note{stillOwed ? " *" : " (optional)"}</label>
          <textarea className="ac-textarea" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Customer settled the amount" />
        </div>
        <div className="ac-modal-foot">
          <button type="button" className="ac-btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="ac-btn ac-btn-primary" disabled={saving}><FiFileText /> {saving ? "Saving…" : "Complete"}</button>
        </div>
      </form>
    </div>
  );
}

function SimpleDialog({ title, label, button, onClose, onSave }) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <div className="ac-overlay" onMouseDown={() => !saving && onClose()}>
      <form className="ac-modal ac-fu-modal" onMouseDown={(e) => e.stopPropagation()}
        onSubmit={async (e) => { e.preventDefault(); setSaving(true); await onSave(text.trim()); setSaving(false); }}>
        <div className="ac-fu-modal-head">
          <h3>{title}</h3>
          <button type="button" className="ac-link" aria-label="Close" onClick={onClose}><FiX /></button>
        </div>
        <div className="ac-field">
          <label>{label}</label>
          <textarea className="ac-textarea" value={text} maxLength={500} onChange={(e) => setText(e.target.value)} />
        </div>
        <div className="ac-modal-foot">
          <button type="button" className="ac-btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="ac-btn ac-btn-primary" disabled={saving}>{saving ? "Saving…" : button}</button>
        </div>
      </form>
    </div>
  );
}

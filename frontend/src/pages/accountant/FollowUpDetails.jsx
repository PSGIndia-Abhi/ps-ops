import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  FiAlertCircle, FiArrowLeft, FiCalendar, FiCheck, FiCheckCircle, FiClock, FiEdit3, FiFileText, FiMessageSquare,
  FiPaperclip, FiPhone, FiPlay, FiPlusCircle, FiRepeat, FiRotateCcw, FiTrash2, FiUpload, FiUser, FiX,
} from "react-icons/fi";
import CustomerContacts from "../../components/accountant/CustomerContacts";
import FollowUpOutcomeModal from "../../components/accountant/FollowUpOutcomeModal";
import { Badge, DataError, EmptyRow, Skeleton } from "./ui";
import { money } from "./format";
import { byDue, cleanFollowUp, showDate, useAccountantData } from "./data";
import {
  addFollowUpComment, completeFollowUp, deleteFollowUpAttachment, fetchCustomerContact, fetchFollowUp, fetchFollowUpAttachments,
  fetchFollowUpComments, fetchFollowUpHistory, fetchReminderSchedule, MAX_ATTACHMENT_MB, repeatEnd, repeatText, openFollowUpAttachment, uploadFollowUpAttachment,
  reopenFollowUp, showDue, startFollowUp,
} from "./followups";

const TABS = [
  { key: "payment", label: "Payment Info" },
  { key: "details", label: "Details" },
  { key: "history", label: "History" },
  { key: "comments", label: "Comments" },
  { key: "attachments", label: "Attachments" },
];

const HISTORY_LABEL = {
  CREATE: "Reminder created", START: "Started", UPDATE: "Update", RESCHEDULE: "Rescheduled", COMPLETE: "Completed",
  REOPEN: "Reopened", ATTACH: "File attached", DETACH: "File removed", PAUSE: "Paused", RESUME: "Resumed", REASSIGN: "Reassigned", EDIT: "Edited", CANCEL: "Cancelled",
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
  const location = useLocation();
  // Back returns to where the accountant came from; opened directly (bookmark, refresh) there is
  // no previous page, so it goes to Tasks & Reminders instead of doing nothing.
  const goBack = () => (location.key !== "default" ? navigate(-1) : navigate("/accountant/tasks"));
  const { invoices, payments, followUps, loading: dataLoading, error: dataError, reload: reloadData } = useAccountantData();

  const [raw, setRaw] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [history, setHistory] = useState([]);
  const [comments, setComments] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [schedule, setSchedule] = useState(null); // how the reminder repeats, when it does
  const [contact, setContact] = useState(null); // { phone } once loaded
  const [tab, setTab] = useState("payment");
  const [busy, setBusy] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState(""); // "outcome" | "complete" | "reopen"

  const loadTask = useCallback(async () => {
    try {
      const [task, hist, notes, files] = await Promise.all([
        fetchFollowUp(taskId),
        fetchFollowUpHistory(taskId).catch(() => []),
        fetchFollowUpComments(taskId).catch(() => []),
        fetchFollowUpAttachments(taskId).catch(() => []),
      ]);
      setRaw(task);
      setHistory(hist);
      setComments(notes);
      setAttachments(files);
      setLoadError("");
    } catch (err) {
      setLoadError(err.message || "Could not load this reminder");
    }
  }, [taskId]);

  useEffect(() => {
    loadTask();
  }, [loadTask]);

  // A repeating reminder: load its schedule, to say how it repeats.
  const seriesId = raw?.series_id || "";
  useEffect(() => {
    if (!seriesId) return undefined;
    let cancelled = false;
    fetchReminderSchedule(seriesId).then((s) => { if (!cancelled) setSchedule(s); }).catch(() => {});
    return () => { cancelled = true; };
  }, [seriesId]);
  const repeats = schedule?.recurrence && schedule.status !== "CANCELLED"
    ? `${repeatText(schedule.recurrence)}${repeatEnd(schedule.recurrence) ? ` until ${showDate(repeatEnd(schedule.recurrence))}` : ""}`
    : "";

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
  // An invoice reminder shows only its own invoice; a whole-customer reminder shows all unpaid ones.
  const shownInvoices = task?.scope === "INVOICE" ? [invoice].filter(Boolean) : customerUnpaid;
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
    setNotice(rescheduled ? "Update saved and the reminder was rescheduled." : "Update saved.");
    if (outcome === "PAYMENT_RECEIVED") {
      navigate("/accountant/payments/record", { state: { customerId, followUpId: task.id } });
    }
  }

  const recordPayment = () => navigate("/accountant/payments/record", { state: { customerId, followUpId: task?.id } });

  if (loadError && !raw) {
    return (
      <div className="ac-page">
        <button type="button" className="ac-fu-back" onClick={goBack}><FiArrowLeft /> Back</button>
        <DataError error={loadError} onRetry={loadTask} />
      </div>
    );
  }

  const active = task?.active;
  const started = active && task.status !== "OPEN"; // in progress (or paused)
  const phone = contact?.phone;

  return (
    <div className="ac-page ac-fu-page">
      <button type="button" className="ac-fu-back" onClick={goBack}><FiArrowLeft /> Back</button>

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
                <Badge value={task.priority} />
                {repeats && <span className="ac-fu-repeat" title="This reminder repeats"><FiRepeat /> {repeats}</span>}
              </div>
            )}
          </div>
        </div>

        {task && isPaymentFollowUp && (
          <div className="ac-actions ac-fu-actions">
            {phone && <a className="ac-btn" href={`tel:${phone.replace(/[^\d+]/g, "")}`}><FiPhone /> Call Customer</a>}
            {task.status === "OPEN" && (
              <button type="button" className="ac-btn" disabled={Boolean(busy)} onClick={() => run("start", () => startFollowUp(task.id), "Reminder started.")}>
                <FiPlay /> {busy === "start" ? "Starting…" : "Start"}
              </button>
            )}
            {/* Update and Complete only appear once the reminder has been started */}
            {started && <button type="button" className="ac-btn ac-btn-primary" disabled={Boolean(busy)} onClick={() => setDialog("outcome")}><FiEdit3 /> Update Reminder</button>}
            {started && <button type="button" className="ac-btn" disabled={Boolean(busy)} onClick={() => setDialog("complete")}><FiCheck /> Complete</button>}
            {active && outstanding > 0 && <button type="button" className="ac-btn" onClick={recordPayment}><FiPlusCircle /> Record Payment</button>}
            {task.status === "COMPLETED" && <button type="button" className="ac-btn" disabled={Boolean(busy)} onClick={() => setDialog("reopen")}><FiRotateCcw /> Reopen</button>}
          </div>
        )}

        {task && isPaymentFollowUp && (
          <ReminderTrack
            task={task}
            contacted={history.some((h) => h.action === "UPDATE")}
            paid={!dataLoading && (task.scope !== "INVOICE" || Boolean(invoice)) && outstanding <= 0}
          />
        )}
      </div>

      {raw && !isPaymentFollowUp && (
        <div className="ac-info error">This task is not a payment reminder.</div>
      )}

      <div className="ac-stats ac-fu-stats-row">
        <div className="ac-stat orange"><div className="ac-stat-label">{task?.scope === "INVOICE" ? "Invoice Outstanding" : "Total Outstanding"}</div><div className="ac-stat-value">{task && !dataLoading ? money(outstanding) : "—"}</div></div>
        <div className="ac-stat blue"><div className="ac-stat-label">{task?.scope === "INVOICE" ? "Invoice" : "Pending Invoices"}</div><div className="ac-stat-value">{task && !dataLoading ? (task.scope === "INVOICE" ? task.invoice_number || "—" : customerUnpaid.length) : "—"}</div></div>
        <div className="ac-stat red"><div className="ac-stat-label">{task?.status === "COMPLETED" ? "Completed On" : "Next Reminder"}</div><div className="ac-stat-value ac-fu-stat-small">{task ? (task.status === "COMPLETED" ? showDateTime(task.completed_at) : showDue(task.due_date, task.due_time)) : "—"}</div></div>
        <div className="ac-stat green"><div className="ac-stat-label">Assigned To</div><div className="ac-stat-value ac-fu-stat-small">{dash(task?.assigned_to_name)}</div></div>
      </div>

      <div className="ac-card">
        <div className="ac-tabs" style={{ marginBottom: 14 }}>
          {TABS.map((t) => (
            <button key={t.key} type="button" className={`ac-tab ${tab === t.key ? "active" : ""}`} onClick={() => setTab(t.key)}>
              {t.label}{t.key === "history" && history.length ? ` (${history.length})` : ""}{t.key === "comments" && comments.length ? ` (${comments.length})` : ""}{t.key === "attachments" && attachments.length ? ` (${attachments.length})` : ""}
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
                  <CustomerContacts
                    variant="line"
                    customerId={customerId}
                    customerName={task?.customer_name}
                    data={contact}
                    onSaved={async () => {
                      setContact(await fetchCustomerContact(customerId).catch(() => contact));
                      setNotice("Contact saved.");
                    }}
                  />
                </dd>
                <dt>Total Outstanding</dt><dd className="ac-money-red">{dataLoading ? "…" : money(customerOutstanding)}</dd>
                <dt>Pending Invoices</dt><dd>{dataLoading ? "…" : customerUnpaid.length}</dd>
                <dt>Last Payment</dt><dd>{showDate(lastPayment) || "—"}</dd>
                {task?.scope === "INVOICE" && (
                  <><dt>This reminder is for</dt><dd>{dash(task.invoice_number)} {invoice ? `(${money(invoice.pending_amount)} pending)` : ""}</dd></>
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
                  This customer also has {otherOpen.length} other open reminder{otherOpen.length === 1 ? "" : "s"}.
                </p>
              )}
            </div>

            <div style={{ minWidth: 0 }}>
              <h3 className="ac-card-title">{task?.scope === "INVOICE" ? "Invoice" : "Pending Invoices"}</h3>
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
            <dt>Reminder For</dt><dd>{task.scope === "INVOICE" ? `Invoice ${dash(task.invoice_number)}` : "Entire customer outstanding"}</dd>
            <dt>Status</dt><dd><Badge value={task.display_status} /></dd>
            <dt>Priority</dt><dd><Badge value={task.priority} /></dd>
            <dt>Due</dt><dd>{showDue(task.due_date, task.due_time)}</dd>
            {seriesId && <><dt>Repeats</dt><dd>{repeats || (schedule ? "No longer repeating" : "…")}</dd></>}
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

        {tab === "attachments" && task && (
          <Attachments task={task} attachments={attachments} onChanged={loadTask} />
        )}
      </div>

      {dialog === "outcome" && <FollowUpOutcomeModal task={task} onClose={() => setDialog("")} onSaved={afterOutcome} />}
      {dialog === "complete" && (
        <CompleteDialog
          outstanding={outstanding}
          onClose={() => setDialog("")}
          onSave={async (note) => {
            const ok = await run("complete", () => completeFollowUp(task, note), "Reminder completed.");
            if (ok) setDialog("");
          }}
        />
      )}
      {dialog === "reopen" && (
        <SimpleDialog
          title="Reopen Reminder"
          label="Reason (optional)"
          button="Reopen"
          onClose={() => setDialog("")}
          onSave={async (reason) => {
            const ok = await run("reopen", () => reopenFollowUp(task.id, reason), "Reminder reopened.");
            if (ok) setDialog("");
          }}
        />
      )}
    </div>
  );
}

// Where the reminder stands, as a row of steps: a tick for each one reached, a number for the
// rest, and the next one to do highlighted. Read from the reminder as it is now (its status,
// its updates, the money still owed); nothing extra is stored.
function ReminderTrack({ task, contacted, paid }) {
  const cancelled = task.status === "CANCELLED";
  const closed = task.status === "COMPLETED" || cancelled;
  const steps = [
    { label: "Created", done: true },
    { label: "Started", done: task.status !== "OPEN" || Boolean(task.started_at) },
    { label: "Customer Contacted", done: contacted },
    { label: "Payment Received", done: paid },
    { label: cancelled ? "Cancelled" : "Completed", done: closed },
  ];
  const reached = steps.reduce((last, s, i) => (s.done ? i : last), 0); // the furthest step reached
  const next = closed ? -1 : steps.findIndex((s) => !s.done);

  return (
    <ol className="ac-track" aria-label="Reminder progress">
      {steps.map((s, i) => (
        <li key={s.label} className={`${s.done ? "done" : ""}${i === next ? " current" : ""}${i <= reached ? " reached" : ""}`}
          aria-current={i === next ? "step" : undefined}>
          <span className="ac-track-dot" aria-hidden="true">{s.done ? <FiCheck /> : i + 1}</span>
          <span className="ac-track-label">{s.label}<span className="ac-track-sr">{s.done ? " (done)" : i === next ? " (next)" : ""}</span></span>
        </li>
      ))}
    </ol>
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
        <p className="ac-sub">This reminder is {task.status.toLowerCase()}, so comments are closed.</p>
      ) : notStarted ? (
        <p className="ac-sub">Start the reminder to add comments.</p>
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

const fileSize = (bytes) => {
  const n = Number(bytes) || 0;
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
};

// Files kept with the reminder (a cheque photo, a payment advice, an email...). Like
// comments: the reminder must be started, and a completed or cancelled one is closed.
function Attachments({ task, attachments, onChanged }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(""); // "upload", or the id of the file being opened/removed
  const [error, setError] = useState("");
  const [removing, setRemoving] = useState(null); // the file the "Remove?" dialog is open for
  const closed = !task.active;
  const notStarted = task.status === "OPEN";

  async function run(label, action) {
    setBusy(label);
    setError("");
    try {
      await action();
      return true;
    } catch (err) {
      setError(err.message || "That did not work. Please try again.");
      return false;
    } finally {
      setBusy("");
    }
  }

  async function upload(e) {
    const files = [...e.target.files];
    e.target.value = ""; // so choosing the same file again still fires
    if (!files.length) return;
    const tooBig = files.find((f) => f.size > MAX_ATTACHMENT_MB * 1024 * 1024);
    if (tooBig) return setError(`${tooBig.name} is larger than ${MAX_ATTACHMENT_MB} MB.`);
    await run("upload", async () => {
      // one at a time: the server takes a single file per request
      for (const file of files) await uploadFollowUpAttachment(task.id, file);
    });
    await onChanged();
  }

  return (
    <div>
      {error && <div className="ac-info error" style={{ marginBottom: 12 }} role="alert"><span>{error}</span></div>}

      {attachments.length ? (
        <ul className="ac-files">
          {attachments.map((a) => (
            <li key={a.id}>
              <span className="ac-files-icon" aria-hidden="true"><FiPaperclip /></span>
              <div className="ac-files-main">
                <button type="button" className="ac-link" disabled={Boolean(busy)} onClick={() => run(a.id, () => openFollowUpAttachment(task.id, a))}>
                  {busy === a.id ? "Opening…" : a.file_name}
                </button>
                <span className="ac-sub">{fileSize(a.file_size)} · {showDateTime(a.created_at)}{a.uploaded_by_name ? ` · ${a.uploaded_by_name}` : ""}</span>
              </div>
              {!closed && !notStarted && (
                <button type="button" className="ac-icon-btn ac-files-remove" disabled={Boolean(busy)} onClick={() => setRemoving(a)}
                  title={`Remove ${a.file_name}`} aria-label={`Remove ${a.file_name}`}><FiTrash2 /></button>
              )}
            </li>
          ))}
        </ul>
      ) : <p className="ac-sub" style={{ marginBottom: 12 }}><FiPaperclip /> No files attached yet.</p>}

      {closed ? (
        <p className="ac-sub">This reminder is {task.status.toLowerCase()}, so files are closed.</p>
      ) : notStarted ? (
        <p className="ac-sub">Start the reminder to attach files.</p>
      ) : (
        <div className="ac-actions" style={{ alignItems: "center" }}>
          <input ref={input} type="file" multiple hidden onChange={upload} aria-label="Choose files to attach" />
          <button type="button" className="ac-btn ac-btn-primary" disabled={Boolean(busy)} onClick={() => input.current?.click()}>
            <FiUpload /> {busy === "upload" ? "Uploading…" : "Attach File"}
          </button>
          <span className="ac-sub">Up to {MAX_ATTACHMENT_MB} MB each</span>
        </div>
      )}

      {removing && (
        <div className="ac-overlay" onMouseDown={() => !busy && setRemoving(null)}>
          <div className="ac-modal" onMouseDown={(e) => e.stopPropagation()}>
            <h3>Remove this file?</h3>
            <p className="ac-sub" style={{ fontSize: 14, overflowWrap: "anywhere" }}>{removing.file_name} will be deleted from this reminder. This cannot be undone.</p>
            <div className="ac-modal-foot">
              <button type="button" className="ac-btn" onClick={() => setRemoving(null)} disabled={Boolean(busy)}>Cancel</button>
              <button type="button" className="ac-btn ac-btn-primary" disabled={Boolean(busy)}
                onClick={async () => {
                  const ok = await run(removing.id, () => deleteFollowUpAttachment(task.id, removing.id));
                  setRemoving(null);
                  if (ok) await onChanged();
                }}>
                <FiTrash2 /> Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Completing by hand: when money is still outstanding a closing note is required,
// so a reminder is never closed by accident.
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
          <h3>Complete Reminder</h3>
          <button type="button" className="ac-link" aria-label="Close" onClick={onClose}><FiX /></button>
        </div>
        {stillOwed ? (
          <div className="ac-note" style={{ color: "#b45309", marginBottom: 12 }}>
            <FiClock /> {money(outstanding)} is still outstanding. Use Update Reminder to set a new date instead, or give a closing reason.
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

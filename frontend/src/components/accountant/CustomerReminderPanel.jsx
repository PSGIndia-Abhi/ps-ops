import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiBell, FiCheckCircle, FiClock, FiEdit3, FiExternalLink, FiPlus, FiX } from "react-icons/fi";
import CustomerContacts from "./CustomerContacts";
import FollowUpModal from "./FollowUpModal";
import FollowUpOutcomeModal from "./FollowUpOutcomeModal";
import { Badge } from "../../pages/accountant/ui";
import { money } from "../../pages/accountant/format";
import { byDue, daysOverdue, showDate } from "../../pages/accountant/data";
import { fetchCustomerContact, fetchFollowUpComments, fetchFollowUpHistory, showDue } from "../../pages/accountant/followups";
import "../../pages/accountant/accountant.css";

const MODE_LABEL = { CASH: "Cash", UPI: "UPI", BANK_TRANSFER: "Bank Transfer", NEFT: "NEFT", CHEQUE: "Cheque", CARD: "Card", OTHER: "Other" };

// Reminder history entries (work_task_history actions) in the words the accountant uses.
const EVENT = {
  CREATE: { title: "Reminder created", tone: "blue" },
  START: { title: "Reminder started", tone: "blue" },
  UPDATE: { title: "Reminder update", tone: "blue" },
  RESCHEDULE: { title: "Reminder rescheduled", tone: "amber" },
  COMPLETE: { title: "Reminder completed", tone: "green" },
  REOPEN: { title: "Reminder reopened", tone: "amber" },
  PAUSE: { title: "Reminder paused", tone: "amber" },
  RESUME: { title: "Reminder resumed", tone: "blue" },
  EDIT: { title: "Reminder updated", tone: "blue" },
  REASSIGN: { title: "Reminder reassigned", tone: "blue" },
  CANCEL: { title: "Reminder cancelled", tone: "red" },
  ATTACH: { title: "File attached", tone: "blue" },
  DETACH: { title: "File removed", tone: "amber" },
};

const MAX_HISTORY_TASKS = 10; // history is loaded for the customer's 10 most recent reminders

// "Due 2026-10-11 10:00:00 moved to 2026-10-16 10:00: reason" -> "11 Oct 2026, 10:00 AM → 16 Oct 2026, 10:00 AM · reason"
function readableReschedule(note) {
  const m = /^Due (\d{4}-\d{2}-\d{2})(?: (\d{2}:\d{2})(?::\d{2})?)? moved to (\d{4}-\d{2}-\d{2})(?: (\d{2}:\d{2})(?::\d{2})?)?(?:: (.*))?$/s.exec(note || "");
  if (!m) return note;
  const [, fromDate, fromTime, toDate, toTime, reason] = m;
  return `${showDue(fromDate, fromTime)} → ${showDue(toDate, toTime)}${reason ? ` · ${reason}` : ""}`;
}

const when = (ms) =>
  new Date(ms).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });

// The Customer Outstanding side panel, in one of two separate modes:
//   mode "reminder" (the bell): outstanding, unpaid invoices and the customer's reminders
//                               (payment reminders) with Create / Update / Open.
//   mode "history"  (the clock): the customer's whole activity timeline, newest first --
//                               reminder events, notes/comments and payments.
//   customer: a row from groupByCustomer()   invoices / payments / followUps: from useAccountantData()
//   onChanged(): reload the page's data after something was saved
export default function CustomerReminderPanel({ customer, invoices, payments, followUps, onClose, onChanged, mode = "reminder" }) {
  const navigate = useNavigate();
  const isHistory = mode === "history";
  const [createOpen, setCreateOpen] = useState(false);
  const [updating, setUpdating] = useState(null); // the reminder the Update dialog is open for
  const [history, setHistory] = useState(null); // null while loading
  const [comments, setComments] = useState([]);
  const [notice, setNotice] = useState("");
  const [contact, setContact] = useState(null); // the customer's phone numbers; null while loading

  // Only the Reminder panel shows the Contact section.
  const loadContact = useCallback(
    () => fetchCustomerContact(customer.id).catch(() => ({ contacts: [] })),
    [customer.id]
  );
  useEffect(() => {
    if (isHistory) return undefined;
    let cancelled = false;
    loadContact().then((c) => { if (!cancelled) setContact(c); });
    return () => { cancelled = true; };
  }, [loadContact, isHistory]);

  const unpaid = useMemo(
    () => invoices
      .filter((i) => i.customer_id === customer.id && i.status !== "CANCELLED" && i.pending_amount > 0)
      .sort((a, b) => byDue({ due_date: a.due_date || a.invoice_date }, { due_date: b.due_date || b.invoice_date })),
    [invoices, customer.id]
  );
  const reminders = useMemo(
    () => followUps
      .filter((f) => f.customer_id === customer.id)
      .sort((a, b) => (a.active === b.active ? (a.active ? byDue(a, b) : byDue(b, a)) : a.active ? -1 : 1)),
    [followUps, customer.id]
  );
  // The panel lists every open reminder of the customer, soonest due first (a whole-customer
  // reminder and reminders for single invoices can be open at the same time).
  const openReminders = reminders.filter((f) => f.active);
  // The invoices the open reminders are for: only the one(s) the accountant picked. A whole-customer
  // reminder (or no reminder yet) shows all the customer's unpaid invoices.
  const shownInvoices = useMemo(() => {
    const open = reminders.filter((f) => f.active);
    if (!open.length || open.some((f) => f.scope === "CUSTOMER")) return unpaid;
    const ids = new Set(open.map((f) => f.invoice_id));
    return unpaid.filter((i) => ids.has(i.id));
  }, [reminders, unpaid]);
  const customerPayments = payments.filter((p) => p.customer_id === customer.id && p.status !== "CANCELLED");

  // Reminder events come from each reminder's own history; reloaded whenever the reminders change.
  const historyKey = reminders.slice(0, MAX_HISTORY_TASKS).map((f) => `${f.id}:${f.status}:${f.due_date}:${f.due_time}`).join("|");
  // Only the History panel loads it.
  useEffect(() => {
    if (!isHistory) return undefined;
    let cancelled = false;
    const list = reminders.slice(0, MAX_HISTORY_TASKS);
    Promise.all([
      Promise.all(list.map((f) => fetchFollowUpHistory(f.id).then((rows) => rows.map((h) => ({ ...h, reminder: f }))).catch(() => []))),
      Promise.all(list.map((f) => fetchFollowUpComments(f.id).then((rows) => rows.map((c) => ({ ...c, reminder: f }))).catch(() => []))),
    ]).then(([hist, notes]) => {
      if (cancelled) return;
      setHistory(hist.flat());
      setComments(notes.flat());
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- historyKey captures every change that matters
  }, [historyKey, isHistory]);

  // One timeline: reminder events, notes/comments and payments received, newest first.
  const timeline = useMemo(() => {
    // A call-outcome update is saved both as a history UPDATE and as a comment; it is shown once.
    const updateNotes = new Set((history || []).filter((h) => h.action === "UPDATE").map((h) => `${h.reminder.id}|${(h.note || "").trim()}`));
    const noteEvents = comments
      .filter((c) => !updateNotes.has(`${c.reminder.id}|${(c.comment || "").trim()}`))
      .map((c) => ({
        key: `c${c.id}`, at: new Date(c.created_at).getTime() || 0, title: "Note / comment", tone: "blue",
        detail: c.comment, by: c.user_name || "",
      }));
    const events = (history || []).map((h) => {
      const e = EVENT[h.action] || { title: h.action, tone: "blue" };
      const scope = h.reminder.scope === "INVOICE" ? `Invoice ${h.reminder.invoice_number || ""}` : "Whole customer";
      // History rows don't keep the original due date, so "created" shows what it was for, not a date.
      const detail = h.action === "CREATE"
        ? `${scope}${h.reminder.notes ? ` · ${h.reminder.notes}` : ""}`
        : h.action === "RESCHEDULE" ? readableReschedule(h.note) : h.note || scope;
      return { key: `h${h.id}`, at: new Date(h.changed_at).getTime() || 0, title: e.title, tone: e.tone, detail, by: h.changed_by_name || "" };
    });
    const paid = customerPayments.map((p) => ({
      key: `p${p.id}`,
      at: new Date(`${p.payment_date}T12:00:00`).getTime() || 0,
      title: "Payment received",
      tone: "green",
      detail: `${money(p.received_amount)}${p.tds_amount ? ` + TDS ${money(p.tds_amount)}` : ""} · ${MODE_LABEL[p.payment_mode] || p.payment_mode}${p.reference_number ? ` · UTR ${p.reference_number}` : ""}`,
      by: p.created_by || "",
      dateOnly: true,
    }));
    return [...events, ...noteEvents, ...paid].sort((a, b) => b.at - a.at);
  }, [history, comments, customerPayments]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !createOpen && !updating) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, createOpen, updating]);

  const late = (daysOverdue(customer.oldest_due) ?? 0) > 0;

  return (
    <>
    <div className="ac-drawer-overlay" onMouseDown={onClose}>
      <aside className="ac-drawer" role="dialog" aria-label={`${isHistory ? "History" : "Reminders"} for ${customer.name}`} onMouseDown={(e) => e.stopPropagation()}>
        <header className="ac-drawer-head">
          <span className={`ac-drawer-icon${isHistory ? " history" : ""}`} aria-hidden="true">{isHistory ? <FiClock /> : <FiBell />}</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h3>{customer.name}</h3>
            <span className="ac-sub">{customer.code ? `${customer.code} · ` : ""}{isHistory ? "Activity history" : "Payment reminders"}</span>
          </div>
          <button type="button" className="ac-link ac-drawer-close" aria-label="Close" onClick={onClose}><FiX /></button>
        </header>

        <div className="ac-drawer-body">
          {notice && <div className="ac-info ok"><FiCheckCircle style={{ flexShrink: 0 }} /><span>{notice}</span></div>}


          {!isHistory && (<>
          <CustomerContacts
            customerId={customer.id}
            data={contact}
            onSaved={async () => { setContact(await loadContact()); setNotice("Contact saved."); }}
          />

          <section>
            <h4 className="ac-drawer-title">Unpaid Invoices</h4>
            <div className="ac-table-wrap">
              <table className="ac-table ac-drawer-table">
                <thead><tr><th>Invoice No</th><th>Due Date</th><th className="ac-num">Pending</th><th>Status</th></tr></thead>
                <tbody>
                  {shownInvoices.length ? shownInvoices.map((i) => (
                    <tr key={i.id} className="ac-fu-click" onClick={() => navigate(`/accountant/invoices/${i.id}`)}>
                      <td><span className="ac-link">{i.invoice_number}</span></td>
                      <td>{showDate(i.due_date) || "—"}</td>
                      <td className="ac-num ac-money-red">{money(i.pending_amount)}</td>
                      <td><Badge value={i.status} /></td>
                    </tr>
                  )) : <tr><td className="ac-empty" colSpan={4}>No unpaid invoices</td></tr>}
                </tbody>
              </table>
            </div>
            {late && <p className="ac-sub" style={{ marginTop: 6 }}><FiClock style={{ verticalAlign: "-2px" }} /> Oldest due {showDate(customer.oldest_due)}</p>}
          </section>

          <section>
            <div className="ac-drawer-row">
              <h4 className="ac-drawer-title">Reminders</h4>
              <button type="button" className="ac-btn ac-btn-primary ac-btn-sm" onClick={() => setCreateOpen(true)}><FiPlus /> Create Reminder</button>
            </div>
            {openReminders.length ? (
              <ul className="ac-rem-list">
                {openReminders.map((f) => (
                  <li key={f.id} className={f.active ? "" : "done"}>
                    <span className={`ac-rem-bell ${f.display_status === "OVERDUE" && f.active ? "late" : f.active ? "on" : ""}`} aria-hidden="true"><FiBell /></span>
                    <div className="ac-rem-main">
                      <strong>{f.active ? showDue(f.due_date, f.due_time) : f.status === "COMPLETED" ? "Completed" : "Cancelled"}</strong>
                      <span>{f.scope === "INVOICE" ? `Invoice ${f.invoice_number || ""}` : "Whole customer"}{f.series_id ? " · Repeats" : ""}{f.notes ? ` · ${f.notes}` : ""}</span>
                    </div>
                    <div className="ac-rem-side">
                      <Badge value={f.display_status} />
                      <div className="ac-actions" style={{ flexWrap: "nowrap", gap: 10 }}>
                        {/* like the reminder page: Update only once the reminder has been started (Open has Start) */}
                        {f.active && f.status !== "OPEN" && <button type="button" className="ac-link" onClick={() => setUpdating(f)}><FiEdit3 style={{ verticalAlign: "-2px" }} /> Update</button>}
                        <button type="button" className="ac-link" onClick={() => navigate(`/accountant/follow-ups/${f.id}`)}><FiExternalLink style={{ verticalAlign: "-2px" }} /> Open</button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ac-sub">No open reminder for this customer.</p>
            )}
          </section>
          </>)}

          {isHistory && (
          <section>
            <h4 className="ac-drawer-title">Activity History</h4>
            {history == null ? (
              <p className="ac-sub">Loading…</p>
            ) : timeline.length ? (
              <ol className="ac-fu-timeline">
                {timeline.slice(0, 40).map((t) => (
                  <li key={t.key} className={`tone-${t.tone}`}>
                    <span className="dot" aria-hidden="true" />
                    <div>
                      <strong>{t.title}</strong>
                      {t.detail && <p>{t.detail}</p>}
                      <span className="ac-sub">{t.dateOnly ? showDate(new Date(t.at)) : when(t.at)}{t.by ? ` · ${t.by}` : ""}</span>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="ac-sub">No activity yet.</p>
            )}
          </section>
          )}
        </div>

      </aside>
    </div>

      {/* Dialogs sit outside the panel's backdrop, so closing one never closes the panel too. */}
      <FollowUpModal
        key={createOpen ? "open" : "closed"}
        open={createOpen}
        title="Create Reminder"
        onClose={() => setCreateOpen(false)}
        onCreated={async () => { setNotice("Reminder saved."); await onChanged?.(); }}
        invoices={invoices}
        followUps={followUps}
        customerId={customer.id}
        lockCustomer
      />
      {updating && (
        <FollowUpOutcomeModal
          task={updating}
          onClose={() => setUpdating(null)}
          onSaved={async ({ outcome, rescheduled }) => {
            setUpdating(null);
            setNotice(rescheduled ? "Reminder updated and rescheduled." : "Reminder updated.");
            await onChanged?.();
            if (outcome === "PAYMENT_RECEIVED") navigate("/accountant/payments/record", { state: { customerId: customer.id, followUpId: updating.id } });
          }}
        />
      )}
    </>
  );
}

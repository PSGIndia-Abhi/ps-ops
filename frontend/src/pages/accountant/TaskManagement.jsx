import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FiCheckCircle, FiChevronDown, FiChevronRight, FiPlus, FiRepeat } from "react-icons/fi";
import FollowUpModal from "../../components/accountant/FollowUpModal";
import { Badge, DataError, EmptyRow, Pager } from "./ui";
import { money } from "./format";
import { byDue, showDate, useAccountantData, usePaged, ymd } from "./data";
import { fetchReminderSchedules, repeatEnd, repeatText, showDue, stopReminderSchedule } from "./followups";

// Tasks & Reminders: the accountant's payment reminders. Each one is a Task
// Management task pointing at a customer or an invoice (see data.js).
const TABS = [
  { key: "ALL", label: "All", test: () => true },
  { key: "TODAY", label: "Today", test: (f) => f.active && f.display_status === "TODAY" },
  { key: "OVERDUE", label: "Overdue", test: (f) => f.active && f.display_status === "OVERDUE" },
  { key: "UPCOMING", label: "Upcoming", test: (f) => f.active && f.display_status === "UPCOMING" },
  { key: "COMPLETED", label: "Completed", test: (f) => f.status === "COMPLETED" },
];
const REPEATING = "REPEATING"; // the tab that lists repeating reminders (schedules), not reminders
const EMPTY_FILTERS = { priority: "", scope: "", customer: "", from: "", to: "" };
const uniq = (list, key) => [...new Set(list.map((i) => i[key]).filter(Boolean))].sort();

export default function TaskManagement() {
  const navigate = useNavigate();
  const location = useLocation();
  const { invoices, followUps, loading, error, reminderError, reload } = useAccountantData();
  const [tab, setTab] = useState(location.state?.tab || "ALL");
  const [createOpen, setCreateOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const filterRef = useRef(null);

  // Repeating reminders: each is one reminder that comes due again on a schedule.
  const [schedules, setSchedules] = useState([]);
  const [stopping, setStopping] = useState(null); // the schedule the "Stop?" dialog is open for
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [scheduleError, setScheduleError] = useState("");
  const loadSchedules = useCallback(async () => {
    try {
      setSchedules(await fetchReminderSchedules());
      setScheduleError("");
    } catch (err) {
      setScheduleError(err.message || "Could not load the repeating reminders");
    }
  }, []);
  useEffect(() => {
    loadSchedules();
  }, [loadSchedules]);

  // Close the dropdown when the user clicks outside it or presses Escape.
  useEffect(() => {
    if (!showFilters) return undefined;
    const onDown = (e) => { if (!filterRef.current?.contains(e.target)) setShowFilters(false); };
    const onKey = (e) => { if (e.key === "Escape") setShowFilters(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [showFilters]);

  const setFilter = (key) => (e) => { setFilters((f) => ({ ...f, [key]: e.target.value })); setPage(0); };
  const activeFilters = Object.values(filters).filter(Boolean).length;
  const customerOptions = useMemo(() => uniq(followUps, "customer_name"), [followUps]);

  // Live outstanding per reminder: the invoice's pending, or the customer's total pending.
  const outstandingOf = useMemo(() => {
    const byInvoice = new Map(invoices.map((i) => [i.id, i]));
    const byCustomer = new Map();
    for (const i of invoices) {
      if (i.status === "CANCELLED" || i.pending_amount <= 0) continue;
      byCustomer.set(i.customer_id, (byCustomer.get(i.customer_id) || 0) + i.pending_amount);
    }
    return (f) => (f.scope === "INVOICE" ? byInvoice.get(f.invoice_id)?.pending_amount ?? 0 : byCustomer.get(f.customer_id) || 0);
  }, [invoices]);

  const activeTab = TABS.find((t) => t.key === tab) || TABS[0];
  const rows = followUps
    .filter((f) => {
      if (!activeTab.test(f)) return false;
      if (filters.priority && f.priority !== filters.priority) return false;
      if (filters.scope && f.scope !== filters.scope) return false;
      if (filters.customer && f.customer_name !== filters.customer) return false;
      if (filters.from && (!f.due_date || f.due_date < filters.from)) return false;
      if (filters.to && (!f.due_date || f.due_date > filters.to)) return false;
      return true;
    })
    // Open ones first, soonest due on top; finished ones after.
    .sort((a, b) => (a.active === b.active ? (a.active ? byDue(a, b) : byDue(b, a)) : a.active ? -1 : 1));
  const { pageRows, page, setPage, pageSize } = usePaged(rows);

  // Who each schedule is for (from the invoices already loaded) and the reminder it keeps going.
  const scheduleRows = useMemo(() => {
    const invoiceById = new Map(invoices.map((i) => [i.id, i]));
    const customerName = new Map(invoices.map((i) => [i.customer_id, i.customer_name]));
    return schedules.map((s) => {
      const inv = s.source_module === "PAYMENT_INVOICE" ? invoiceById.get(s.source_id) : null;
      return {
        ...s,
        reminder: followUps.find((f) => f.series_id === s.id && f.active) || null,
        customer_name: inv ? inv.customer_name : customerName.get(s.source_id) || s.title.replace(/^Payment (Reminder|Follow-up) - /, ""),
        invoice_number: inv?.invoice_number || "",
        scope: s.source_module === "PAYMENT_INVOICE" ? "INVOICE" : "CUSTOMER",
      };
    });
  }, [schedules, invoices, followUps]);

  async function stop() {
    setBusy(true);
    try {
      await stopReminderSchedule(stopping.id);
      setNotice(`The repeating reminder for ${stopping.invoice_number || stopping.customer_name} was stopped.`);
      setStopping(null);
      await loadSchedules();
    } catch (err) {
      setScheduleError(err.message || "The repeating reminder could not be stopped.");
      setStopping(null);
    } finally {
      setBusy(false);
    }
  }
  const open = (f) => navigate(`/accountant/follow-ups/${f.id}`);

  return (
    <div className="ac-page">
      <div className="ac-head">
        <div>
          <h2 className="ac-title">Tasks &amp; Reminders</h2>
          <p className="ac-sub">Payment reminders for your customers and invoices</p>
        </div>
        <div className="ac-actions">
          <button type="button" className="ac-btn ac-btn-primary" onClick={() => setCreateOpen(true)}><FiPlus /> Create Reminder</button>

          <div className="ac-dropdown-wrap" ref={filterRef}>
            <button type="button" className={`ac-btn ${showFilters ? "ac-btn-primary" : ""}`} onClick={() => setShowFilters((s) => !s)}
              aria-expanded={showFilters} aria-haspopup="true">
              Filters{activeFilters > 0 ? ` (${activeFilters})` : ""} <FiChevronDown />
            </button>

            {showFilters && (
              <div className="ac-dropdown" role="dialog" aria-label="Filters">
                <div className="ac-field">
                  <label>Reminder for</label>
                  <select className="ac-select" value={filters.scope} onChange={setFilter("scope")}>
                    <option value="">Customer and invoice</option>
                    <option value="CUSTOMER">Entire customer</option>
                    <option value="INVOICE">Specific invoice</option>
                  </select>
                </div>
                <div className="ac-field">
                  <label>Priority</label>
                  <select className="ac-select" value={filters.priority} onChange={setFilter("priority")}>
                    <option value="">All priorities</option>
                    <option value="LOW">Low</option>
                    <option value="NORMAL">Normal</option>
                    <option value="HIGH">High</option>
                  </select>
                </div>
                <div className="ac-field">
                  <label>Customer</label>
                  <select className="ac-select" value={filters.customer} onChange={setFilter("customer")}>
                    <option value="">All customers</option>
                    {customerOptions.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="ac-field">
                  <label>Due date</label>
                  <div className="ac-grid-2" style={{ gap: 8 }}>
                    <input className="ac-input" type="date" value={filters.from} onChange={setFilter("from")} aria-label="Due from" />
                    <input className="ac-input" type="date" value={filters.to} onChange={setFilter("to")} aria-label="Due to" />
                  </div>
                </div>
                <div className="ac-actions" style={{ justifyContent: "flex-end" }}>
                  <button type="button" className="ac-btn" disabled={!activeFilters} onClick={() => setFilters(EMPTY_FILTERS)}>Reset</button>
                  <button type="button" className="ac-btn ac-btn-primary" onClick={() => setShowFilters(false)}>Done</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <DataError error={error || reminderError} onRetry={reload} />
      <DataError error={scheduleError} onRetry={loadSchedules} />
      {notice && <div className="ac-info ok" role="status"><FiCheckCircle style={{ flexShrink: 0 }} /><span>{notice}</span></div>}

      <div className="ac-card">
        <div className="ac-tabs" style={{ marginBottom: 14 }}>
          {TABS.map((t) => (
            <button key={t.key} type="button" className={`ac-tab ${tab === t.key ? "active" : ""}`} onClick={() => { setTab(t.key); setPage(0); }}>
              {t.label} ({followUps.filter(t.test).length})
            </button>
          ))}
          <button type="button" className={`ac-tab ${tab === REPEATING ? "active" : ""}`} onClick={() => setTab(REPEATING)}>
            <FiRepeat className="ac-tab-icon" />Repeating ({schedules.length})
          </button>
        </div>

        {tab === REPEATING ? (
          <div className="ac-table-wrap">
            <table className="ac-table ac-stack">
              <thead><tr><th>Customer / Invoice</th><th>For</th><th>Repeats</th><th>Reminder Due</th><th>Ends</th><th>Action</th></tr></thead>
              <tbody>
                {scheduleRows.length ? scheduleRows.map((s) => (
                  <tr key={s.id}>
                    <td>
                      {s.customer_name || "—"}
                      {s.invoice_number && <div className="ac-sub">{s.invoice_number}</div>}
                      {s.description && <div className="ac-sub ac-fu-note">{s.description}</div>}
                    </td>
                    <td>{s.scope === "INVOICE" ? "Invoice" : "Customer"}</td>
                    <td>{repeatText(s)}</td>
                    <td>{s.reminder ? showDue(s.reminder.due_date, s.reminder.due_time) : <span className="ac-sub">—</span>}</td>
                    <td>{repeatEnd(s) ? showDate(repeatEnd(s)) : <span className="ac-sub">No end date</span>}</td>
                    <td>
                      <div className="ac-actions" style={{ flexWrap: "nowrap", gap: 8 }}>
                        {s.reminder && <button type="button" className="ac-link" onClick={() => open(s.reminder)}>Open <FiChevronRight style={{ verticalAlign: "-2px" }} /></button>}
                        <button type="button" className="ac-btn ac-btn-sm" onClick={() => setStopping(s)}>Stop</button>
                      </div>
                    </td>
                  </tr>
                )) : <EmptyRow cols={6} loading={loading} text="No repeating reminders — choose Daily, Weekly or Monthly under Repeat when creating a reminder" />}
              </tbody>
            </table>
          </div>
        ) : (<>

        <div className="ac-table-wrap">
          <table className="ac-table ac-stack">
            <thead>
              <tr>
                <th>Next Reminder</th><th>Customer / Invoice</th><th>For</th><th className="ac-num">Outstanding</th>
                <th>Priority</th><th>Status</th><th>Action</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length ? pageRows.map((f) => (
                <tr key={f.id} className="ac-fu-click" onClick={() => open(f)}>
                  <td>
                    {f.status === "COMPLETED" || f.status === "CANCELLED"
                      ? <span className="ac-sub">{f.status === "COMPLETED" ? "Completed" : "Cancelled"} {f.completed_at ? showDue(ymd(f.completed_at)) : ""}</span>
                      : showDue(f.due_date, f.due_time)}
                  </td>
                  <td>
                    {f.customer_name || "—"}
                    {f.invoice_number && <div className="ac-sub">{f.invoice_number}</div>}
                    {f.notes && <div className="ac-sub ac-fu-note">{f.notes}</div>}
                  </td>
                  <td>{f.scope === "INVOICE" ? "Invoice" : "Customer"}</td>
                  <td className="ac-num">{money(outstandingOf(f))}</td>
                  <td><Badge value={f.priority} /></td>
                  <td>
                    <Badge value={f.display_status} />
                  </td>
                  <td>
                    <button type="button" className="ac-link" onClick={(e) => { e.stopPropagation(); open(f); }}>
                      Open <FiChevronRight style={{ verticalAlign: "-2px" }} />
                    </button>
                  </td>
                </tr>
              )) : <EmptyRow cols={7} loading={loading} text={followUps.length ? "No reminders match" : "No reminders yet — create one from Customer Outstanding or here"} />}
            </tbody>
          </table>
        </div>

        <Pager total={rows.length} page={page} pageSize={pageSize} onPage={setPage} />
        </>)}
      </div>

      {stopping && (
        <div className="ac-overlay" onMouseDown={() => !busy && setStopping(null)}>
          <div className="ac-modal" onMouseDown={(e) => e.stopPropagation()}>
            <h3>Stop this repeating reminder?</h3>
            <p className="ac-sub" style={{ fontSize: 14 }}>
              {stopping.invoice_number ? `Invoice ${stopping.invoice_number} (${stopping.customer_name})` : stopping.customer_name}: {repeatText(stopping).replace(/^E/, "e")}
              {repeatEnd(stopping) ? `, until ${showDate(repeatEnd(stopping))}` : ""}. It will not come due again. The reminder itself stays open on its current date.
            </p>
            <div className="ac-modal-foot">
              <button type="button" className="ac-btn" onClick={() => setStopping(null)} disabled={busy}>Cancel</button>
              <button type="button" className="ac-btn ac-btn-primary" onClick={stop} disabled={busy}>{busy ? "Stopping…" : "Stop Repeating"}</button>
            </div>
          </div>
        </div>
      )}

      <FollowUpModal
        key={createOpen ? "open" : "closed"}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={async () => { setNotice(""); await Promise.all([reload(), loadSchedules()]); }}
        invoices={invoices}
        followUps={followUps}
      />
    </div>
  );
}

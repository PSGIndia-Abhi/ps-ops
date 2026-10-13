import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FiChevronDown, FiChevronRight, FiPlus } from "react-icons/fi";
import FollowUpModal from "../../components/accountant/FollowUpModal";
import { Badge, DataError, EmptyRow, Pager } from "./ui";
import { money } from "./format";
import { byDue, useAccountantData, usePaged, ymd } from "./data";
import { showDue } from "./followups";

// Tasks & Reminders: the accountant's payment follow-ups. Each one is a Task
// Management task pointing at a customer or an invoice (see data.js).
const TABS = [
  { key: "ALL", label: "All", test: () => true },
  { key: "TODAY", label: "Today", test: (f) => f.active && f.display_status === "TODAY" },
  { key: "OVERDUE", label: "Overdue", test: (f) => f.active && f.display_status === "OVERDUE" },
  { key: "UPCOMING", label: "Upcoming", test: (f) => f.active && f.display_status === "UPCOMING" },
  { key: "COMPLETED", label: "Completed", test: (f) => f.status === "COMPLETED" },
];
const EMPTY_FILTERS = { priority: "", scope: "", customer: "", from: "", to: "" };
const uniq = (list, key) => [...new Set(list.map((i) => i[key]).filter(Boolean))].sort();

export default function TaskManagement() {
  const navigate = useNavigate();
  const location = useLocation();
  const { invoices, followUps, loading, error, reload } = useAccountantData();
  const [tab, setTab] = useState(location.state?.tab || "ALL");
  const [createOpen, setCreateOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const filterRef = useRef(null);

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

  // Live outstanding per follow-up: the invoice's pending, or the customer's total pending.
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
  const open = (f) => navigate(`/accountant/follow-ups/${f.id}`);

  return (
    <div className="ac-page">
      <div className="ac-head">
        <div>
          <h2 className="ac-title">Tasks &amp; Reminders</h2>
          <p className="ac-sub">Payment follow-ups for your customers and invoices</p>
        </div>
        <div className="ac-actions">
          <button type="button" className="ac-btn ac-btn-primary" onClick={() => setCreateOpen(true)}><FiPlus /> Create Follow-up</button>

          <div className="ac-dropdown-wrap" ref={filterRef}>
            <button type="button" className={`ac-btn ${showFilters ? "ac-btn-primary" : ""}`} onClick={() => setShowFilters((s) => !s)}
              aria-expanded={showFilters} aria-haspopup="true">
              Filters{activeFilters > 0 ? ` (${activeFilters})` : ""} <FiChevronDown />
            </button>

            {showFilters && (
              <div className="ac-dropdown" role="dialog" aria-label="Filters">
                <div className="ac-field">
                  <label>Follow-up for</label>
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

      <DataError error={error} onRetry={reload} />

      <div className="ac-card">
        <div className="ac-tabs" style={{ marginBottom: 14 }}>
          {TABS.map((t) => (
            <button key={t.key} type="button" className={`ac-tab ${tab === t.key ? "active" : ""}`} onClick={() => { setTab(t.key); setPage(0); }}>
              {t.label} ({followUps.filter(t.test).length})
            </button>
          ))}
        </div>

        <div className="ac-table-wrap">
          <table className="ac-table ac-stack">
            <thead>
              <tr>
                <th>Next Follow-up</th><th>Customer / Invoice</th><th>For</th><th className="ac-num">Outstanding</th>
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
                    {(f.status === "IN_PROGRESS" || f.status === "PAUSED") && <div style={{ marginTop: 4 }}><Badge value={f.status} /></div>}
                  </td>
                  <td>
                    <button type="button" className="ac-link" onClick={(e) => { e.stopPropagation(); open(f); }}>
                      Open <FiChevronRight style={{ verticalAlign: "-2px" }} />
                    </button>
                  </td>
                </tr>
              )) : <EmptyRow cols={7} loading={loading} text={followUps.length ? "No follow-ups match" : "No follow-ups yet — create one from Customer Outstanding or here"} />}
            </tbody>
          </table>
        </div>

        <Pager total={rows.length} page={page} pageSize={pageSize} onPage={setPage} />
      </div>

      <FollowUpModal
        key={createOpen ? "open" : "closed"}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={reload}
        invoices={invoices}
        followUps={followUps}
      />
    </div>
  );
}

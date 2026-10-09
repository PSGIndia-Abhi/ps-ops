import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FiBell, FiChevronDown, FiChevronRight, FiClock, FiCreditCard, FiDownload, FiEye, FiZap } from "react-icons/fi";
import CustomerReminderPanel from "../../components/accountant/CustomerReminderPanel";
import { DataError, EmptyRow, Pager, Skeleton } from "./ui";
import { money } from "./format";
import { byDue, daysOverdue, groupByCustomer, showDate, useAccountantData, usePaged } from "./data";
import { showDue } from "./followups";
import { exportCsv } from "./exportCsv";

const SORTS = [
  ["OUTSTANDING", "Highest outstanding"],
  ["OVERDUE", "Highest overdue amount"],
  ["OLDEST", "Oldest due date"],
  ["NAME", "Customer name"],
];

const sum = (list, key) => list.reduce((s, c) => s + (Number(c[key]) || 0), 0);

function compare(sort) {
  switch (sort) {
    case "OVERDUE":
      return (a, b) => Number(b.overdue_amount) - Number(a.overdue_amount);
    case "OLDEST":
      return (a, b) => (daysOverdue(b.oldest_due) ?? -Infinity) - (daysOverdue(a.oldest_due) ?? -Infinity);
    case "NAME":
      return (a, b) => String(a.name).localeCompare(String(b.name));
    default:
      return (a, b) => Number(b.outstanding) - Number(a.outstanding);
  }
}

export default function CustomerOutstanding() {
  const navigate = useNavigate();
  const location = useLocation();
  const { invoices, payments, followUps, loading, error, reminderError, reload } = useAccountantData();
  // "View Outstanding" on a follow-up opens this page already searched to that customer.
  const [search, setSearch] = useState(location.state?.search || "");
  const [panel, setPanel] = useState(null); // { id, mode: "reminder" | "history" } -- the side panel that is open
  const [view, setView] = useState("");
  const [sort, setSort] = useState("OUTSTANDING");
  const [minAmount, setMinAmount] = useState("");
  const [open, setOpen] = useState(null); // id of the expanded row

  const customers = useMemo(() => groupByCustomer(invoices, payments), [invoices, payments]);
  const withDues = useMemo(() => customers.filter((c) => c.outstanding > 0), [customers]);
  // Each customer's next open follow-up (their own, or one on any of their invoices), soonest first.
  const nextFollowUp = useMemo(() => {
    const map = new Map();
    for (const f of followUps.filter((x) => x.active).sort(byDue)) {
      if (f.customer_id && !map.has(f.customer_id)) map.set(f.customer_id, f);
    }
    return map;
  }, [followUps]);
  const hasData = withDues.length > 0;
  const top = [...withDues].sort(compare("OUTSTANDING"))[0];
  const totalOutstanding = sum(withDues, "outstanding");

  const cards = [
    { key: "orange", label: "Total Outstanding", value: money(totalOutstanding) },
    { key: "blue", label: "Customers With Dues", value: withDues.length },
    { key: "red", label: "Overdue Amount", value: money(sum(withDues, "overdue_amount")) },
    { key: "purple", label: "Avg. per Customer", value: money(withDues.length ? totalOutstanding / withDues.length : 0) },
    { key: "light", label: "Highest Outstanding", value: top ? top.name : "—", note: top ? money(top.outstanding) : "" },
  ];

  const rows = withDues
    .filter((c) => {
      if (view === "OVERDUE" && !(Number(c.overdue_amount) > 0)) return false;
      if (view === "CURRENT" && Number(c.overdue_amount) > 0) return false;
      if (minAmount && Number(c.outstanding) < Number(minAmount)) return false;
      const q = search.trim().toLowerCase();
      return !q || `${c.name} ${c.code || ""}`.toLowerCase().includes(q);
    })
    .sort(compare(sort));
  const { pageRows, page, setPage, pageSize } = usePaged(rows);

  function exportRows() {
    exportCsv("customer-outstanding.csv", [
      { header: "Customer", value: (c) => c.name },
      { header: "Code", value: (c) => c.code },
      { header: "Total Invoiced", value: (c) => c.total_invoiced },
      { header: "Paid", value: (c) => c.total_paid },
      { header: "Outstanding", value: (c) => c.outstanding },
      { header: "Overdue", value: (c) => c.overdue_amount },
      { header: "Oldest Due", value: (c) => c.oldest_due },
      { header: "Unpaid Invoices", value: (c) => c.unpaid_count },
      { header: "Last Payment", value: (c) => c.last_payment_date },
      { header: "Next Reminder", value: (c) => { const f = nextFollowUp.get(c.id); return f ? `${f.due_date} ${f.due_time}`.trim() : ""; } },
    ], rows);
  }

  return (
    <div className="ac-page ac-custout">
      <div className="ac-head">
        <div>
          <h2 className="ac-title">Customer Outstanding</h2>
          <p className="ac-sub">What each customer still owes, grouped by customer</p>
        </div>
        <button type="button" className="ac-btn" onClick={exportRows} disabled={!rows.length}><FiDownload /> Export</button>
      </div>

      <DataError error={error || reminderError} onRetry={reload} />

      <div className="ac-kpis" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        {cards.map((c) => (
          <div key={c.label} className={`ac-kpi ${c.key}`}>
            <div className="ac-kpi-label">{c.label}</div>
            <div className="ac-kpi-value" style={{ fontSize: 20, overflowWrap: "anywhere" }}>{loading ? <Skeleton width="60%" height={22} /> : hasData ? c.value : "—"}</div>
            {hasData && c.note && <div className="ac-kpi-note">{c.note}</div>}
          </div>
        ))}
      </div>

      <div className="ac-card">
        <div className="ac-filters" style={{ marginBottom: 14 }}>
          <input className="ac-input" placeholder="Search customer name or code" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
          <select className="ac-select" value={view} onChange={(e) => { setView(e.target.value); setPage(0); }}>
            <option value="">All Customers</option>
            <option value="OVERDUE">Has Overdue Invoices</option>
            <option value="CURRENT">Not Yet Due</option>
          </select>
          <select className="ac-select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort by">
            {SORTS.map(([v, l]) => <option key={v} value={v}>Sort: {l}</option>)}
          </select>
          <input className="ac-input" type="number" min="0" placeholder="Min. outstanding (₹)" value={minAmount} onChange={(e) => { setMinAmount(e.target.value); setPage(0); }} />
        </div>

        <div className="ac-table-wrap">
          <table className="ac-table ac-stack">
            <thead>
              <tr>
                <th />
                <th>Customer</th>
                <th className="ac-num">Total Invoiced</th><th className="ac-num">Paid</th>
                <th className="ac-num">Outstanding</th><th className="ac-num">Overdue</th>
                <th>Oldest Due</th><th className="ac-num">Unpaid Invoices</th><th>Last Payment</th><th className="ac-co-icon-col">Reminder</th><th className="ac-co-icon-col">Action</th><th className="ac-co-icon-col">History</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length ? pageRows.map((c) => {
                const expanded = open === c.id;
                const d = daysOverdue(c.oldest_due);
                return (
                  <Fragment key={c.id}>
                    <tr>
                      <td>
                        <button type="button" className="ac-toggle" aria-label={expanded ? "Hide invoices" : "Show invoices"}
                          onClick={() => setOpen(expanded ? null : c.id)}>
                          {expanded ? <FiChevronDown /> : <FiChevronRight />}
                        </button>
                      </td>
                      <td>{c.name}{c.code && <div className="ac-sub">{c.code}</div>}</td>
                      <td className="ac-num">{money(c.total_invoiced)}</td>
                      <td className="ac-num">{money(c.total_paid)}</td>
                      <td className="ac-num ac-money-red">{money(c.outstanding)}</td>
                      <td className="ac-num">{Number(c.overdue_amount) > 0 ? money(c.overdue_amount) : "—"}</td>
                      <td>
                        {showDate(c.oldest_due) || "—"}
                        {d != null && d > 0 && <div className="ac-due-late">{d} day{d > 1 ? "s" : ""} overdue</div>}
                      </td>
                      <td className="ac-num">{c.unpaid_count}</td>
                      <td>{showDate(c.last_payment_date) || "—"}</td>
                      <td>
                        <ReminderCell followUp={nextFollowUp.get(c.id)} customerName={c.name} onOpen={() => setPanel({ id: c.id, mode: "reminder" })} />
                      </td>
                      <td>
                        <ActionMenu
                          customerName={c.name}
                          expanded={expanded}
                          onViewDetails={() => setOpen(expanded ? null : c.id)}
                          onRecordPayment={() => navigate("/accountant/payments/record", { state: { customerId: c.id } })}
                        />
                      </td>
                      <td>
                        <button type="button" className="ac-icon-btn" onClick={() => setPanel({ id: c.id, mode: "history" })}
                          title={`Activity history for ${c.name}`} aria-label={`Activity history for ${c.name}`}>
                          <FiClock />
                        </button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="ac-expand-row">
                        <td />
                        <td colSpan={11}>
                          <div className="ac-expand-box">
                            <h4>Unpaid invoices</h4>
                            {c.invoices?.length ? (
                              <table className="ac-table">
                                <thead><tr><th>Invoice No</th><th>Due Date</th><th className="ac-num">Pending</th></tr></thead>
                                <tbody>
                                  {c.invoices.map((i) => (
                                    <tr key={i.id}>
                                      <td>
                                        <button type="button" className="ac-link" onClick={() => navigate(`/accountant/invoices/${i.id}`)}>
                                          {i.invoice_number}
                                        </button>
                                      </td>
                                      <td>{showDate(i.due_date) || "—"}</td>
                                      <td className="ac-num ac-money-red">{money(i.pending_amount)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            ) : (
                              <p className="ac-sub">No invoice details available</p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              }) : <EmptyRow cols={12} loading={loading} text="No customers with outstanding amounts" />}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>Total for all {rows.length} customer{rows.length === 1 ? "" : "s"} shown</td>
                <td className="ac-num">{money(sum(rows, "total_invoiced"))}</td>
                <td className="ac-num">{money(sum(rows, "total_paid"))}</td>
                <td className="ac-num ac-money-red">{money(sum(rows, "outstanding"))}</td>
                <td className="ac-num">{money(sum(rows, "overdue_amount"))}</td>
                <td colSpan={6} />
              </tr>
            </tfoot>
          </table>
        </div>

        <Pager total={rows.length} page={page} pageSize={pageSize} onPage={setPage} />
      </div>

      {panel && customers.find((c) => c.id === panel.id) && (
        <CustomerReminderPanel
          key={`${panel.id}-${panel.mode}`}
          mode={panel.mode}
          customer={customers.find((c) => c.id === panel.id)}
          invoices={invoices}
          payments={payments}
          followUps={followUps}
          onClose={() => setPanel(null)}
          onChanged={reload}
        />
      )}
    </div>
  );
}

// The ⚡ Action menu: the record's payment actions (separate from Reminder and History).
// The menu is fixed-positioned next to the button, so the table's scroll box never clips it.
function ActionMenu({ customerName, expanded, onViewDetails, onRecordPayment }) {
  const [pos, setPos] = useState(null); // { top, left } while open
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!pos) return undefined;
    const close = () => setPos(null);
    const start = btnRef.current?.getBoundingClientRect();
    // Close when the button actually moves (the page or table scrolled), not on any scroll event.
    const onScroll = () => {
      const now = btnRef.current?.getBoundingClientRect();
      if (!now || !start || Math.abs(now.top - start.top) > 2 || Math.abs(now.left - start.left) > 2) close();
    };
    const onDown = (e) => { if (!menuRef.current?.contains(e.target) && !btnRef.current?.contains(e.target)) close(); };
    const onKey = (e) => { if (e.key === "Escape") { close(); btnRef.current?.focus(); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [pos]);

  function toggle() {
    if (pos) return setPos(null);
    const r = btnRef.current.getBoundingClientRect();
    const width = 220;
    const height = 92; // two items
    const left = Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8));
    const top = r.bottom + 6 + height > window.innerHeight ? Math.max(8, r.top - height - 6) : r.bottom + 6;
    setPos({ top, left });
  }
  const run = (fn) => () => { setPos(null); fn(); };

  return (
    <>
      <button type="button" ref={btnRef} className={`ac-icon-btn${pos ? " active" : ""}`} onClick={toggle}
        aria-haspopup="menu" aria-expanded={Boolean(pos)} title={`Actions for ${customerName}`} aria-label={`Actions for ${customerName}`}>
        <FiZap />
      </button>
      {pos && (
        <div ref={menuRef} className="ac-action-menu" role="menu" style={{ top: pos.top, left: pos.left }}>
          <button type="button" role="menuitem" onClick={run(onViewDetails)}><FiEye /> {expanded ? "Hide Details" : "View Details"}</button>
          <button type="button" role="menuitem" onClick={run(onRecordPayment)}><FiCreditCard /> Record Payment</button>
        </div>
      )}
    </>
  );
}

// The reminder bell (icon only, no date): grey when the customer has no open reminder,
// green when one is set, red when it is overdue. The date shows in the tooltip.
// Opens the customer's reminder panel.
function ReminderCell({ followUp, customerName, onOpen }) {
  const late = followUp?.display_status === "OVERDUE";
  const label = followUp
    ? `Reminder ${showDue(followUp.due_date, followUp.due_time)} for ${customerName}${late ? " (overdue)" : ""}`
    : `Set a reminder for ${customerName}`;
  return (
    <button type="button" className={`ac-icon-btn ac-bell-icon${followUp ? (late ? " late" : " on") : ""}`} onClick={onOpen} title={label} aria-label={label}>
      <FiBell />
    </button>
  );
}

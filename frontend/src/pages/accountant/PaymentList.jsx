import { Fragment, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiCalendar, FiCheckCircle, FiChevronDown, FiChevronRight, FiCreditCard, FiDollarSign, FiDownload, FiPlusCircle, FiSearch, FiXCircle } from "react-icons/fi";
import { Badge, DataError, EmptyRow, Pager, Skeleton } from "./ui";
import { money } from "./format";
import { fetchPayment, num, showDate, todayYmd, useAccountantData, usePaged } from "./data";
import { exportCsv } from "./exportCsv";

const MODES = [
  ["CASH", "Cash"],
  ["UPI", "UPI"],
  ["BANK_TRANSFER", "Bank Transfer"],
  ["NEFT", "NEFT"],
  ["CHEQUE", "Cheque"],
  ["CARD", "Card"],
  ["OTHER", "Other"],
];
const MODE_LABEL = Object.fromEntries(MODES);

const sum = (list, key) => list.reduce((s, p) => s + (Number(p[key]) || 0), 0);

export default function PaymentList() {
  const navigate = useNavigate();
  const { payments, loading, error, reload } = useAccountantData();
  const [search, setSearch] = useState("");
  const [customer, setCustomer] = useState("");
  const [mode, setMode] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [open, setOpen] = useState(null); // id of the expanded row
  const [details, setDetails] = useState({}); // payment id -> { allocations } or { error }

  const customers = useMemo(() => [...new Set(payments.map((p) => p.customer_name))].sort(), [payments]);

  const posted = payments.filter((p) => p.status !== "CANCELLED");
  const monthKey = todayYmd().slice(0, 7);
  const thisMonth = posted.filter((p) => p.payment_date.startsWith(monthKey));
  const hasData = payments.length > 0;

  const cards = [
    { key: "green", icon: <FiCheckCircle />, label: "Total Received", value: money(sum(posted, "received_amount")) },
    { key: "blue", icon: <FiCalendar />, label: "Received This Month", value: money(sum(thisMonth, "received_amount")) },
    { key: "purple", icon: <FiCreditCard />, label: "Payments", value: posted.length },
    { key: "orange", icon: <FiDollarSign />, label: "Unallocated (Advance)", value: money(sum(posted, "received_amount") - sum(posted, "allocated_amount")) },
    { key: "red", icon: <FiXCircle />, label: "Cancelled", value: payments.length - posted.length },
  ];

  const rows = payments.filter((p) => {
    if (customer && p.customer_name !== customer) return false;
    if (mode && p.payment_mode !== mode) return false;
    if (status && p.status !== status) return false;
    if (from && p.payment_date < from) return false;
    if (to && p.payment_date > to) return false;
    const q = search.trim().toLowerCase();
    return !q || `${p.payment_number} ${p.customer_name} ${p.reference_number}`.toLowerCase().includes(q);
  });
  const { pageRows, page, setPage, pageSize } = usePaged(rows);

  const shown = rows.filter((p) => p.status !== "CANCELLED");
  const filterChange = (setter) => (e) => { setter(e.target.value); setPage(0); };

  // The invoices a payment was applied to are loaded when its row is opened.
  async function toggle(id) {
    if (open === id) {
      setOpen(null);
      return;
    }
    setOpen(id);
    if (details[id]) return;
    try {
      const data = await fetchPayment(id);
      setDetails((d) => ({ ...d, [id]: { allocations: data.allocations || [] } }));
    } catch (err) {
      setDetails((d) => ({ ...d, [id]: { error: err.message || "Could not load the invoices for this payment" } }));
    }
  }

  function exportRows() {
    exportCsv("payments.csv", [
      { header: "Payment No", value: (p) => p.payment_number },
      { header: "Date", value: (p) => p.payment_date },
      { header: "Customer", value: (p) => p.customer_name },
      { header: "Mode", value: (p) => MODE_LABEL[p.payment_mode] || p.payment_mode },
      { header: "UTR No", value: (p) => p.reference_number },
      { header: "Received", value: (p) => p.received_amount },
      { header: "Allocated", value: (p) => p.allocated_amount },
      { header: "Unallocated", value: (p) => p.received_amount - p.allocated_amount },
      { header: "Status", value: (p) => p.status },
      { header: "Created By", value: (p) => p.created_by },
    ], rows);
  }

  return (
    <div className="ac-page">
      <div className="ac-head">
        <div>
          <h2 className="ac-title ac-title-icon"><FiCreditCard /> Payment List</h2>
          <p className="ac-sub">All payments received from customers</p>
        </div>
        <div className="ac-actions">
          <button type="button" className="ac-btn ac-btn-primary" onClick={() => navigate("/accountant/payments/record")}>
            <FiPlusCircle /> Record Payment
          </button>
          <button type="button" className="ac-btn" onClick={exportRows} disabled={!rows.length}><FiDownload /> Export</button>
        </div>
      </div>

      <DataError error={error} onRetry={reload} />

      <div className="ac-kpis" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        {cards.map((c) => (
          <div key={c.label} className={`ac-kpi ${c.key}`}>
            <span className="ac-kpi-icon" aria-hidden="true">{c.icon}</span>
            <div className="ac-kpi-label">{c.label}</div>
            <div className="ac-kpi-value" style={{ fontSize: 20 }}>{loading ? <Skeleton width="60%" height={22} /> : hasData ? c.value : "—"}</div>
          </div>
        ))}
      </div>

      <div className="ac-card">
        <div className="ac-filters-pl" style={{ marginBottom: 14 }}>
          <div className="ac-search"><FiSearch /><input className="ac-input" placeholder="Search payment no, customer or UTR no" value={search} onChange={filterChange(setSearch)} /></div>
          <select className="ac-select" value={customer} onChange={filterChange(setCustomer)}>
            <option value="">All Customers</option>
            {customers.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select className="ac-select" value={mode} onChange={filterChange(setMode)}>
            <option value="">All Modes</option>
            {MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select className="ac-select" value={status} onChange={filterChange(setStatus)}>
            <option value="">All Status</option>
            <option value="POSTED">Posted</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
          <div className="ac-grid-2" style={{ gap: 6 }}>
            <input className="ac-input" type="date" value={from} onChange={filterChange(setFrom)} aria-label="From date" />
            <input className="ac-input" type="date" value={to} onChange={filterChange(setTo)} aria-label="To date" />
          </div>
        </div>

        <div className="ac-table-wrap">
          <table className="ac-table ac-stack">
            <thead>
              <tr>
                <th />
                <th>Payment No</th><th>Date</th><th>Customer</th><th>Mode</th><th>UTR No</th>
                <th className="ac-num">Received</th><th className="ac-num">Allocated</th><th className="ac-num">Unallocated</th>
                <th>Status</th><th>Created By</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length ? pageRows.map((p) => {
                const expanded = open === p.id;
                const unallocated = num(p.received_amount) - num(p.allocated_amount);
                const detail = details[p.id];
                return (
                  <Fragment key={p.id}>
                    <tr>
                      <td>
                        <button type="button" className="ac-toggle" aria-label={expanded ? "Hide details" : "Show details"} onClick={() => toggle(p.id)}>
                          {expanded ? <FiChevronDown /> : <FiChevronRight />}
                        </button>
                      </td>
                      <td>{p.payment_number}</td>
                      <td>{showDate(p.payment_date)}</td>
                      <td>{p.customer_name}</td>
                      <td>{MODE_LABEL[p.payment_mode] || p.payment_mode}</td>
                      <td>{p.reference_number || "—"}</td>
                      <td className="ac-num">{money(p.received_amount)}</td>
                      <td className="ac-num">{money(p.allocated_amount)}</td>
                      <td className="ac-num">{unallocated > 0 ? money(unallocated) : "—"}</td>
                      <td><Badge value={p.status} /></td>
                      <td>{p.created_by || "—"}</td>
                    </tr>
                    {expanded && (
                      <tr className="ac-expand-row">
                        <td />
                        <td colSpan={10}>
                          <div className="ac-expand-box">
                            <h4>Allocated to invoices</h4>
                            {!detail && <p className="ac-sub">Loading…</p>}
                            {detail?.error && <p className="ac-sub" style={{ color: "#b91c1c" }}>{detail.error}</p>}
                            {detail?.allocations && (detail.allocations.length ? (
                              <table className="ac-table">
                                <thead><tr><th>Invoice No</th><th className="ac-num">Allocated Amount</th></tr></thead>
                                <tbody>
                                  {detail.allocations.map((a) => (
                                    <tr key={a.invoice_id}>
                                      <td>
                                        <button type="button" className="ac-link" onClick={() => navigate(`/accountant/invoices/${a.invoice_id}`)}>
                                          {a.invoice_number}
                                        </button>
                                      </td>
                                      <td className="ac-num">{money(a.allocated_amount)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            ) : (
                              <p className="ac-sub">Not allocated to any invoice</p>
                            ))}
                            <p className="ac-sub" style={{ marginTop: 10 }}>Remarks: {p.remarks || "—"}</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              }) : <EmptyRow cols={11} loading={loading} text="No payments found" />}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={6}>Total for all {rows.length} row{rows.length === 1 ? "" : "s"} shown (cancelled payments excluded)</td>
                <td className="ac-num">{money(sum(shown, "received_amount"))}</td>
                <td className="ac-num">{money(sum(shown, "allocated_amount"))}</td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </div>

        <Pager total={rows.length} page={page} pageSize={pageSize} onPage={setPage} />
      </div>
    </div>
  );
}

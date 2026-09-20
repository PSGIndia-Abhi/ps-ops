import { Fragment, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiChevronDown, FiChevronRight, FiDownload, FiPlusCircle } from "react-icons/fi";
import { DataError, EmptyRow, Pager, Skeleton } from "./ui";
import { money } from "./format";
import { daysOverdue, groupByCustomer, showDate, useAccountantData, usePaged } from "./data";
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
  const { invoices, payments, loading, error, reload } = useAccountantData();
  const [search, setSearch] = useState("");
  const [view, setView] = useState("");
  const [sort, setSort] = useState("OUTSTANDING");
  const [minAmount, setMinAmount] = useState("");
  const [open, setOpen] = useState(null); // id of the expanded row

  const customers = useMemo(() => groupByCustomer(invoices, payments), [invoices, payments]);
  const withDues = useMemo(() => customers.filter((c) => c.outstanding > 0), [customers]);
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
    ], rows);
  }

  return (
    <div className="ac-page">
      <div className="ac-head">
        <div>
          <h2 className="ac-title">Customer Outstanding</h2>
          <p className="ac-sub">What each customer still owes, grouped by customer</p>
        </div>
        <button type="button" className="ac-btn" onClick={exportRows} disabled={!rows.length}><FiDownload /> Export</button>
      </div>

      <DataError error={error} onRetry={reload} />

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
                <th>Oldest Due</th><th className="ac-num">Unpaid Invoices</th><th>Last Payment</th><th>Action</th>
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
                        <div className="ac-actions" style={{ flexWrap: "nowrap" }}>
                          <button type="button" className="ac-link" title="Record payment" aria-label="Record payment"
                            onClick={() => navigate("/accountant/payments/record", { state: { customerId: c.id } })}><FiPlusCircle /></button>
                        </div>
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="ac-expand-row">
                        <td />
                        <td colSpan={9}>
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
              }) : <EmptyRow cols={10} loading={loading} text="No customers with outstanding amounts" />}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>Total for all {rows.length} customer{rows.length === 1 ? "" : "s"} shown</td>
                <td className="ac-num">{money(sum(rows, "total_invoiced"))}</td>
                <td className="ac-num">{money(sum(rows, "total_paid"))}</td>
                <td className="ac-num ac-money-red">{money(sum(rows, "outstanding"))}</td>
                <td className="ac-num">{money(sum(rows, "overdue_amount"))}</td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          </table>
        </div>

        <Pager total={rows.length} page={page} pageSize={pageSize} onPage={setPage} />
      </div>
    </div>
  );
}

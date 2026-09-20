import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiDownload, FiEye, FiUpload } from "react-icons/fi";
import { Badge, DataError, EmptyRow, Pager } from "./ui";
import { money } from "./format";
import { showDate, useAccountantData, usePaged } from "./data";
import { exportCsv } from "./exportCsv";

const TABS = [
  { key: "ALL", label: "All Invoices" },
  { key: "PENDING", label: "Pending" },
  { key: "OVERDUE", label: "Overdue" },
  { key: "PARTIAL", label: "Partially Paid" },
  { key: "PAID", label: "Paid" },
];

export default function InvoiceList() {
  const navigate = useNavigate();
  const { invoices, loading, error, reload } = useAccountantData();
  const [tab, setTab] = useState("ALL");
  const [search, setSearch] = useState("");
  const [customer, setCustomer] = useState("");
  const [date, setDate] = useState("");
  const [status, setStatus] = useState("");

  const customers = useMemo(() => [...new Set(invoices.map((i) => i.customer_name))].sort(), [invoices]);

  const rows = invoices.filter((i) => {
    if (tab !== "ALL" && i.status !== tab) return false;
    if (status && i.status !== status) return false;
    if (customer && i.customer_name !== customer) return false;
    if (date && i.invoice_date !== date) return false;
    const q = search.trim().toLowerCase();
    return !q || `${i.invoice_number} ${i.customer_name}`.toLowerCase().includes(q);
  });
  const { pageRows, page, setPage, pageSize } = usePaged(rows);

  function exportRows() {
    exportCsv("invoices.csv", [
      { header: "Invoice No", value: (i) => i.invoice_number },
      { header: "Date", value: (i) => i.invoice_date },
      { header: "Due Date", value: (i) => i.due_date },
      { header: "Customer", value: (i) => i.customer_name },
      { header: "Site", value: (i) => i.site_name },
      { header: "Invoice Amount", value: (i) => i.invoice_amount },
      { header: "Paid", value: (i) => i.paid_amount },
      { header: "Pending", value: (i) => i.pending_amount },
      { header: "Status", value: (i) => i.status },
    ], rows);
  }

  return (
    <div className="ac-page">
      <div className="ac-head">
        <h2 className="ac-title">Invoices</h2>
        <div className="ac-actions">
          <button type="button" className="ac-btn ac-btn-primary" onClick={() => navigate("/accountant/invoices/upload")}>
            <FiUpload /> Upload Invoice
          </button>
          <button type="button" className="ac-btn" onClick={exportRows} disabled={!rows.length}><FiDownload /> Export</button>
        </div>
      </div>

      <DataError error={error} onRetry={reload} />

      <div className="ac-card">
        <div className="ac-tabs" style={{ marginBottom: 14 }}>
          {TABS.map((t) => (
            <button key={t.key} type="button" className={`ac-tab ${tab === t.key ? "active" : ""}`} onClick={() => { setTab(t.key); setPage(0); }}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="ac-filters" style={{ marginBottom: 14 }}>
          <input className="ac-input" placeholder="Search invoice no or customer" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
          <select className="ac-select" value={customer} onChange={(e) => { setCustomer(e.target.value); setPage(0); }}>
            <option value="">All Customers</option>
            {customers.map((c) => <option key={c}>{c}</option>)}
          </select>
          <input className="ac-input" type="date" value={date} onChange={(e) => { setDate(e.target.value); setPage(0); }} aria-label="Invoice date" />
          <select className="ac-select" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }}>
            <option value="">All Status</option>
            <option value="PENDING">Pending</option>
            <option value="PARTIAL">Partially Paid</option>
            <option value="PAID">Paid</option>
            <option value="OVERDUE">Overdue</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>

        <div className="ac-table-wrap">
          <table className="ac-table">
            <thead>
              <tr>
                <th>Invoice No</th><th>Date</th><th>Due Date</th><th>Customer</th>
                <th className="ac-num">Invoice Amount</th><th className="ac-num">Paid</th><th className="ac-num">Pending</th>
                <th>Status</th><th>Action</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length ? pageRows.map((i) => (
                <tr key={i.id}>
                  <td>{i.invoice_number}</td>
                  <td>{showDate(i.invoice_date)}</td>
                  <td>{showDate(i.due_date) || "—"}</td>
                  <td>{i.customer_name}{i.site_name && <div className="ac-sub">{i.site_name}</div>}</td>
                  <td className="ac-num">{money(i.invoice_amount)}</td>
                  <td className="ac-num">{money(i.paid_amount)}</td>
                  <td className="ac-num">{money(i.pending_amount)}</td>
                  <td><Badge value={i.status} /></td>
                  <td>
                    <button type="button" className="ac-link" onClick={() => navigate(`/accountant/invoices/${i.id}`)} aria-label="View invoice">
                      <FiEye />
                    </button>
                  </td>
                </tr>
              )) : <EmptyRow cols={9} text={loading ? "Loading…" : "No invoices found"} />}
            </tbody>
          </table>
        </div>

        <Pager total={rows.length} page={page} pageSize={pageSize} onPage={setPage} />
      </div>
    </div>
  );
}

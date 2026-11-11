import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiAlertTriangle, FiCheckCircle, FiClock, FiDownload, FiEye, FiFileText, FiList, FiPieChart, FiSearch, FiUpload, FiXCircle } from "react-icons/fi";
import { Badge, DataError, EmptyRow, Pager } from "./ui";
import { money } from "./format";
import { showDate, sortGroups, useAccountantData, usePaged } from "./data";
import { exportCsv } from "./exportCsv";
import DateInput from "../../components/accountant/DateInput";
import MultiSelect from "../../components/accountant/MultiSelect";

const TABS = [
  { key: "ALL", label: "All Invoices", icon: <FiList /> },
  { key: "PENDING", label: "Pending", icon: <FiClock /> },
  { key: "OVERDUE", label: "Overdue", icon: <FiAlertTriangle /> },
  { key: "PARTIAL", label: "Partially Paid", icon: <FiPieChart /> },
  { key: "PAID", label: "Paid", icon: <FiCheckCircle /> },
  { key: "CANCELLED", label: "Cancelled", icon: <FiXCircle /> },
];

const STATUS_OPTIONS = [
  { value: "PENDING", label: "Pending" },
  { value: "PARTIAL", label: "Partially Paid" },
  { value: "PAID", label: "Paid" },
  { value: "OVERDUE", label: "Overdue" },
  { value: "CANCELLED", label: "Cancelled" },
];

export default function InvoiceList() {
  const navigate = useNavigate();
  const { invoices, loading, error, reload } = useAccountantData();
  const [tab, setTab] = useState("ALL");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState([]); // customers; [] = all
  const [date, setDate] = useState("");
  const [statuses, setStatuses] = useState([]); // [] = all
  const [groups, setGroups] = useState([]); // [] = all groups

  // "No Group" goes last.
  const groupOptions = useMemo(
    () => sortGroups(invoices.map((i) => i.group_name)),
    [invoices]
  );
  const inGroups = (i) => !groups.length || groups.includes(i.group_name);
  // Only the customers of the ticked groups.
  const customers = useMemo(
    () => [...new Set(invoices.filter((i) => !groups.length || groups.includes(i.group_name)).map((i) => i.customer_name))].sort(),
    [invoices, groups]
  );
  // Ticking groups unticks customers that are not in them.
  const changeGroups = (list) => {
    setGroups(list);
    if (list.length) {
      const keep = picked.filter((c) => invoices.some((i) => i.customer_name === c && list.includes(i.group_name)));
      if (keep.length !== picked.length) setPicked(keep);
    }
    setPage(0);
  };

  const rows = invoices.filter((i) => {
    if (tab !== "ALL" && i.status !== tab) return false;
    if (statuses.length && !statuses.includes(i.status)) return false;
    if (!inGroups(i)) return false;
    if (picked.length && !picked.includes(i.customer_name)) return false;
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
      { header: "Group", value: (i) => i.group_name },
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
        <h2 className="ac-title ac-title-icon"><FiFileText /> Invoices</h2>
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
              <span className="ac-tab-icon">{t.icon}</span>{t.label}
            </button>
          ))}
        </div>

        <div className="ac-filters-5" style={{ marginBottom: 14 }}>
          <div className="ac-search"><FiSearch /><input className="ac-input" placeholder="Search invoice no or customer" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} /></div>
          <MultiSelect options={groupOptions} value={groups} onChange={changeGroups} allLabel="All Groups" ariaLabel="Groups" />
          <MultiSelect options={customers} value={picked} onChange={(list) => { setPicked(list); setPage(0); }} allLabel="All Customers" ariaLabel="Customers" />
          <DateInput ariaLabel="Invoice date" style={{ width: "100%" }} value={date} onChange={(v) => { setDate(v); setPage(0); }} />
          <MultiSelect options={STATUS_OPTIONS} value={statuses} onChange={(list) => { setStatuses(list); setPage(0); }} allLabel="All Status" ariaLabel="Status" />
        </div>

        <div className="ac-table-wrap">
          <table className="ac-table ac-stack">
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
              )) : <EmptyRow cols={9} loading={loading} text="No invoices found" />}
            </tbody>
          </table>
        </div>

        <Pager total={rows.length} page={page} pageSize={pageSize} onPage={setPage} />
      </div>
    </div>
  );
}

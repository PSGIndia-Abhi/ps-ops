import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiActivity, FiAlertTriangle, FiBell, FiBellOff, FiCalendar, FiClock, FiDownload, FiFileText, FiList, FiPlusCircle, FiSearch } from "react-icons/fi";
import SetReminderModal from "../../components/accountant/SetReminderModal";
import { DataError, EmptyRow, Pager, Skeleton } from "./ui";
import { money } from "./format";
import { createReminder, daysOverdue, followUpsByInvoice, showDate, useAccountantData, usePaged } from "./data";
import { exportCsv } from "./exportCsv";

const CHIPS = [
  { key: "ALL", label: "All Unpaid", icon: <FiList />, test: () => true },
  { key: "OVERDUE", label: "Overdue", icon: <FiAlertTriangle />, test: (i) => (daysOverdue(i.due_date) ?? -1) > 0 },
  { key: "TODAY", label: "Due Today", icon: <FiClock />, test: (i) => daysOverdue(i.due_date) === 0 },
  { key: "WEEK", label: "Due This Week", icon: <FiCalendar />, test: (i) => { const d = daysOverdue(i.due_date); return d != null && d <= 0 && d >= -7; } },
  { key: "MONTH", label: "Due This Month", icon: <FiCalendar />, test: (i) => { const d = daysOverdue(i.due_date); return d != null && d <= 0 && d >= -30; } },
  { key: "NOFOLLOW", label: "No Follow-up Set", icon: <FiBellOff />, test: (i) => !i.next_follow_up },
];

const BUCKETS = [
  { key: "", label: "All Ageing" },
  { key: "NOTDUE", label: "Not Due", test: (d) => d <= 0 },
  { key: "1-30", label: "1 – 30 Days", test: (d) => d >= 1 && d <= 30 },
  { key: "31-60", label: "31 – 60 Days", test: (d) => d >= 31 && d <= 60 },
  { key: "60+", label: "60+ Days", test: (d) => d > 60 },
];

const sum = (list, key) => list.reduce((s, i) => s + (Number(i[key]) || 0), 0);

function severity(days) {
  if (days == null || days <= 0) return "";
  if (days <= 30) return "ac-sev-1";
  if (days <= 60) return "ac-sev-2";
  return "ac-sev-3";
}

export default function Outstanding() {
  const navigate = useNavigate();
  const { invoices, tasks, loading, error, reload } = useAccountantData();
  const [chip, setChip] = useState("ALL");
  const [search, setSearch] = useState("");
  const [customer, setCustomer] = useState("");
  const [site, setSite] = useState("");
  const [bucket, setBucket] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [selected, setSelected] = useState([]);
  const [reminderIds, setReminderIds] = useState([]); // invoices the reminder dialog is for (empty = closed)

  const followUps = useMemo(() => followUpsByInvoice(tasks), [tasks]);

  // Unpaid invoices only, most overdue first.
  const unpaid = useMemo(
    () =>
      invoices
        .filter((i) => i.status !== "CANCELLED" && i.pending_amount > 0)
        .map((i) => ({ ...i, next_follow_up: followUps.get(i.id)?.next_follow_up || "", last_action: followUps.get(i.id)?.last_action || "" }))
        .sort((a, b) => (daysOverdue(b.due_date) ?? -Infinity) - (daysOverdue(a.due_date) ?? -Infinity)),
    [invoices, followUps]
  );

  const customers = useMemo(() => [...new Set(unpaid.map((i) => i.customer_name))].sort(), [unpaid]);
  // Narrowed to the selected customer's own sites, so the Site dropdown never
  // offers a site that belongs to someone else.
  const sites = useMemo(
    () => [...new Set(unpaid.filter((i) => !customer || i.customer_name === customer).map((i) => i.site_name).filter(Boolean))].sort(),
    [unpaid, customer]
  );

  const activeChip = CHIPS.find((c) => c.key === chip);
  const activeBucket = BUCKETS.find((b) => b.key === bucket);

  const rows = unpaid.filter((i) => {
    if (!activeChip.test(i)) return false;
    if (customer && i.customer_name !== customer) return false;
    if (site && i.site_name !== site) return false;
    if (minAmount && i.pending_amount < Number(minAmount)) return false;
    if (activeBucket?.test) {
      const d = daysOverdue(i.due_date);
      if (d == null || !activeBucket.test(d)) return false;
    }
    const q = search.trim().toLowerCase();
    return !q || `${i.invoice_number} ${i.customer_name}`.toLowerCase().includes(q);
  });
  const { pageRows, page, setPage, pageSize } = usePaged(rows);

  // The 5 tiles reflect whatever is currently filtered (chip, search, customer,
  // site, ageing bucket, min. pending) -- the same set the table below shows.
  const overdueRows = rows.filter((i) => (daysOverdue(i.due_date) ?? -1) > 0);
  const weekRows = rows.filter((i) => CHIPS[3].test(i));
  const avgDays = overdueRows.length
    ? Math.round(overdueRows.reduce((s, i) => s + daysOverdue(i.due_date), 0) / overdueRows.length)
    : null;
  const hasData = unpaid.length > 0;

  const cards = [
    { key: "orange", icon: <FiClock />, label: "Total Outstanding", value: money(sum(rows, "pending_amount")) },
    { key: "red", icon: <FiAlertTriangle />, label: "Overdue Amount", value: money(sum(overdueRows, "pending_amount")) },
    { key: "purple", icon: <FiCalendar />, label: "Due This Week", value: money(sum(weekRows, "pending_amount")) },
    { key: "blue", icon: <FiFileText />, label: "Unpaid Invoices", value: rows.length },
    { key: "light", icon: <FiActivity />, label: "Avg. Days Overdue", value: avgDays == null ? "—" : `${avgDays} days` },
  ];

  const allChecked = pageRows.length > 0 && pageRows.every((r) => selected.includes(r.id));

  function toggleAll() {
    const ids = pageRows.map((r) => r.id);
    setSelected((s) => (allChecked ? s.filter((id) => !ids.includes(id)) : [...new Set([...s, ...ids])]));
  }

  function toggleOne(id) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  const filterChange = (setter) => (e) => { setter(e.target.value); setPage(0); };
  // Changing the customer clears any site pick that no longer applies.
  const changeCustomer = (e) => { setCustomer(e.target.value); setSite(""); setPage(0); };

  function exportRows() {
    exportCsv("outstanding-invoices.csv", [
      { header: "Invoice No", value: (i) => i.invoice_number },
      { header: "Customer", value: (i) => i.customer_name },
      { header: "Site", value: (i) => i.site_name },
      { header: "Due Date", value: (i) => i.due_date },
      { header: "Days Overdue", value: (i) => { const d = daysOverdue(i.due_date); return d != null && d > 0 ? d : 0; } },
      { header: "Invoice Amount", value: (i) => i.invoice_amount },
      { header: "Paid", value: (i) => i.paid_amount },
      { header: "Pending", value: (i) => i.pending_amount },
      { header: "Last Action", value: (i) => i.last_action },
      { header: "Next Follow-up", value: (i) => i.next_follow_up },
    ], rows);
  }

  // One reminder for a single invoice, or one for each ticked invoice.
  async function saveReminder(form) {
    const ids = reminderIds.length > 1 ? reminderIds : [form.invoice_id];
    for (const id of ids) {
      const invoice = unpaid.find((i) => i.id === id);
      if (!invoice) throw new Error("Please select an invoice");
      await createReminder(form, invoice);
    }
    setSelected([]);
    await reload();
  }

  return (
    <div className="ac-page ac-outstanding">
      <div className="ac-head">
        <div>
          <h2 className="ac-title ac-title-icon"><FiClock /> Outstanding</h2>
          <p className="ac-sub">Unpaid invoices to collect, most overdue first</p>
        </div>
        <button type="button" className="ac-btn" onClick={exportRows} disabled={!rows.length}><FiDownload /> Export</button>
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
        <div className="ac-chips" style={{ marginBottom: 14 }}>
          {CHIPS.map((c) => (
            <button key={c.key} type="button" className={`ac-chip ${chip === c.key ? "active" : ""}`} onClick={() => { setChip(c.key); setPage(0); }}>
              <span className="ac-tab-icon">{c.icon}</span>{c.label} ({unpaid.filter(c.test).length})
            </button>
          ))}
        </div>

        <div className="ac-filters-6" style={{ marginBottom: 14 }}>
          <div className="ac-search"><FiSearch /><input className="ac-input" placeholder="Search invoice no or customer" value={search} onChange={filterChange(setSearch)} /></div>
          <select className="ac-select" value={customer} onChange={changeCustomer}>
            <option value="">All Customers</option>
            {customers.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select className="ac-select" value={site} onChange={filterChange(setSite)}>
            <option value="">All Sites</option>
            {sites.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select className="ac-select" value={bucket} onChange={filterChange(setBucket)}>
            {BUCKETS.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
          </select>
          <input className="ac-input" type="number" min="0" placeholder="Min. pending (₹)" value={minAmount} onChange={filterChange(setMinAmount)} />
        </div>

        {selected.length > 0 && (
          <div className="ac-bulk">
            <span>{selected.length} invoice{selected.length > 1 ? "s" : ""} selected</span>
            <div className="ac-actions">
              <button type="button" className="ac-btn ac-btn-primary" onClick={() => setReminderIds(selected)}><FiBell /> Add Reminder</button>
              <button type="button" className="ac-btn" onClick={() => setSelected([])}>Clear</button>
            </div>
          </div>
        )}

        <div className="ac-table-wrap">
          <table className="ac-table ac-stack">
            <thead>
              <tr>
                <th><input type="checkbox" aria-label="Select all on this page" checked={allChecked} onChange={toggleAll} /></th>
                <th>Invoice No</th><th>Customer / Site</th><th>Due Date</th><th className="ac-num">Days Overdue</th>
                <th className="ac-num">Invoice Amount</th><th className="ac-num">Paid</th><th className="ac-num">Pending</th>
                <th>Follow-up</th><th>Action</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length ? pageRows.map((i) => {
                const d = daysOverdue(i.due_date);
                return (
                  <tr key={i.id}>
                    <td><input type="checkbox" aria-label={`Select ${i.invoice_number}`} checked={selected.includes(i.id)} onChange={() => toggleOne(i.id)} /></td>
                    <td>
                      <button type="button" className="ac-link" onClick={() => navigate(`/accountant/invoices/${i.id}`)}>{i.invoice_number}</button>
                    </td>
                    <td>{i.customer_name}{i.site_name && <div className="ac-sub">{i.site_name}</div>}</td>
                    <td>{showDate(i.due_date) || "—"}</td>
                    <td className={`ac-num ${severity(d)}`}>{d == null ? "—" : d > 0 ? d : "Not due"}</td>
                    <td className="ac-num">{money(i.invoice_amount)}</td>
                    <td className="ac-num">{money(i.paid_amount)}</td>
                    <td className="ac-num ac-money-red">{money(i.pending_amount)}</td>
                    <td>
                      <div>{i.last_action || "—"}</div>
                      <div className="ac-sub">{i.next_follow_up ? `Next: ${showDate(i.next_follow_up)}` : "No follow-up set"}</div>
                    </td>
                    <td>
                      <div className="ac-actions" style={{ flexWrap: "nowrap" }}>
                        <button type="button" className="ac-link" title="Record payment" aria-label="Record payment"
                          onClick={() => navigate("/accountant/payments/record", { state: { customerId: i.customer_id } })}><FiPlusCircle /></button>
                        <button type="button" className="ac-link" title="Add reminder" aria-label="Add reminder"
                          onClick={() => setReminderIds([i.id])}><FiBell /></button>
                      </div>
                    </td>
                  </tr>
                );
              }) : <EmptyRow cols={10} loading={loading} text="No outstanding invoices" />}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={7}>Total pending for all {rows.length} row{rows.length === 1 ? "" : "s"} shown</td>
                <td className="ac-num ac-money-red">{money(sum(rows, "pending_amount"))}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>

        <Pager total={rows.length} page={page} pageSize={pageSize} onPage={setPage} />
      </div>

      <SetReminderModal
        key={reminderIds.join(",") || "none"}
        open={reminderIds.length > 0}
        onClose={() => setReminderIds([])}
        invoices={unpaid}
        defaultInvoiceId={reminderIds[0] || ""}
        note={reminderIds.length > 1 ? `This reminder will be added to all ${reminderIds.length} selected invoices.` : ""}
        onSave={saveReminder}
      />
    </div>
  );
}

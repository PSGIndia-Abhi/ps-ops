import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiBell, FiDownload, FiPlusCircle } from "react-icons/fi";
import SetReminderModal from "../../components/accountant/SetReminderModal";
import { Badge, DataError, EmptyRow, Pager, Skeleton } from "./ui";
import { money } from "./format";
import { createReminder, daysOverdue, followUpsByInvoice, showDate, useAccountantData, usePaged } from "./data";
import { exportCsv } from "./exportCsv";

const PIPELINE = [
  { key: "PENDING", label: "Pending" },
  { key: "PARTIAL", label: "Partially Paid" },
  { key: "PAID", label: "Paid" },
  { key: "OVERDUE", label: "Overdue" },
];

const AGEING = [
  { key: "g1", label: "Not Due", test: (d) => d <= 0 },
  { key: "g2", label: "1 – 30 Days Overdue", test: (d) => d >= 1 && d <= 30 },
  { key: "g3", label: "31 – 60 Days Overdue", test: (d) => d >= 31 && d <= 60 },
  { key: "g4", label: "60+ Days Overdue", test: (d) => d > 60 },
];

function DueLabel({ inv }) {
  const due = showDate(inv.due_date);
  if (inv.status === "PAID" || inv.status === "CANCELLED") return <span>{due || "—"}</span>;
  const d = daysOverdue(inv.due_date);
  if (d == null) return <span>—</span>;
  if (d > 0) return <span>{due}<div className="ac-due-late">{d} day{d > 1 ? "s" : ""} overdue</div></span>;
  if (d === 0) return <span>{due}<div className="ac-due-soon">Due today</div></span>;
  return <span>{due}<div className={-d <= 3 ? "ac-due-soon" : "ac-sub"}>Due in {-d} day{-d > 1 ? "s" : ""}</div></span>;
}

const sum = (list, key) => list.reduce((s, i) => s + (Number(i[key]) || 0), 0);

export default function PaymentTracking() {
  const navigate = useNavigate();
  const { invoices: all, tasks, loading, error, reload } = useAccountantData();
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [customer, setCustomer] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reminderFor, setReminderFor] = useState(null); // invoice id the reminder dialog is for

  const followUps = useMemo(() => followUpsByInvoice(tasks), [tasks]);
  const invoices = useMemo(
    () => all.map((i) => ({ ...i, next_follow_up: followUps.get(i.id)?.next_follow_up || "" })),
    [all, followUps]
  );

  const active = invoices.filter((i) => i.status !== "CANCELLED");
  const customers = useMemo(() => [...new Set(invoices.map((i) => i.customer_name))].sort(), [invoices]);

  const invoiced = sum(active, "invoice_amount");
  const collected = sum(active, "paid_amount");
  const pending = sum(active, "pending_amount");
  const overdue = sum(active.filter((i) => i.status === "OVERDUE"), "pending_amount");
  const rate = invoiced > 0 ? Math.round((collected / invoiced) * 100) : null;
  const hasData = invoices.length > 0;

  const cards = [
    { key: "blue", label: "Total Invoiced", value: money(invoiced) },
    { key: "green", label: "Collected", value: money(collected) },
    { key: "orange", label: "Pending", value: money(pending) },
    { key: "red", label: "Overdue", value: money(overdue) },
    { key: "purple", label: "Collection Rate", value: rate == null ? "—" : `${rate}%` },
  ];

  const unpaid = active.filter((i) => i.pending_amount > 0);

  const rows = invoices.filter((i) => {
    if (status && i.status !== status) return false;
    if (customer && i.customer_name !== customer) return false;
    if (from && (!i.due_date || i.due_date < from)) return false;
    if (to && (!i.due_date || i.due_date > to)) return false;
    const q = search.trim().toLowerCase();
    return !q || `${i.invoice_number} ${i.customer_name}`.toLowerCase().includes(q);
  });
  const { pageRows, page, setPage, pageSize } = usePaged(rows);

  function exportRows() {
    exportCsv("payment-tracking.csv", [
      { header: "Invoice No", value: (i) => i.invoice_number },
      { header: "Customer", value: (i) => i.customer_name },
      { header: "Due Date", value: (i) => i.due_date },
      { header: "Invoice Amount", value: (i) => i.invoice_amount },
      { header: "Paid", value: (i) => i.paid_amount },
      { header: "Pending", value: (i) => i.pending_amount },
      { header: "Status", value: (i) => i.status },
      { header: "Last Payment", value: (i) => i.last_payment_date },
      { header: "Next Follow-up", value: (i) => i.next_follow_up },
    ], rows);
  }

  async function saveReminder(form) {
    const invoice = invoices.find((i) => i.id === form.invoice_id);
    if (!invoice) throw new Error("Please select an invoice");
    await createReminder(form, invoice);
    await reload();
  }

  const filterChange = (setter) => (e) => { setter(e.target.value); setPage(0); };

  return (
    <div className="ac-page">
      <div className="ac-head">
        <div>
          <h2 className="ac-title">Payment Tracking</h2>
          <p className="ac-sub">See how every invoice is moving towards being paid</p>
        </div>
        <button type="button" className="ac-btn" onClick={exportRows} disabled={!rows.length}><FiDownload /> Export</button>
      </div>

      <DataError error={error} onRetry={reload} />

      <div className="ac-kpis" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        {cards.map((c) => (
          <div key={c.label} className={`ac-kpi ${c.key}`}>
            <div className="ac-kpi-label">{c.label}</div>
            <div className="ac-kpi-value" style={{ fontSize: 20 }}>{loading ? <Skeleton width="60%" height={22} /> : hasData ? c.value : "—"}</div>
          </div>
        ))}
      </div>

      <div className="ac-pipeline">
        {PIPELINE.map((p) => {
          const list = invoices.filter((i) => i.status === p.key);
          const amountKey = p.key === "PAID" ? "paid_amount" : "pending_amount";
          return (
            <button
              key={p.key}
              type="button"
              className={`ac-pipe ${status === p.key ? "active" : ""}`}
              onClick={() => { setStatus((s) => (s === p.key ? "" : p.key)); setPage(0); }}
            >
              <Badge value={p.key} />
              <div className="ac-pipe-count">{list.length}</div>
              <div className="ac-pipe-amt">{list.length ? money(sum(list, amountKey)) : "—"}</div>
            </button>
          );
        })}
      </div>

      <div className="ac-card">
        <h3 className="ac-card-title">Ageing of Pending Amounts</h3>
        <div className="ac-ageing">
          {AGEING.map((a) => {
            const list = unpaid.filter((i) => {
              const d = daysOverdue(i.due_date);
              return d != null && a.test(d);
            });
            return (
              <div key={a.key} className={`ac-age ${a.key}`}>
                <div className="ac-age-label">{a.label}</div>
                <div className="ac-age-value">{list.length ? money(sum(list, "pending_amount")) : "—"}</div>
                <div className="ac-age-label">{list.length} invoice{list.length === 1 ? "" : "s"}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="ac-card">
        <div className="ac-filters-5" style={{ marginBottom: 14 }}>
          <input className="ac-input" placeholder="Search invoice no or customer" value={search} onChange={filterChange(setSearch)} />
          <select className="ac-select" value={customer} onChange={filterChange(setCustomer)}>
            <option value="">All Customers</option>
            {customers.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select className="ac-select" value={status} onChange={filterChange(setStatus)}>
            <option value="">All Status</option>
            {PIPELINE.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            <option value="CANCELLED">Cancelled</option>
          </select>
          <input className="ac-input" type="date" value={from} onChange={filterChange(setFrom)} aria-label="Due from" />
          <input className="ac-input" type="date" value={to} onChange={filterChange(setTo)} aria-label="Due to" />
        </div>

        <div className="ac-table-wrap">
          <table className="ac-table ac-stack">
            <thead>
              <tr>
                <th>Invoice No</th><th>Customer</th><th>Due Date</th><th>Payment Progress</th>
                <th className="ac-num">Pending</th><th>Status</th><th>Last Payment</th><th>Next Follow-up</th><th>Action</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length ? pageRows.map((i) => {
                const pct = i.invoice_amount > 0 ? Math.min(100, Math.round((i.paid_amount / i.invoice_amount) * 100)) : 0;
                return (
                  <tr key={i.id}>
                    <td>
                      <button type="button" className="ac-link" onClick={() => navigate(`/accountant/invoices/${i.id}`)}>
                        {i.invoice_number}
                      </button>
                    </td>
                    <td>{i.customer_name}</td>
                    <td><DueLabel inv={i} /></td>
                    <td>
                      <div className="ac-progress">
                        <div className="ac-progress-bar"><div className="ac-progress-fill" style={{ width: `${pct}%` }} /></div>
                        <div className="ac-progress-text">{money(i.paid_amount)} / {money(i.invoice_amount)}</div>
                      </div>
                    </td>
                    <td className="ac-num">{money(i.pending_amount)}</td>
                    <td><Badge value={i.status} /></td>
                    <td>{showDate(i.last_payment_date) || "—"}</td>
                    <td>{showDate(i.next_follow_up) || "—"}</td>
                    <td>
                      <div className="ac-actions" style={{ flexWrap: "nowrap" }}>
                        <button type="button" className="ac-link" title="Record payment" aria-label="Record payment"
                          disabled={i.pending_amount <= 0 || i.status === "CANCELLED"}
                          onClick={() => navigate("/accountant/payments/record", { state: { customerId: i.customer_id } })}><FiPlusCircle /></button>
                        <button type="button" className="ac-link" title="Add reminder" aria-label="Add reminder"
                          onClick={() => setReminderFor(i.id)}><FiBell /></button>
                      </div>
                    </td>
                  </tr>
                );
              }) : <EmptyRow cols={9} loading={loading} text="No invoices to track yet" />}
            </tbody>
          </table>
        </div>

        <Pager total={rows.length} page={page} pageSize={pageSize} onPage={setPage} />
      </div>

      <SetReminderModal
        key={reminderFor || "closed"}
        open={Boolean(reminderFor)}
        onClose={() => setReminderFor(null)}
        invoices={invoices}
        defaultInvoiceId={reminderFor || ""}
        onSave={saveReminder}
      />
    </div>
  );
}

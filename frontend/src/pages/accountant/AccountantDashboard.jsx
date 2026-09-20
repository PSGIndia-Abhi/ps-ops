import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiAlertTriangle, FiBarChart2, FiBell, FiCalendar, FiCheckCircle, FiCheckSquare, FiChevronDown, FiClock,
  FiCreditCard, FiFileText, FiPieChart, FiUsers,
} from "react-icons/fi";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import useMe from "../../hooks/useMe";
import DateInput from "../../components/accountant/DateInput";
import { DataError, EmptyRow } from "./ui";
import { money } from "./format";
import { daysOverdue, groupByCustomer, showDate, ymd, useAccountantData } from "./data";

// Y-axis labels in lakhs (1L = 1,00,000), e.g. 500000 -> "5L".
const lakhs = (v) => (v === 0 ? "0" : `${Number((v / 100000).toFixed(1))}L`);

// With no data the chart still draws its axes and legend: the last 6 month names, all at zero.
function lastMonths(count = 6) {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (count - 1 - i), 1);
    return { key: ymd(d).slice(0, 7), month: d.toLocaleString("en-US", { month: "short" }), invoiced: 0, collected: 0 };
  });
}
const EMPTY_TICKS = [0, 500000, 1000000, 1500000, 2000000];

// Slices of the Payment Status donut.
const STATUS_SLICES = [
  { key: "PAID", name: "Paid", color: "#16a34a" },
  { key: "PARTIAL", name: "Partial", color: "#2563eb" },
  { key: "PENDING", name: "Pending", color: "#f59e0b" },
  { key: "OVERDUE", name: "Overdue", color: "#dc2626" },
];

const PAYMENT_MODES = [
  ["CASH", "Cash"],
  ["UPI", "UPI"],
  ["BANK_TRANSFER", "Bank Transfer"],
  ["NEFT", "NEFT"],
  ["CHEQUE", "Cheque"],
  ["CARD", "Card"],
  ["OTHER", "Other"],
];
const MODE_LABEL = Object.fromEntries(PAYMENT_MODES);

// The dashboard tables only preview this many rows; "View All" opens the full list on its own page.
const PREVIEW_ROWS = 5;
const EMPTY_FILTERS = { customer: "", site: "", status: "", mode: "" };
const uniq = (list, key) => [...new Set(list.map((i) => i[key]).filter(Boolean))].sort();
const sum = (list, key) => list.reduce((s, i) => s + (Number(i[key]) || 0), 0);

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 17) return "Good Afternoon";
  return "Good Evening";
}

export default function AccountantDashboard() {
  const navigate = useNavigate();
  const { user } = useMe();
  const { invoices, payments, tasks, loading, error, reload } = useAccountantData();
  const [range, setRange] = useState({ from: "", to: "" });
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

  const firstName = (user?.name || "").split(" ")[0];
  const setFilter = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }));
  // The count on the Filters button counts only the choices inside the menu, not the two date boxes.
  const activeFilters = Object.values(filters).filter(Boolean).length;
  const canReset = activeFilters > 0 || Boolean(range.from || range.to);

  const customerOptions = useMemo(() => uniq([...invoices, ...payments], "customer_name"), [invoices, payments]);
  const siteOptions = useMemo(() => uniq(invoices, "site_name"), [invoices]);

  // ---- apply the filters to each list --------------------------------------------------------
  const inRange = (date) => (!range.from || (date && date >= range.from)) && (!range.to || (date && date <= range.to));

  const fInvoices = invoices.filter((i) =>
    (!filters.customer || i.customer_name === filters.customer) &&
    (!filters.site || i.site_name === filters.site) &&
    (!filters.status || i.status === filters.status) &&
    inRange(i.invoice_date)
  );
  const fPayments = payments.filter((p) =>
    p.status !== "CANCELLED" &&
    (!filters.customer || p.customer_name === filters.customer) &&
    (!filters.mode || p.payment_mode === filters.mode) &&
    inRange(p.payment_date)
  );
  const fTasks = tasks.filter((t) =>
    t.status === "OPEN" &&
    (!filters.customer || t.customer_name === filters.customer) &&
    (!filters.site || t.site_name === filters.site) &&
    inRange(t.due_date)
  );

  // ---- numbers ----------------------------------------------------------------------------
  const live = fInvoices.filter((i) => i.status !== "CANCELLED");
  const unpaid = live.filter((i) => i.pending_amount > 0);
  const overdueInvoices = live.filter((i) => i.status === "OVERDUE");
  const dueThisWeek = unpaid.filter((i) => { const d = daysOverdue(i.due_date); return d != null && d <= 0 && d >= -7; });
  const followupsToday = fTasks.filter((t) => t.display_status === "TODAY").length;
  const hasData = invoices.length > 0;

  const kpis = [
    { key: "blue", icon: FiFileText, label: "Total Invoices", value: live.length, note: money(sum(live, "invoice_amount")) },
    { key: "green", icon: FiCheckCircle, label: "Total Collected", value: money(sum(live, "paid_amount")), note: "Received" },
    { key: "orange", icon: FiClock, label: "Outstanding", value: money(sum(unpaid, "pending_amount")), note: `${unpaid.length} invoice${unpaid.length === 1 ? "" : "s"}` },
    { key: "red", icon: FiAlertTriangle, label: "Overdue", value: money(sum(overdueInvoices, "pending_amount")), note: `${overdueInvoices.length} invoice${overdueInvoices.length === 1 ? "" : "s"}` },
    { key: "purple", icon: FiCalendar, label: "Due This Week", value: money(sum(dueThisWeek, "pending_amount")), note: `${dueThisWeek.length} invoice${dueThisWeek.length === 1 ? "" : "s"}` },
    { key: "light", icon: FiBell, label: "Today's Follow-ups", value: followupsToday, note: "Tasks due today" },
  ];

  // Trend: invoiced and collected per month for the last 6 months.
  const trend = (() => {
    const months = lastMonths(6);
    const byKey = new Map(months.map((m) => [m.key, m]));
    for (const i of live) {
      const m = byKey.get(i.invoice_date.slice(0, 7));
      if (m) m.invoiced += i.invoice_amount;
    }
    for (const p of fPayments) {
      const m = byKey.get(p.payment_date.slice(0, 7));
      if (m) m.collected += p.received_amount;
    }
    return months;
  })();
  const hasTrend = trend.some((m) => m.invoiced > 0 || m.collected > 0);

  // Payment status donut.
  const paymentStatus = STATUS_SLICES
    .filter((sl) => !filters.status || sl.key === filters.status)
    .map((sl) => ({ ...sl, value: live.filter((i) => i.status === sl.key).length }));
  const statusTotal = paymentStatus.reduce((sum2, p) => sum2 + p.value, 0);

  // The three preview tables.
  const upcomingAll = [...fTasks]
    .sort((a, b) => (a.due_date || "9999").localeCompare(b.due_date || "9999"))
    .map((t) => ({ id: t.id, date: t.due_date, customer: t.customer_name, task: t.task_type, invoice: t.invoice_number }));
  const topOutstandingAll = groupByCustomer(live, fPayments)
    .filter((c) => c.outstanding > 0)
    .sort((a, b) => b.outstanding - a.outstanding)
    .map((c) => ({
      id: c.id, customer: c.name, total: c.total_invoiced, paid: c.total_paid, outstanding: c.outstanding,
      days_overdue: Math.max(0, daysOverdue(c.oldest_due) ?? 0),
    }));
  const recentPaymentsAll = [...fPayments]
    .sort((a, b) => b.payment_date.localeCompare(a.payment_date))
    .map((p) => ({ id: p.id, date: p.payment_date, customer: p.customer_name, payment_no: p.payment_number, amount: p.received_amount, mode: p.payment_mode }));

  const upcoming = upcomingAll.slice(0, PREVIEW_ROWS);
  const topOutstanding = topOutstandingAll.slice(0, PREVIEW_ROWS);
  const recentPayments = recentPaymentsAll.slice(0, PREVIEW_ROWS);
  const viewAllLabel = (all) => (all.length > PREVIEW_ROWS ? `View All (${all.length})` : "View All");

  return (
    <div className="ac-page">
      <div className="ac-head">
        <div>
          <h2 className="ac-title">{greeting()}{firstName ? `, ${firstName}` : ""}</h2>
          <p className="ac-sub">Here's your collection overview</p>
        </div>
        <div className="ac-actions">
          <div className="ac-date-field"><span>From</span><DateInput value={range.from} onChange={(v) => setRange((r) => ({ ...r, from: v }))} ariaLabel="From date" /></div>
          <div className="ac-date-field"><span>To</span><DateInput value={range.to} onChange={(v) => setRange((r) => ({ ...r, to: v }))} ariaLabel="To date" /></div>
          <div className="ac-dropdown-wrap" ref={filterRef}>
            <button type="button" className={`ac-btn ${showFilters ? "ac-btn-primary" : ""}`} onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters} aria-haspopup="true">
              Filters{activeFilters > 0 ? ` (${activeFilters})` : ""} <FiChevronDown />
            </button>

            {showFilters && (
              <div className="ac-dropdown" role="dialog" aria-label="Filters">
                <div className="ac-field">
                  <label>Customer</label>
                  <select className="ac-select" value={filters.customer} onChange={setFilter("customer")}>
                    <option value="">All customers</option>
                    {customerOptions.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="ac-field">
                  <label>Site</label>
                  <select className="ac-select" value={filters.site} onChange={setFilter("site")}>
                    <option value="">All sites</option>
                    {siteOptions.map((s2) => <option key={s2}>{s2}</option>)}
                  </select>
                </div>
                <div className="ac-field">
                  <label>Invoice status</label>
                  <select className="ac-select" value={filters.status} onChange={setFilter("status")}>
                    <option value="">All statuses</option>
                    {STATUS_SLICES.map((sl) => <option key={sl.key} value={sl.key}>{sl.name}</option>)}
                  </select>
                </div>
                <div className="ac-field">
                  <label>Payment mode</label>
                  <select className="ac-select" value={filters.mode} onChange={setFilter("mode")}>
                    <option value="">All modes</option>
                    {PAYMENT_MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div className="ac-actions" style={{ justifyContent: "flex-end" }}>
                  <button type="button" className="ac-btn" disabled={!canReset}
                    onClick={() => { setFilters(EMPTY_FILTERS); setRange({ from: "", to: "" }); }}>
                    Reset
                  </button>
                  <button type="button" className="ac-btn ac-btn-primary" onClick={() => setShowFilters(false)}>Done</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <DataError error={error} onRetry={reload} />

      <div className="ac-kpis">
        {kpis.map((k) => (
          <div key={k.label} className={`ac-kpi ${k.key}`}>
            <span className="ac-kpi-icon" aria-hidden="true"><k.icon /></span>
            <div className="ac-kpi-label">{k.label}</div>
            <div className="ac-kpi-value">{hasData ? k.value : "—"}</div>
            <div className="ac-kpi-note">{k.note}</div>
          </div>
        ))}
      </div>

      <div className="ac-row-2">
        <div className="ac-card">
          <h3 className="ac-card-title"><FiBarChart2 className="ac-title-icon" />Invoice &amp; Collection Trend</h3>
          <div style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tickLine={false} />
                <YAxis
                  tickFormatter={lakhs}
                  tickLine={false}
                  axisLine={false}
                  {...(hasTrend ? {} : { domain: [0, 2000000], ticks: EMPTY_TICKS })}
                />
                {hasTrend && <Tooltip formatter={(v) => money(v)} />}
                <Legend verticalAlign="top" align="right" height={32} iconType="square" itemSorter={null} />
                <Bar dataKey="invoiced" name="Invoiced" fill="#2563eb" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="collected" name="Collected" fill="#16a34a" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="ac-card">
          <h3 className="ac-card-title"><FiPieChart className="ac-title-icon" />Payment Status</h3>
          <div className="ac-donut-wrap">
            <div style={{ width: 150, height: 150, position: "relative" }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusTotal ? paymentStatus.filter((p) => p.value > 0) : [{ name: "None", value: 1 }]}
                    dataKey="value"
                    innerRadius={48}
                    outerRadius={70}
                    paddingAngle={0}
                    stroke="none"
                    isAnimationActive={false}
                  >
                    {statusTotal
                      ? paymentStatus.filter((p) => p.value > 0).map((p) => <Cell key={p.key} fill={p.color} />)
                      : <Cell fill="#e5e7eb" />}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <strong style={{ fontSize: 20 }}>{statusTotal}</strong>
                <span style={{ fontSize: 11, color: "#64748b" }}>Invoices</span>
              </div>
            </div>
            <div className="ac-legend">
              {paymentStatus.map((p) => (
                <div key={p.key}>
                  <span className="dot" style={{ background: p.color }} />
                  {p.name} ({p.value}{statusTotal ? `, ${((p.value / statusTotal) * 100).toFixed(1)}%` : ""})
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="ac-card">
          <div className="ac-card-head">
            <h3 className="ac-card-title"><FiCheckSquare className="ac-title-icon" />Upcoming Reminders &amp; Tasks</h3>
            <button type="button" className="ac-link" onClick={() => navigate("/accountant/tasks")}>{viewAllLabel(upcomingAll)}</button>
          </div>
          <div className="ac-table-wrap">
            <table className="ac-table">
              <thead><tr><th>Date</th><th>Customer / Task</th><th>Invoice</th></tr></thead>
              <tbody>
                {upcoming.length ? upcoming.map((u) => (
                  <tr key={u.id}><td>{showDate(u.date) || "—"}</td><td>{u.customer}<div style={{ color: "#64748b", fontSize: 12 }}>{u.task}</div></td><td>{u.invoice}</td></tr>
                )) : <EmptyRow cols={3} text={loading ? "Loading…" : "No upcoming reminders"} />}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="ac-row-2b">
        <div className="ac-card">
          <div className="ac-card-head">
            <h3 className="ac-card-title"><FiUsers className="ac-title-icon" />Top Outstanding Customers</h3>
            <button type="button" className="ac-link" onClick={() => navigate("/accountant/payments/customer-outstanding")}>{viewAllLabel(topOutstandingAll)}</button>
          </div>
          <div className="ac-table-wrap">
            <table className="ac-table">
              <thead>
                <tr><th>Customer</th><th className="ac-num">Total Invoiced</th><th className="ac-num">Paid</th><th className="ac-num">Outstanding</th><th className="ac-num">Days Overdue</th></tr>
              </thead>
              <tbody>
                {topOutstanding.length ? topOutstanding.map((c) => (
                  <tr key={c.id}>
                    <td>{c.customer}</td><td className="ac-num">{money(c.total)}</td><td className="ac-num">{money(c.paid)}</td>
                    <td className="ac-num" style={{ color: "#dc2626", fontWeight: 600 }}>{money(c.outstanding)}</td>
                    <td className="ac-num">{c.days_overdue || "—"}</td>
                  </tr>
                )) : <EmptyRow cols={5} text={loading ? "Loading…" : "No outstanding customers"} />}
              </tbody>
            </table>
          </div>
        </div>

        <div className="ac-card">
          <div className="ac-card-head">
            <h3 className="ac-card-title"><FiCreditCard className="ac-title-icon" />Recent Payments</h3>
            <button type="button" className="ac-link" onClick={() => navigate("/accountant/payments/list")}>{viewAllLabel(recentPaymentsAll)}</button>
          </div>
          <div className="ac-table-wrap">
            <table className="ac-table">
              <thead>
                <tr><th>Date</th><th>Customer</th><th>Payment No</th><th className="ac-num">Amount</th><th>Mode</th></tr>
              </thead>
              <tbody>
                {recentPayments.length ? recentPayments.map((p) => (
                  <tr key={p.id}>
                    <td>{showDate(p.date)}</td><td>{p.customer}</td><td>{p.payment_no}</td><td className="ac-num">{money(p.amount)}</td>
                    <td>{MODE_LABEL[p.mode] || p.mode}</td>
                  </tr>
                )) : <EmptyRow cols={5} text={loading ? "Loading…" : "No payments yet"} />}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

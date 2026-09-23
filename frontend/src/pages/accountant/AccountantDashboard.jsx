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
import { DataError, EmptyRow, Skeleton } from "./ui";
import { money } from "./format";
import { daysOverdue, groupByCustomer, showDate, todayYmd, ymd, useAccountantData } from "./data";

// Y-axis labels in lakhs (1L = 1,00,000), e.g. 500000 -> "5L".
const lakhs = (v) => (v === 0 ? "0" : `${Number((v / 100000).toFixed(1))}L`);

// The trend chart's month columns: up to `maxCount` months, ending at the selected "To" date and
// reaching back only as far as the selected "From" date. A narrow filter (e.g. one month) shows just
// that month instead of padding the chart with months outside what was asked for; a wide filter (the
// default, which can run back years) is capped at `maxCount` so the chart stays readable — anything
// invoiced or collected further back than that will not have a column and so will not show here, even
// though it is still counted in every other total on the page. With no data the axes and legend still
// draw, all at zero.
function trendMonths(fromYmd, toYmd, maxCount = 6) {
  const to = toYmd ? new Date(`${toYmd}T00:00:00`) : new Date();
  const toMonth = new Date(to.getFullYear(), to.getMonth(), 1);
  let count = maxCount;
  if (fromYmd) {
    const from = new Date(`${fromYmd}T00:00:00`);
    const fromMonth = new Date(from.getFullYear(), from.getMonth(), 1);
    const span = (toMonth.getFullYear() - fromMonth.getFullYear()) * 12 + (toMonth.getMonth() - fromMonth.getMonth()) + 1;
    count = Math.min(Math.max(1, span), maxCount);
  }
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(toMonth.getFullYear(), toMonth.getMonth() - (count - 1 - i), 1);
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

// What the date range shows before the accountant changes anything: "From" is the oldest unpaid
// invoice's own invoice date, so nothing outstanding is hidden by default; "To" is always today.
// This uses invoice_date rather than due_date because every list below filters invoices by their
// invoice_date — using the due date here instead could put "From" after that same invoice's own
// invoice_date, silently excluding the very invoice the default was set to include. Before the
// invoices have loaded there is nothing to look at yet, so "From" falls back to the 1st of the
// current month. This is a plain function of the data, not stored state, so it stays correct if the
// invoices are reloaded — and Reset returns to it.
function computeRangeDefault(invoices) {
  const today = todayYmd();
  const oldest = invoices
    .filter((i) => i.status !== "CANCELLED" && i.pending_amount > 0)
    .map((i) => i.invoice_date)
    .filter(Boolean)
    .sort()[0];
  return { from: oldest || `${today.slice(0, 8)}01`, to: today };
}

export default function AccountantDashboard() {
  const navigate = useNavigate();
  const { user } = useMe();
  const { invoices, payments, tasks, loading, error, reload } = useAccountantData();
  // null = the accountant has not picked a date themselves yet, so the computed default is shown.
  const [range, setRange] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const filterRef = useRef(null);

  const rangeDefault = useMemo(() => computeRangeDefault(invoices), [invoices]);
  const effectiveRange = range || rangeDefault;

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
  // Picking a customer narrows the Site list to that customer's own sites; a
  // previously chosen site that doesn't belong to them is cleared so the two
  // filters never disagree with each other.
  const setCustomerFilter = (e) => setFilters((f) => ({ ...f, customer: e.target.value, site: "" }));
  // The count on the Filters button counts only the choices inside the menu, not the two date boxes.
  const activeFilters = Object.values(filters).filter(Boolean).length;
  const isDefaultRange = range === null;
  const canReset = activeFilters > 0 || !isDefaultRange;

  const customerOptions = useMemo(() => uniq([...invoices, ...payments], "customer_name"), [invoices, payments]);
  const siteOptions = useMemo(
    () => uniq(invoices.filter((i) => !filters.customer || i.customer_name === filters.customer), "site_name"),
    [invoices, filters.customer]
  );

  // ---- apply the filters to each list --------------------------------------------------------
  const inRange = (date) => (!effectiveRange.from || (date && date >= effectiveRange.from)) && (!effectiveRange.to || (date && date <= effectiveRange.to));

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

  // Trend: invoiced and collected per month, following the selected From/To dates (see trendMonths).
  const trend = (() => {
    const months = trendMonths(effectiveRange.from, effectiveRange.to, 6);
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
    <div className="ac-page ac-dashboard">
      <div className="ac-head">
        <div>
          <h2 className="ac-title">{greeting()}{firstName ? `, ${firstName}` : ""}</h2>
          <p className="ac-sub">Here's your collection overview</p>
        </div>
        <div className="ac-actions">
          <div className="ac-date-field"><span>From</span><DateInput value={effectiveRange.from} onChange={(v) => setRange({ ...effectiveRange, from: v })} ariaLabel="From date" /></div>
          <div className="ac-date-field"><span>To</span><DateInput value={effectiveRange.to} onChange={(v) => setRange({ ...effectiveRange, to: v })} ariaLabel="To date" /></div>
          <div className="ac-dropdown-wrap" ref={filterRef}>
            <button type="button" className={`ac-btn ${showFilters ? "ac-btn-primary" : ""}`} onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters} aria-haspopup="true">
              Filters{activeFilters > 0 ? ` (${activeFilters})` : ""} <FiChevronDown />
            </button>

            {showFilters && (
              <div className="ac-dropdown" role="dialog" aria-label="Filters">
                <div className="ac-field">
                  <label>Customer</label>
                  <select className="ac-select" value={filters.customer} onChange={setCustomerFilter}>
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
                    onClick={() => { setFilters(EMPTY_FILTERS); setRange(null); }}>
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
            <div className="ac-kpi-value">{loading ? <Skeleton width="60%" height={26} /> : hasData ? k.value : "—"}</div>
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
                )) : <EmptyRow cols={3} loading={loading} text="No upcoming reminders" />}
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
                )) : <EmptyRow cols={5} loading={loading} text="No outstanding customers" />}
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
                )) : <EmptyRow cols={5} loading={loading} text="No payments yet" />}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

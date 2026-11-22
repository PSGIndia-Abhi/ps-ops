import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiActivity, FiAlertTriangle, FiArrowRight, FiCheckCircle, FiClock, FiEdit3, FiUsers } from "react-icons/fi";
import useMe from "../../hooks/useMe";
import { qs, useBilling } from "./billingApi";
import { monthLabel, thisMonth } from "./format";
import { Kpi, Msg } from "./ui";
import { SOS_STATUS } from "./sosStatus";
import CustomerFilter from "./CustomerFilter";
import { BILLING_HOME } from "./access";
import { RowsSkeleton } from "./Skeletons";

// Service Coordinator dashboard: this month's SOS progress, what is still to do (most urgent first,
// by the day Accounts must bill), recent submissions, and last month's leftovers.

const prevMonth = (m) => {
  const [y, mm] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mm - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const when = (v) => (v ? new Date(v).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
const greeting = () => {
  const h = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

export default function CoordinatorDashboard() {
  const navigate = useNavigate();
  const { user } = useMe();
  const month = thisMonth();
  const last = prevMonth(month);
  const { data, error, loading } = useBilling(`/sos${qs({ month })}`);
  const { data: lastData } = useBilling(`/sos${qs({ month: last })}`);
  // Customer filter (checkboxes): everything below follows the customers picked.
  const [picked, setPicked] = useState([]);
  const allRows = useMemo(() => data?.rows || [], [data]);
  const options = useMemo(() => allRows.map((r) => ({ id: r.company_id, name: r.customer, group: r.group, outlets: r.outlet_names })), [allRows]);
  const rows = useMemo(() => (picked.length ? allRows.filter((r) => picked.includes(r.company_id)) : allRows), [allRows, picked]);
  const s = useMemo(() => {
    if (!data) return null;
    const sub = rows.filter((r) => r.status === "SUBMITTED");
    return {
      customers: rows.length,
      submitted: sub.length,
      draft: rows.filter((r) => r.status === "DRAFT").length,
      not_started: rows.filter((r) => r.status === "NOT_STARTED").length,
      assigned: sub.reduce((t, r) => t + r.assigned, 0),
      completed: sub.reduce((t, r) => t + (r.completed || 0), 0),
      extra: sub.reduce((t, r) => t + r.extra, 0),
    };
  }, [data, rows]);
  const pending = rows.filter((r) => r.status !== "SUBMITTED").sort((a, b) => (a.bill_by_day ?? 99) - (b.bill_by_day ?? 99) || a.customer.localeCompare(b.customer));
  const recent = rows.filter((r) => r.status === "SUBMITTED").sort((a, b) => String(b.submitted_at).localeCompare(String(a.submitted_at))).slice(0, 6);
  const lastPending = (lastData?.rows || []).filter((r) => r.status !== "SUBMITTED" && (!picked.length || picked.includes(r.company_id)));
  const pct = s && s.customers ? Math.round((s.submitted * 100) / s.customers) : 0;
  const open = (r, m = month) => navigate(`${BILLING_HOME}/sos/${encodeURIComponent(r.company_id)}?month=${m}`);
  const firstName = String(user?.name || "").split(" ")[0];

  return (
    <div className="ac-page">
      <div className="cd-hero">
        <div>
          <div className="cd-hello">{greeting()}{firstName ? `, ${firstName}` : ""}</div>
          <h1>{monthLabel(month)} SOS</h1>
          <p>{s ? `${s.submitted} of ${s.customers} customers submitted to Accounts` : "Loading…"}</p>
          <div className="cd-progress" aria-label={`${pct}% submitted`}><span style={{ width: `${pct}%` }} /></div>
        </div>
        <button type="button" className="ac-btn cd-hero-btn" onClick={() => navigate(`${BILLING_HOME}/sos?month=${month}`)}>Open Monthly SOS <FiArrowRight /></button>
      </div>
      <Msg error={error} />
      <div className="cd-filter">
        <span className="ac-sub">Showing</span>
        <CustomerFilter options={options} value={picked} onChange={setPicked} />
      </div>

      {lastPending.length > 0 && (
        <div className="ac-info error" style={{ marginBottom: 14 }}>
          <span><FiAlertTriangle /> {lastPending.length} customer{lastPending.length === 1 ? "" : "s"} still without a submitted SOS for {monthLabel(last)}: Accounts cannot bill them.{" "}
            <button type="button" className="bl-link" onClick={() => navigate(`${BILLING_HOME}/sos?month=${last}`)}>Finish {monthLabel(last)}</button>
          </span>
        </div>
      )}

      <div className="ac-kpis">
        <Kpi color="blue" label="Customers to report" icon={FiUsers} value={s?.customers ?? "—"} note={monthLabel(month)} onClick={() => navigate(`${BILLING_HOME}/sos?month=${month}`)} />
        <Kpi color="green" label="Submitted" icon={FiCheckCircle} progress={s ? pct : null} value={s?.submitted ?? "—"} note={`${pct}% done`} onClick={() => navigate(`${BILLING_HOME}/sos?month=${month}&status=SUBMITTED`)} />
        <Kpi color="orange" label="To do" icon={FiClock} value={s ? s.draft + s.not_started : "—"} note={s ? `${s.draft} in progress, ${s.not_started} not started` : ""} onClick={() => navigate(`${BILLING_HOME}/sos?month=${month}&status=NOT_STARTED`)} />
        <Kpi color="purple" label="Services completed" icon={FiActivity} progress={s && s.assigned ? (s.completed * 100) / s.assigned : null} value={s ? `${s.completed} / ${s.assigned}` : "—"} note={s?.extra ? `+ ${s.extra} extra (submitted)` : "submitted SOS"} />
      </div>

      <div className="cd-grid">
        <div className="ac-card">
          <div className="bl-panel-title"><h3 className="ac-card-title" style={{ margin: 0 }}><FiClock /> To do</h3><span className="ac-sub">most urgent first</span></div>
          {loading ? <RowsSkeleton rows={4} avatar /> : !pending.length ? (
            <div className="cd-empty"><FiCheckCircle /> All SOS for {monthLabel(month)} are submitted.</div>
          ) : (
            <div className="cd-list">
              {pending.slice(0, 12).map((r) => {
                const [label, cls] = SOS_STATUS[r.status];
                return (
                  <button key={r.company_id} type="button" className="cd-item" onClick={() => open(r)}>
                    <span className="cd-item-main"><b>{r.customer}</b><span className="ac-sub">{r.group ? `${r.group} · ` : ""}{r.outlets || 1} outlet{r.outlets === 1 ? "" : "s"} · {r.assigned} services</span></span>
                    <span className={`bl-tag ${cls}`}>{label}</span>
                    {r.bill_by_day && <span className="bl-tag">bill by day {r.bill_by_day}</span>}
                    <span className="ac-btn sm ac-btn-primary"><FiEdit3 /> Fill</span>
                  </button>
                );
              })}
              {pending.length > 12 && <button type="button" className="bl-link" onClick={() => navigate(`${BILLING_HOME}/sos?month=${month}`)}>+ {pending.length - 12} more</button>}
            </div>
          )}
        </div>

        <div className="ac-card">
          <div className="bl-panel-title"><h3 className="ac-card-title" style={{ margin: 0 }}><FiCheckCircle /> Recently submitted</h3></div>
          {!recent.length ? <div className="ac-sub">Nothing submitted yet this month.</div> : (
            <div className="cd-list">
              {recent.map((r) => (
                <button key={r.company_id} type="button" className="cd-item" onClick={() => open(r)}>
                  <span className="cd-item-main"><b>{r.customer}</b><span className="ac-sub">{r.completed} / {r.assigned} completed{r.extra ? ` · ${r.extra} extra` : ""}</span></span>
                  <span className="ac-sub">{when(r.submitted_at)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

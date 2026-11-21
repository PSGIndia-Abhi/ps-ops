import { useMemo, useState } from "react";
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { FiActivity, FiCheckCircle, FiChevronRight, FiClock, FiEdit3, FiLayers, FiSearch, FiUsers } from "react-icons/fi";
import { EmptyRow } from "../accountant/ui";
import { qs, useBilling } from "./billingApi";
import { monthLabel, thisMonth } from "./format";
import { Kpi, Msg } from "./ui";
import useDebounced from "./useDebounced";
import { BILLING_HOME } from "./access";
import { SOS_STATUS } from "./sosStatus";
import CustomerFilter from "./CustomerFilter";

// Monthly SOS: every customer with services to report for the month, and where its SOS stands.
// The Service Coordinator fills and submits them; Accounts reads them (and can send one back).

const FILTERS = [["", "All"], ["NOT_STARTED", "Not started"], ["DRAFT", "In progress"], ["SUBMITTED", "Submitted"]];
const when = (v) => (v ? new Date(v).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

export default function SosList() {
  const { me } = useOutletContext();
  const canFill = me.can("MANAGE_SERVICE_PLANS");
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const month = params.get("month") || thisMonth();
  const [status, setStatus] = useState(params.get("status") || "");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState([]); // customer filter: [] = all
  const q = useDebounced(search);
  const { data, error, loading } = useBilling(`/sos${qs({ month, q })}`);
  const all = useMemo(() => data?.rows || [], [data]);
  // Customer filter (checkboxes): the cards and counts follow the customers picked.
  const options = useMemo(() => all.map((r) => ({ id: r.company_id, name: r.customer, group: r.group, outlets: r.outlet_names })), [all]);
  const inScope = useMemo(() => {
    if (!picked.length) return all;
    const set = new Set(picked);
    return all.filter((r) => set.has(r.company_id));
  }, [all, picked]);
  const rows = inScope.filter((r) => !status || r.status === status);
  const s = useMemo(() => {
    if (!data) return null;
    const sub = inScope.filter((r) => r.status === "SUBMITTED");
    return {
      customers: inScope.length,
      submitted: sub.length,
      draft: inScope.filter((r) => r.status === "DRAFT").length,
      not_started: inScope.filter((r) => r.status === "NOT_STARTED").length,
      assigned: sub.reduce((t, r) => t + r.assigned, 0),
      completed: sub.reduce((t, r) => t + (r.completed || 0), 0),
      extra: sub.reduce((t, r) => t + r.extra, 0),
    };
  }, [data, inScope]);
  const open = (r) => navigate(`${BILLING_HOME}/sos/${encodeURIComponent(r.company_id)}?month=${month}`);

  return (
    <div className="ac-page">
      <div className="ac-head">
        <div>
          <h1 className="ac-title">Monthly SOS</h1>
          <p className="ac-sub">
            {canFill ? "Enter the services completed for each customer and submit them to Accounts." : "Services completed, as submitted by the Service Coordinator. Billing waits for the SOS."}
          </p>
        </div>
        <div className="ac-actions">
          <input type="month" className="ac-input" style={{ width: 170 }} value={month} max={thisMonth()} onChange={(e) => setParams({ month: e.target.value || thisMonth() })} aria-label="Month" />
        </div>
      </div>

      <div className="ac-kpis bl-kpis-5">
        <Kpi color="blue" label="Customers" icon={FiUsers} value={s?.customers ?? "—"} note={monthLabel(month)} onClick={() => setStatus("")} active={status === ""} />
        <Kpi color="green" label="Submitted" icon={FiCheckCircle} progress={s && s.customers ? (s.submitted * 100) / s.customers : null} value={s?.submitted ?? "—"} note="sent to Accounts" onClick={() => setStatus("SUBMITTED")} active={status === "SUBMITTED"} />
        <Kpi color="orange" label="In progress" icon={FiEdit3} value={s?.draft ?? "—"} note="saved, not submitted" onClick={() => setStatus("DRAFT")} active={status === "DRAFT"} />
        <Kpi color="red" label="Not started" icon={FiClock} value={s?.not_started ?? "—"} note="nothing entered" onClick={() => setStatus("NOT_STARTED")} active={status === "NOT_STARTED"} />
        <Kpi color="purple" label="Completed" icon={FiActivity} progress={s && s.assigned ? (s.completed * 100) / s.assigned : null} value={s ? `${s.completed} / ${s.assigned}` : "—"} note={s?.extra ? `+ ${s.extra} extra` : "of assigned (submitted)"} />
      </div>

      <div className="ac-card">
        <div className="bl-filterbar">
          <div className="bl-search">
            <FiSearch aria-hidden="true" />
            <input className="ac-input" placeholder="Search customer or group…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search" />
          </div>
          <CustomerFilter options={options} value={picked} onChange={setPicked} />
          <div className="bl-seg2" role="group" aria-label="Status">
            {FILTERS.map(([v, l]) => {
              const n = !s ? null : v === "" ? s.customers : v === "NOT_STARTED" ? s.not_started : v === "DRAFT" ? s.draft : s.submitted;
              return (
                <button key={v} type="button" className={status === v ? "active" : ""} aria-pressed={status === v} onClick={() => setStatus(v)}>
                  {l}{n !== null && <span className="bl-seg2-n">{n}</span>}
                </button>
              );
            })}
          </div>
        </div>
        <Msg error={error} />
        <div className="ac-table-wrap">
          <table className="ac-table ac-stack">
            <thead>
              <tr>
                <th>Customer</th><th>Group</th><th className="ac-num">Outlets</th><th className="ac-num">Assigned</th><th className="ac-num">Completed</th>
                <th className="ac-num">Extra</th><th>Accounts bill by</th><th>Status</th><th aria-label="Open" />
              </tr>
            </thead>
            <tbody>
              {loading || !rows.length ? (
                <EmptyRow cols={9} loading={loading} text="No customer has services to report for this month (services are set in each customer's billing profile)." />
              ) : rows.map((r) => {
                const [label, cls] = SOS_STATUS[r.status];
                const short = r.completed !== null && r.completed < r.assigned;
                return (
                  <tr key={r.company_id} className="bl-rowlink" onClick={() => open(r)}>
                    <td>
                      {r.billing_group ? (
                        <>
                          <b>{r.billing_group.group}</b>
                        </>
                      ) : <b>{r.customer}</b>}
                    </td>
                    <td>{r.group ? <span className="bl-group"><FiLayers />{r.group}</span> : <span className="ac-sub">—</span>}</td>
                    <td className="bl-num">{r.outlets || "—"}</td>
                    <td className="bl-num">{r.assigned}</td>
                    <td className="bl-num">{r.completed === null ? "—" : <span style={{ color: short ? "#b45309" : "#15803d", fontWeight: 600 }}>{r.completed}</span>}</td>
                    <td className="bl-num">{r.extra || "—"}</td>
                    <td>{r.bill_by_day ? `Day ${r.bill_by_day}` : <span className="ac-sub">—</span>}</td>
                    <td>
                      <span className={`bl-tag ${cls}`}>{label}</span>
                      {r.status === "SUBMITTED" && <div className="bl-sub">{r.submitted_by} · {when(r.submitted_at)}</div>}
                    </td>
                    <td>
                      {canFill && r.status !== "SUBMITTED"
                        ? <button type="button" className="ac-btn sm ac-btn-primary" onClick={(e) => { e.stopPropagation(); open(r); }}>Fill SOS</button>
                        : <FiChevronRight style={{ color: "#94a3b8" }} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

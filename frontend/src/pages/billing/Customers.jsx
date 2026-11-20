import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiAlertCircle, FiCheckCircle, FiChevronRight, FiLayers, FiSearch, FiTrendingUp, FiUsers } from "react-icons/fi";
import { EmptyRow, Pager } from "../accountant/ui";
import { qs, useBilling } from "./billingApi";
import { CATEGORY_LABEL, amount, rupeesShort, initials } from "./format";
import { Kpi, Msg, StatusBadge } from "./ui";
import useDebounced from "./useDebounced";
import { BILLING_HOME } from "./access";
import CustomerFilter from "./CustomerFilter";

// Customers: every customer with its billing status. A row opens the Customer Billing Profile
// (billing details, outlets, services, POs, invoice settings - everything in one place).

const PAGE_SIZE = 50;
const STATUS = [["", "All"], ["ready", "Ready to bill"], ["incomplete", "Needs setup"]];

export default function Customers() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState([]); // customer filter: [] = all
  const [status, setStatus] = useState("");
  const q = useDebounced(search);
  // Loaded once per search; the customer filter and status are applied here (instant, counts follow).
  const { data, error, loading } = useBilling(`/customer-profiles${qs({ q })}`);
  const allRows = useMemo(() => data?.rows || [], [data]);
  const options = useMemo(() => allRows.map((r) => ({ id: r.company_id, name: r.name, group: r.group, outlets: r.outlet_names })), [allRows]);
  const inScope = useMemo(() => (picked.length ? allRows.filter((r) => picked.includes(r.company_id)) : allRows), [allRows, picked]);
  const rows = inScope.filter((r) => !status || (status === "ready" ? r.ready : !r.ready));
  // 50 per page; back to page 1 whenever the search or filters change.
  const [page, setPage] = useState(0);
  const filterKey = `${q}|${picked.join(",")}|${status}`;
  const [pageKey, setPageKey] = useState(filterKey);
  if (pageKey !== filterKey) {
    setPageKey(filterKey);
    setPage(0);
  }
  const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const s = data ? {
    customers: inScope.length,
    ready: inScope.filter((r) => r.ready).length,
    incomplete: inScope.filter((r) => !r.ready).length,
    billed_customers: inScope.filter((r) => r.contracts > 0).length,
    monthly_value: inScope.reduce((t, r) => t + r.monthly_value, 0),
  } : null;
  const open = (id) => navigate(`${BILLING_HOME}/customers/${encodeURIComponent(id)}`);

  return (
    <div className="ac-page">
      <div className="ac-head">
        <div>
          <h1 className="ac-title">Customers</h1>
          <p className="ac-sub">Each customer’s billing profile: billing details, outlets, services and rates, POs, prints and email.</p>
        </div>
      </div>

      <div className="ac-kpis">
        <Kpi color="blue" label="Customers" icon={FiUsers} value={s?.customers ?? "—"} note={s ? `${s.billed_customers} with a contract` : ""} onClick={() => setStatus("")} active={status === ""} />
        <Kpi color="green" label="Ready to bill" icon={FiCheckCircle} progress={s && s.customers ? (s.ready * 100) / s.customers : null} value={s?.ready ?? "—"} note="profile complete" onClick={() => setStatus("ready")} active={status === "ready"} />
        <Kpi color="orange" label="Needs setup" icon={FiAlertCircle} value={s?.incomplete ?? "—"} note="details, contract or services missing" onClick={() => setStatus("incomplete")} active={status === "incomplete"} />
        <Kpi color="purple" label="Monthly value" icon={FiTrendingUp} value={s ? rupeesShort(s.monthly_value) : "—"} note="services per month × rate, excl. GST" />
      </div>

      <div className="ac-card">
        <div className="bl-filterbar">
          <div className="bl-search">
            <FiSearch aria-hidden="true" />
            <input className="ac-input" placeholder="Search customer or group…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search" />
          </div>
          <CustomerFilter options={options} value={picked} onChange={setPicked} />
          <div className="bl-seg2" role="group" aria-label="Status">
            {STATUS.map(([v, l]) => {
              const n = !s ? null : v === "" ? s.customers : v === "ready" ? s.ready : s.incomplete;
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
                <th>Customer</th><th>Group</th><th className="ac-num">Outlets</th><th className="ac-num">Services</th>
                <th className="ac-num">Monthly value (₹)</th><th className="ac-num">Active POs</th><th>Bill by</th><th>Status</th><th aria-label="Open" />
              </tr>
            </thead>
            <tbody>
              {loading || !rows.length ? (
                <EmptyRow cols={9} loading={loading} text="No customers match." />
              ) : (
                pageRows.map((r) => (
                  <tr key={r.company_id} className="bl-rowlink" onClick={() => open(r.company_id)}>
                    <td>
                      <div className="bl-cell2">
                        <span className="bl-avatar-sm">{initials(r.name)}</span>
                        <span><b>{r.name}</b><span className="bl-sub">{CATEGORY_LABEL[r.category] || "Customer type not set"}</span></span>
                      </div>
                    </td>
                    <td>{r.group ? <span className="bl-group"><FiLayers />{r.group}</span> : <span className="ac-sub">—</span>}</td>
                    <td className="bl-num">{r.outlets}</td>
                    <td className="bl-num">{r.services}</td>
                    <td className="bl-num">{r.monthly_value ? amount(r.monthly_value) : "—"}</td>
                    <td className="bl-num">{r.active_pos || "—"}</td>
                    <td>{r.bill_by_day ? `Day ${r.bill_by_day}` : <span className="ac-sub">—</span>}</td>
                    <td>
                      {r.ready ? <StatusBadge value="ACTIVE" label="Ready to bill" /> : (
                        <div className="bl-setup">
                          <StatusBadge value="PENDING" label="Needs setup" />
                          <span className="bl-missing"><FiAlertCircle /> {r.missing.join(" · ")}</span>
                        </div>
                      )}
                    </td>
                    <td><FiChevronRight style={{ color: "#94a3b8" }} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {rows.length > 0 && <Pager total={rows.length} pageSize={PAGE_SIZE} page={page} onPage={setPage} />}
      </div>
    </div>
  );
}

import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { EmptyRow, Pager } from "../accountant/ui";
import { billingPost, qs, useBilling } from "./billingApi";
import { dmy, monthLabel, thisMonth } from "./format";
import { Bar, Kpi, Modal, Msg } from "./ui";
import useDebounced from "./useDebounced";

// Service Tracker: planned services (from the service plans) against services done (completed
// job visits) for a month. Short rows turn red from the plan's highlight day (25th by default).

const PAGE_SIZE = 25;
const FILTERS = [
  ["", "All"],
  ["SHORT", "Short"],
  ["SCHEDULED", "Scheduled"],
  ["COMPLETED", "Completed"],
  ["EXTRA", "Extra"],
];

function statusChip(row) {
  if (row.status === "SHORT") return <span className="bl-svc short">{row.done === 0 ? "Not done" : `Short by ${row.pending}`} ⚠</span>;
  if (row.status === "SCHEDULED") return <span className="bl-svc due">{row.pending} scheduled{row.next_visit ? ` ${dmy(row.next_visit).slice(0, 5)}` : ""}</span>;
  if (row.status === "EXTRA") return <span className="bl-svc extra">Extra +{row.done - row.planned}</span>;
  return <span className="bl-svc ok">Completed</span>;
}

// One row per customer: its services added up. Status: Short if any service is short, then
// Scheduled, then Extra, else Completed.
const STATUS_RANK = { SHORT: 0, SCHEDULED: 1, EXTRA: 2, COMPLETED: 3 };
function byCustomer(rows) {
  const groups = [];
  const at = new Map();
  for (const r of rows) {
    let g = at.get(r.company_id);
    if (!g) {
      g = { company_id: r.company_id, customer: r.customer, rows: [], planned: 0, done: 0, pending: 0, notEntered: 0, highlight: false, last_visit: null, status: "COMPLETED", scheduled: 0, next_visit: null };
      at.set(r.company_id, g);
      groups.push(g);
    }
    g.rows.push(r);
    g.planned += r.planned;
    g.done += r.done;
    g.pending += r.pending;
    if (r.completed_entered === false) g.notEntered += 1;
    if (r.highlight) g.highlight = true;
    if (r.last_visit && (!g.last_visit || r.last_visit > g.last_visit)) g.last_visit = r.last_visit;
    if (STATUS_RANK[r.status] < STATUS_RANK[g.status]) g.status = r.status;
    if (r.status === "SCHEDULED") {
      g.scheduled += r.pending;
      if (r.next_visit && (!g.next_visit || r.next_visit < g.next_visit)) g.next_visit = r.next_visit;
    }
  }
  return groups;
}

function groupChip(g) {
  if (g.status === "SHORT") return <span className="bl-svc short">{g.done === 0 ? "Not done" : `Short by ${g.pending}`} ⚠</span>;
  if (g.status === "SCHEDULED") return <span className="bl-svc due">{g.scheduled} scheduled{g.next_visit ? ` ${dmy(g.next_visit).slice(0, 5)}` : ""}</span>;
  if (g.status === "EXTRA") return <span className="bl-svc extra">Extra +{g.done - g.planned}</span>;
  return <span className="bl-svc ok">Completed</span>;
}

export default function ServiceTracker() {
  const { me } = useOutletContext();
  const [month, setMonth] = useState(thisMonth());
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [visitsFor, setVisitsFor] = useState(null);
  const [open, setOpen] = useState(() => new Set()); // customers whose services are shown
  const toggle = (id) => setOpen((o) => {
    const n = new Set(o);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  const [notice, setNotice] = useState({});
  const q = useDebounced(search);
  const { data, error, loading } = useBilling(`/service-tracker${qs({ month, status, q, page: page + 1, page_size: PAGE_SIZE })}`);
  const { data: all } = useBilling(`/service-tracker${qs({ month, status: "SHORT", page_size: 200 })}`);
  const s = data?.summary;
  const short = all?.rows || [];

  async function notify() {
    setNotice({});
    try {
      const r = await billingPost("/service-tracker/notify", { month, rows: short.map((x) => ({ company_id: x.company_id, site_id: x.site_id, sub_service: x.sub_service })) });
      setNotice({ ok: `Operations notified (${r.notified_users} people, ${r.services} services).` });
    } catch (err) {
      setNotice({ error: err.message });
    }
  }

  const pick = (value) => {
    setStatus(value);
    setPage(0);
  };

  return (
    <div className="ac-page">
      <div className="ac-head">
        <div>
          <h1 className="ac-title">Service Tracker</h1>
          <p className="ac-sub">Planned services against services done this month. Invoices are generated from the services done.</p>
        </div>
        <div className="ac-actions">
          <input type="month" className="ac-input" style={{ width: 170 }} value={month} max={thisMonth()} onChange={(e) => { setMonth(e.target.value || thisMonth()); setPage(0); }} aria-label="Month" />
          <button type="button" className="ac-btn ac-btn-primary" disabled={!short.length} onClick={notify}>
            Notify Operations ({short.length})
          </button>
        </div>
      </div>
      <Msg {...notice} />

      <div className="ac-kpis bl-kpis-5">
        <Kpi color="blue" label="Planned services" value={s ? s.planned.toLocaleString("en-IN") : "—"} note={monthLabel(month)} onClick={() => pick("")} active={status === ""} />
        <Kpi color="green" label="Done" value={s ? s.done.toLocaleString("en-IN") : "—"} note={s ? `${s.done_percent}% of plan` : ""} onClick={() => pick("COMPLETED")} active={status === "COMPLETED"} />
        <Kpi color="red" label="Short" value={s ? s.short_customers : "—"} note={s ? `customers · ${s.short_services} services not done` : ""} onClick={() => pick("SHORT")} active={status === "SHORT"} />
        <Kpi color="orange" label="Scheduled, not yet due" value={s ? s.scheduled_not_due : "—"} note="before month end" onClick={() => pick("SCHEDULED")} active={status === "SCHEDULED"} />
        <Kpi color="purple" label="Extra services" value={s ? s.extra : "—"} note="done beyond plan" onClick={() => pick("EXTRA")} active={status === "EXTRA"} />
      </div>

      <div className="ac-card">
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, gap: 10, flexWrap: "wrap" }}>
          <div className="ac-pills">
            {FILTERS.map(([value, label]) => (
              <button key={label} type="button" className={`ac-pill ${status === value ? "active" : ""}`} onClick={() => pick(value)}>
                {label}{value === "SHORT" && s ? ` (${s.short_customers})` : ""}
              </button>
            ))}
          </div>
          <input className="ac-input" style={{ maxWidth: 300 }} placeholder="Search customer or outlet…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
        </div>
        <Msg error={error} />
        <div className="ac-table-wrap">
          <table className="ac-table ac-stack">
            <thead>
              <tr>
                <th>Customer</th><th>Services</th><th className="ac-num">Planned</th><th className="ac-num">Done</th>
                <th className="ac-num">Pending</th><th>Progress</th><th>Last visit</th><th>Status</th><th />
              </tr>
            </thead>
            <tbody>
              {loading || !data?.rows?.length ? (
                <EmptyRow cols={9} loading={loading} text={me.can("VIEW_SERVICE_TRACKER") ? "No planned services for this month. Service plans are set in Service Plans." : "No access"} />
              ) : (
                byCustomer(data.rows).map((g) => {
                  const isOpen = open.has(g.company_id);
                  return [
                    <tr key={g.company_id} className={`bl-click ${g.highlight ? "bl-short" : g.status === "SCHEDULED" ? "bl-due" : ""}`} onClick={() => toggle(g.company_id)} aria-expanded={isOpen}>
                      <td>
                        <span className="st-caret" aria-hidden="true">{isOpen ? "▾" : "▸"}</span> <b>{g.customer}</b>
                      </td>
                      <td>
                        {g.rows.length} service{g.rows.length === 1 ? "" : "s"}
                        <div className="bl-sub" style={{ maxWidth: 320 }}>{g.rows.map((r) => r.sub_service).join(", ")}</div>
                      </td>
                      <td className="bl-num">{g.planned}</td>
                      <td className="bl-num">
                        <b>{g.done}</b>
                        {g.notEntered > 0 && <div className="bl-warn">{g.notEntered} not entered</div>}
                      </td>
                      <td className="bl-num">{g.pending || "—"}</td>
                      <td><Bar done={g.done} planned={g.planned} status={g.status} /></td>
                      <td>{g.last_visit ? dmy(g.last_visit) : "—"}</td>
                      <td>{groupChip(g)}</td>
                      <td><button type="button" className="ac-btn sm" onClick={(e) => { e.stopPropagation(); toggle(g.company_id); }}>{isOpen ? "Hide" : "Services"}</button></td>
                    </tr>,
                    ...(isOpen
                      ? g.rows.map((r) => (
                        <tr key={`${r.company_id}|${r.site_id}|${r.service_type}|${r.sub_service}`} className={`st-sub ${r.highlight ? "bl-short" : r.status === "SCHEDULED" ? "bl-due" : ""}`}>
                          <td className="st-sub-name">{r.site_id ? r.site || "—" : "All outlets"}</td>
                          <td>{r.sub_service}</td>
                          <td className="bl-num">{r.planned}</td>
                          {/* Completed is typed by the Service Coordinator (Service Plans > Services this month). */}
                          <td className="bl-num">{r.completed_entered === false ? <span className="bl-warn" title={`${r.jobs_done ?? 0} completed job(s) recorded`}>Not entered</span> : <b>{r.done}</b>}</td>
                          <td className="bl-num">{r.pending || "—"}</td>
                          <td><Bar done={r.done} planned={r.planned} status={r.status} /></td>
                          <td>{r.last_visit ? dmy(r.last_visit) : "—"}</td>
                          <td>{statusChip(r)}</td>
                          <td><button type="button" className="ac-btn sm" onClick={() => setVisitsFor(r)}>View jobs</button></td>
                        </tr>
                      ))
                      : []),
                  ];
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="ac-info" style={{ marginTop: 12 }}>
          ⓘ Rows turn red from the 25th of the month (or the day set in the service plan) when planned services are still not done.
          Their invoice bills only the services done (monthly rate ÷ planned × done); Accounts can choose “Bill full amount” in the draft with a reason.
        </div>
        {data && <Pager total={data.total} pageSize={PAGE_SIZE} page={page} onPage={setPage} />}
      </div>

      {visitsFor && <VisitsDialog row={visitsFor} month={month} onClose={() => setVisitsFor(null)} />}
    </div>
  );
}

function VisitsDialog({ row, month, onClose }) {
  // A whole-customer plan line (no outlet) lists the visits at every outlet of the customer.
  const { data, error, loading } = useBilling(`/service-tracker/jobs${qs({
    site_id: row.site_id, company_id: row.site_id ? null : row.company_id, service_type: row.service_type, sub_service: row.sub_service, month,
  })}`);
  return (
    <Modal onClose={onClose} label="Visits">
      <div className="bl-m-head">
        <div>
          <h3>{row.sub_service}</h3>
          <div className="ac-sub">{row.customer} · {row.site_id ? row.site : "All outlets"} · {monthLabel(month)} · {row.done} of {row.planned} done</div>
        </div>
        <button type="button" className="bl-x" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className="bl-m-body">
        <Msg error={error} />
        <table className="ac-table ac-stack">
          <thead><tr><th>Job</th><th>Visit</th><th>Scheduled</th><th>Status</th><th>Completed</th></tr></thead>
          <tbody>
            {loading || !data?.length ? (
              <EmptyRow cols={5} loading={loading} text="No visits this month" />
            ) : (
              data.map((v) => (
                <tr key={`${v.job_id}-${v.visit_number}`}>
                  <td>{v.job_code}{!row.site_id && v.site && <div className="bl-sub">{v.site}</div>}</td>
                  <td>#{v.visit_number}</td>
                  <td>{dmy(v.scheduled_date)}</td>
                  <td><span className={`ac-badge ${v.status === "COMPLETED" ? "b-green" : v.status === "MISSED" ? "b-red" : "b-amber"}`}>{v.status.replace("_", " ").toLowerCase()}</span></td>
                  <td>{v.completed_at ? new Date(v.completed_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

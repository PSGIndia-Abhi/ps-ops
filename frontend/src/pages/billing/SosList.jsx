import { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { FiActivity, FiCheckCircle, FiChevronRight, FiClock, FiEdit3, FiLayers, FiSearch, FiSend, FiUsers } from "react-icons/fi";
import { EmptyRow } from "../accountant/ui";
import { billingPost, qs, useBilling } from "./billingApi";
import { monthLabel, thisMonth } from "./format";
import { Kpi, Modal, Msg, MonthPicker } from "./ui";
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
  const { data, error, loading, reload } = useBilling(`/sos${qs({ month, q })}`);
  // Ticked customers, submitted to Accounts together. Only a saved (In progress) SOS can be ticked.
  const [ticked, setTicked] = useState(() => new Set());
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { ok, error, failed: [{ customer, reason }] }
  useEffect(() => { setTicked(new Set()); setResult(null); }, [month]);
  // Not started or In progress: ticked SOS are submitted with every service not entered as assigned.
  // A termite SOS needs its treated area, so a Not started one is opened instead.
  const canTick = (r) => canFill && (r.status === "DRAFT" || (r.status === "NOT_STARTED" && !r.area_only));
  const tickHint = (r) => (r.status === "SUBMITTED" ? "Already submitted" : r.status === "NOT_STARTED" && r.area_only ? "Termite: open it and enter the treated area" : "");
  const all = useMemo(() => data?.rows || [], [data]);
  // Customer filter (checkboxes): the cards and counts follow the customers picked.
  const options = useMemo(() => all.map((r) => ({ id: r.company_id, name: r.customer, group: r.group, outlets: r.outlet_names })), [all]);
  const inScope = useMemo(() => {
    if (!picked.length) return all;
    const set = new Set(picked);
    return all.filter((r) => set.has(r.company_id));
  }, [all, picked]);
  // Still to do first; submitted ones go to the bottom (same order otherwise).
  const rows = inScope.filter((r) => !status || r.status === status).sort((a, b) => (a.status === "SUBMITTED") - (b.status === "SUBMITTED"));
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
  const tickable = rows.filter(canTick);
  const chosen = all.filter((r) => ticked.has(r.company_id) && canTick(r));
  const allOn = tickable.length > 0 && tickable.every((r) => ticked.has(r.company_id));
  const toggle = (id) => setTicked((cur) => {
    const next = new Set(cur);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const toggleAll = () => setTicked((cur) => {
    const next = new Set(cur);
    for (const r of tickable) (allOn ? next.delete(r.company_id) : next.add(r.company_id));
    return next;
  });
  const nameOf = (r) => (r.billing_group ? r.billing_group.group : r.customer);

  async function submitChosen() {
    setBusy(true);
    try {
      const r = await billingPost("/sos/submit-many", { month, company_ids: chosen.map((x) => x.company_id) });
      const n = r.submitted.length;
      setResult({
        ok: n ? `${n} SOS submitted to Accounts. They have been notified.` : "",
        error: r.failed.length ? `${r.failed.length} could not be submitted:` : "",
        failed: r.failed,
      });
      setTicked(new Set(r.failed.map((f) => f.company_id)));
      reload();
    } catch (err) {
      setResult({ error: err.message, failed: [] });
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <div className="ac-page">
      <div className="ac-head">
        <div>
          <h1 className="ac-title">Monthly SOS</h1>
          <p className="ac-sub">
            {canFill ? "Accounts can bill a customer only after its SOS is submitted." : "Billing waits for the Service Coordinator's SOS."}
          </p>
        </div>
        <div className="ac-actions">
          <MonthPicker value={month} max={thisMonth()} fallback={thisMonth()} onChange={(m) => setParams({ month: m })} />
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
        {result && (
          <div style={{ marginBottom: 10 }}>
            {result.ok && <Msg ok={result.ok} />}
            {result.error && <Msg error={result.error} />}
            {result.failed.length > 0 && (
              <ul className="ac-sub" style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 13 }}>
                {result.failed.map((f) => <li key={f.company_id}><b>{f.customer}</b>: {f.reason}</li>)}
              </ul>
            )}
          </div>
        )}
        {canFill && chosen.length > 0 && (
          <div className="bl-selbar">
            <span><b>{chosen.length}</b> selected</span>
            {/* actions on the right */}
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
              <button type="button" className="bl-link" onClick={() => setTicked(new Set())}>Clear</button>
              <button type="button" className="ac-btn sm ac-btn-primary" disabled={busy} onClick={() => setConfirming(true)}><FiSend /> Submit to Accounts</button>
            </div>
          </div>
        )}
        <div className="ac-table-wrap">
          <table className="ac-table ac-stack bl-tabstack">
            <thead>
              <tr>
                {canFill && (
                  <th style={{ width: 36 }}>
                    <input type="checkbox" className="bl-cb" checked={allOn} disabled={!tickable.length} onChange={toggleAll}
                      title={tickable.length ? "Select every In progress SOS shown" : "No In progress SOS to select"} aria-label="Select all In progress" />
                  </th>
                )}
                <th>Customer</th><th>Group</th><th className="ac-num">Outlets</th><th className="ac-num">Assigned</th><th className="ac-num">Completed</th>
                <th className="ac-num">Extra</th><th>Accounts bill by</th><th>Status</th><th aria-label="Open" />
              </tr>
            </thead>
            <tbody>
              {loading || !rows.length ? (
                <EmptyRow cols={canFill ? 10 : 9} loading={loading} text="No customer has services to report for this month (services are set in each customer's billing profile)." />
              ) : rows.map((r) => {
                const [label, cls] = SOS_STATUS[r.status];
                const short = r.completed !== null && r.completed < r.assigned;
                return (
                  <tr key={r.company_id} className={`bl-rowlink ${ticked.has(r.company_id) && canTick(r) ? "bl-sel" : ""}`} onClick={() => open(r)}>
                    {canFill && (
                      <td onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" className="bl-cb" checked={ticked.has(r.company_id) && canTick(r)} disabled={!canTick(r)}
                          onChange={() => toggle(r.company_id)} title={tickHint(r)} aria-label={`Select ${nameOf(r)}`} />
                      </td>
                    )}
                    <td>
                      {r.billing_group ? (
                        <>
                          <b>{r.billing_group.group}</b>
                        </>
                      ) : <b>{r.customer}</b>}
                    </td>
                    <td>{r.group ? <span className="bl-group"><FiLayers />{r.group}</span> : <span className="ac-sub">—</span>}</td>
                    <td className="bl-num">{r.outlets || "—"}</td>
                    <td className="bl-num">{r.area_only ? "—" : r.assigned}</td>
                    <td className="bl-num">{r.area_only || r.completed === null ? "—" : <span style={{ color: short ? "#b45309" : "#15803d", fontWeight: 600 }}>{r.completed}</span>}</td>
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

      {confirming && (
        <Modal onClose={() => !busy && setConfirming(false)} narrow label="Submit SOS">
          <div className="bl-m-head">
            <div><h3>Submit {chosen.length} SOS to Accounts?</h3><div className="ac-sub">{monthLabel(month)}</div></div>
            <button type="button" className="bl-x" onClick={() => setConfirming(false)} aria-label="Close">✕</button>
          </div>
          <div className="bl-m-body">
            <ul style={{ margin: 0, paddingLeft: 18, maxHeight: 220, overflowY: "auto" }}>
              {chosen.map((r) => <li key={r.company_id}><b>{nameOf(r)}</b>{!r.area_only && r.status === "NOT_STARTED" && <span className="ac-sub"> · {r.assigned} completed</span>}</li>)}
            </ul>
          </div>
          <div className="bl-m-foot"><span /><div className="ac-actions">
            <button type="button" className="ac-btn" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>
            <button type="button" className="ac-btn ac-btn-primary" disabled={busy} onClick={submitChosen}>{busy ? "Submitting…" : `Submit ${chosen.length}`}</button>
          </div></div>
        </Modal>
      )}
    </div>
  );
}

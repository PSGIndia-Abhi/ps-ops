import { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { FiActivity, FiAlertTriangle, FiCheckCircle, FiChevronLeft, FiChevronRight, FiClock, FiEdit3, FiLayers, FiSearch, FiSend, FiUsers } from "react-icons/fi";
import { EmptyRow } from "../accountant/ui";
import { billingPost, qs, useBilling } from "./billingApi";
import { monthLabel, thisMonth, today } from "./format";
import { Kpi, Modal, Msg, MonthPicker } from "./ui";
import useDebounced from "./useDebounced";
import { BILLING_HOME } from "./access";
import { SOS_STATUS } from "./sosStatus";
import CustomerFilter from "./CustomerFilter";

// Monthly SOS: every customer with services to report for the month, and where its SOS stands.
// The Service Coordinator fills and submits them; Accounts reads them (and can send one back).

const FILTERS = [["", "All"], ["NOT_STARTED", "Not started"], ["DRAFT", "In progress"], ["SUBMITTED", "Submitted"]];
const when = (v) => (v ? new Date(v).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** "YYYY-MM" moved by n months. */
const shiftMonth = (m, n) => {
  const d = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
/** Days in a "YYYY-MM" month. */
const daysIn = (m) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).getUTCDate();
/** "YYYY-MM-DD" moved by n days. */
const shiftDay = (d, n) => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
/** "2026-11-21" -> "21 Nov 2026". */
const dateLabel = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

export default function SosList() {
  const { me } = useOutletContext();
  const canFill = me.can("MANAGE_SERVICE_PLANS");
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  // Date view (always the default): customers whose contract Bill date is that date. With only
  // ?month= it opens today in the current month, else the 1st of that month.
  // Whole month (?view=month, from the "Whole month" button): every customer of the month.
  const monthParam = /^\d{4}-\d{2}$/.test(params.get("month") || "") ? params.get("month") : thisMonth();
  const wholeMonth = params.get("view") === "month";
  const dateParam = params.get("date");
  const date = wholeMonth ? "" : DATE_RE.test(dateParam || "") ? dateParam : monthParam === thisMonth() ? today() : `${monthParam}-01`;
  const month = date ? date.slice(0, 7) : monthParam;
  // Up to the end of next month: an SOS is due after its month ends (November SOS, day 10 -> 10 Dec).
  const nextMonth = shiftMonth(thisMonth(), 1);
  const maxDate = `${nextMonth}-${String(daysIn(nextMonth)).padStart(2, "0")}`;
  const [status, setStatus] = useState(params.get("status") || "");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState([]); // customer filter: [] = all
  const q = useDebounced(search);
  // Date view: an SOS is due on its Bill date after its month ends, so the SOS due (or missed) on a
  // date are mostly of the month before - the date's month and the two before it are loaded.
  // Whole month: that month only. Each row is one customer's SOS of one month (sos_month).
  const months = wholeMonth ? [month] : [shiftMonth(month, -2), shiftMonth(month, -1), month];
  const m0 = useBilling(`/sos${qs({ month: months[0], q })}`);
  const m1 = useBilling(months[1] ? `/sos${qs({ month: months[1], q })}` : null);
  const m2 = useBilling(months[2] ? `/sos${qs({ month: months[2], q })}` : null);
  const loads = [m0, m1, m2].slice(0, months.length);
  const monthsKey = months.join(",");
  const data = useMemo(() => {
    const ms = monthsKey.split(",");
    const parts = [m0.data, m1.data, m2.data].slice(0, ms.length);
    if (!parts.every(Boolean)) return null;
    return { rows: parts.flatMap((d, i) => d.rows.map((r) => ({ ...r, sos_month: ms[i], key: `${r.company_id}|${ms[i]}` }))) };
  }, [m0.data, m1.data, m2.data, monthsKey]);
  const error = loads.map((x) => x.error).find(Boolean) || "";
  const loading = loads.some((x) => x.loading) || !data;
  const reload = () => loads.forEach((x) => x.reload());
  // Ticked SOS (customer + month), submitted to Accounts together. Only a saved (In progress) SOS can be ticked.
  const [ticked, setTicked] = useState(() => new Set());
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { ok, error, failed: [{ customer, reason }] }
  useEffect(() => { setTicked(new Set()); setResult(null); }, [month, date]);
  // Not started or In progress: ticked SOS are submitted with every service not entered as assigned.
  // A termite SOS needs its treated area, so a Not started one is opened instead.
  const canTick = (r) => canFill && (r.status === "DRAFT" || (r.status === "NOT_STARTED" && !r.area_only));
  const tickHint = (r) => (r.status === "SUBMITTED" ? "Already submitted" : r.status === "NOT_STARTED" && r.area_only ? "Termite: open it and enter the treated area" : "");
  // Date view: customers whose Bill date (the earliest of their contracts) is that day, plus every SOS
  // that missed an earlier Bill date and is still not submitted (carried forward). A Bill date past the
  // month's end is its last day (bill_date, from the server). Customers without a Bill date: Whole month only.
  const list = data?.rows;
  const all = useMemo(() => {
    if (!list) return [];
    if (wholeMonth) return list;
    return list.filter((r) => r.bill_date && (r.bill_date === date || (r.missed_days > 0 && r.bill_date < date)));
  }, [list, wholeMonth, date]);
  const lateText = (n) => `${n} day${n === 1 ? "" : "s"} late`;
  // Customer filter (checkboxes): the cards and counts follow the customers picked (each customer once).
  const options = useMemo(() => [...new Map(all.map((r) => [r.company_id, { id: r.company_id, name: r.customer, group: r.group, outlets: r.outlet_names }])).values()], [all]);
  const inScope = useMemo(() => {
    if (!picked.length) return all;
    const set = new Set(picked);
    return all.filter((r) => set.has(r.company_id));
  }, [all, picked]);
  // Missed bill dates first (the longest overdue on top), then still to do; submitted ones at the bottom.
  const rows = inScope.filter((r) => !status || r.status === status)
    .sort((a, b) => (b.missed_days || 0) - (a.missed_days || 0) || (a.status === "SUBMITTED") - (b.status === "SUBMITTED"));
  const missedCount = inScope.filter((r) => r.missed_days > 0).length;
  const oldestMissed = inScope.reduce((t, r) => Math.max(t, r.missed_days || 0), 0);
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
  // The back arrow returns to this date only for the SOS of the date's own month (SosEntry backDate).
  const open = (r) => navigate(`${BILLING_HOME}/sos/${encodeURIComponent(r.company_id)}?month=${r.sos_month}${date ? `&date=${date}` : "&view=month"}`);
  const viewLabel = wholeMonth ? monthLabel(month) : dateLabel(date);
  // Switching to the date view: today in the current month, else the 1st of the month shown.
  const toDateView = () => setParams({ date: month === thisMonth() ? today() : `${month}-01` });
  const tickable = rows.filter(canTick);
  const chosen = all.filter((r) => ticked.has(r.key) && canTick(r));
  const allOn = tickable.length > 0 && tickable.every((r) => ticked.has(r.key));
  const toggle = (id) => setTicked((cur) => {
    const next = new Set(cur);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const toggleAll = () => setTicked((cur) => {
    const next = new Set(cur);
    for (const r of tickable) (allOn ? next.delete(r.key) : next.add(r.key));
    return next;
  });
  const nameOf = (r) => (r.billing_group ? r.billing_group.group : r.customer);

  async function submitChosen() {
    setBusy(true);
    try {
      // One call per SOS month (the date view can hold SOS of different months).
      const byMonth = new Map();
      for (const x of chosen) byMonth.set(x.sos_month, [...(byMonth.get(x.sos_month) || []), x.company_id]);
      let n = 0;
      const failed = [];
      for (const [m, ids] of byMonth) {
        const r = await billingPost("/sos/submit-many", { month: m, company_ids: ids });
        n += r.submitted.length;
        failed.push(...r.failed.map((f) => ({ ...f, key: `${f.company_id}|${m}`, customer: byMonth.size > 1 ? `${f.customer} (${monthLabel(m)})` : f.customer })));
      }
      setResult({
        ok: n ? `${n} SOS submitted to Accounts. They have been notified.` : "",
        error: failed.length ? `${failed.length} could not be submitted:` : "",
        failed,
      });
      setTicked(new Set(failed.map((f) => f.key)));
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
          <div className="bl-seg2" role="group" aria-label="View">
            <button type="button" className={!wholeMonth ? "active" : ""} aria-pressed={!wholeMonth} onClick={() => wholeMonth && toDateView()}>Date</button>
            <button type="button" className={wholeMonth ? "active" : ""} aria-pressed={wholeMonth} onClick={() => !wholeMonth && setParams({ view: "month", month })}>Whole month</button>
          </div>
          {wholeMonth ? (
            <MonthPicker value={month} max={thisMonth()} fallback={thisMonth()} onChange={(m) => setParams({ view: "month", month: m })} />
          ) : (
            <div className="bl-monthnav">
              <button type="button" className="bl-monthnav-btn" onClick={() => setParams({ date: shiftDay(date, -1) })} aria-label="Previous day" title="Previous day"><FiChevronLeft /></button>
              <input type="date" className="ac-input" style={{ width: 170 }} value={date} max={maxDate}
                onChange={(e) => DATE_RE.test(e.target.value) && setParams({ date: e.target.value })} aria-label="Date" />
              <button type="button" className="bl-monthnav-btn" disabled={date >= maxDate} onClick={() => setParams({ date: shiftDay(date, 1) })} aria-label="Next day" title="Next day"><FiChevronRight /></button>
            </div>
          )}
        </div>
      </div>

      <div className="ac-kpis bl-kpis-5">
        <Kpi color="blue" label="Customers" icon={FiUsers} value={s?.customers ?? "—"} note={wholeMonth ? viewLabel : `bill on ${viewLabel}`} onClick={() => setStatus("")} active={status === ""} />
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
        {missedCount > 0 && (
          <div className="br-missed-banner" role="status">
            <span className="br-missed-ic"><FiAlertTriangle /></span>
            <div className="br-missed-text">
              <b>{missedCount} SOS missed {missedCount === 1 ? "its" : "their"} bill date</b>
              <span>{missedCount === 1 ? `${lateText(oldestMissed)}.` : `The oldest is ${lateText(oldestMissed)}.`} Accounts cannot bill until the SOS is submitted - they stay listed on every date until then.</span>
            </div>
          </div>
        )}
        {result && (
          <div style={{ marginBottom: 10 }}>
            {result.ok && <Msg ok={result.ok} />}
            {result.error && <Msg error={result.error} />}
            {result.failed.length > 0 && (
              <ul className="ac-sub" style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 13 }}>
                {result.failed.map((f) => <li key={f.key || f.company_id}><b>{f.customer}</b>: {f.reason}</li>)}
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
                <th className="ac-num">Extra</th><th>Bill date</th><th>Status</th><th aria-label="Open" />
              </tr>
            </thead>
            <tbody>
              {loading || !rows.length ? (
                <EmptyRow cols={canFill ? 10 : 9} loading={loading} text={wholeMonth
                  ? "No customer has services to report for this month (services are set in each customer's billing profile)."
                  : `No SOS due on ${viewLabel} and none missed. Pick another date or see the whole month (customers without a Bill date show there).`} />
              ) : rows.map((r) => {
                const [label, cls] = SOS_STATUS[r.status];
                const short = r.completed !== null && r.completed < r.assigned;
                return (
                  <tr key={r.key} className={`bl-rowlink ${ticked.has(r.key) && canTick(r) ? "bl-sel" : ""} ${r.missed_days > 0 ? "br-missed-row" : ""}`} onClick={() => open(r)}>
                    {canFill && (
                      <td onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" className="bl-cb" checked={ticked.has(r.key) && canTick(r)} disabled={!canTick(r)}
                          onChange={() => toggle(r.key)} title={tickHint(r)} aria-label={`Select ${nameOf(r)}`} />
                      </td>
                    )}
                    <td>
                      {r.billing_group ? (
                        <>
                          <b>{r.billing_group.group}</b>
                        </>
                      ) : <b>{r.customer}</b>}
                      {/* date view: rows can be SOS of different months */}
                      {!wholeMonth && <div className="bl-sub">{monthLabel(r.sos_month)} SOS</div>}
                    </td>
                    <td>{r.group ? <span className="bl-group"><FiLayers />{r.group}</span> : <span className="ac-sub">—</span>}</td>
                    <td className="bl-num">{r.outlets || "—"}</td>
                    <td className="bl-num">{r.area_only ? "—" : r.assigned}</td>
                    <td className="bl-num">{r.area_only || r.completed === null ? "—" : <span style={{ color: short ? "#b45309" : "#15803d", fontWeight: 600 }}>{r.completed}</span>}</td>
                    <td className="bl-num">{r.extra || "—"}</td>
                    <td>
                      {r.bill_date ? (
                        <>
                          <span className="br-billdate">{dateLabel(r.bill_date)}</span>
                          {r.missed_days > 0 && (
                            <span className="br-tag missed" title={`Bill date ${dateLabel(r.bill_date)} has passed - SOS not submitted yet`}><FiAlertTriangle /> Missed · {lateText(r.missed_days)}</span>
                          )}
                        </>
                      ) : <span className="ac-sub" title="No Bill date on the customer's contract">—</span>}
                    </td>
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
            <div><h3>Submit {chosen.length} SOS to Accounts?</h3><div className="ac-sub">{[...new Set(chosen.map((r) => r.sos_month))].sort().map(monthLabel).join(", ")} SOS</div></div>
            <button type="button" className="bl-x" onClick={() => setConfirming(false)} aria-label="Close">✕</button>
          </div>
          <div className="bl-m-body">
            <ul style={{ margin: 0, paddingLeft: 18, maxHeight: 220, overflowY: "auto" }}>
              {chosen.map((r) => <li key={r.key}><b>{nameOf(r)}</b>{!wholeMonth && <span className="ac-sub"> · {monthLabel(r.sos_month)}</span>}{!r.area_only && r.status === "NOT_STARTED" && <span className="ac-sub"> · {r.assigned} completed</span>}</li>)}
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

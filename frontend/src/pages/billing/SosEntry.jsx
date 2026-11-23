import { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext, useParams, useSearchParams } from "react-router-dom";
import {
  FiAlertTriangle, FiArrowLeft, FiArrowUp, FiCalendar, FiCheckCircle, FiChevronLeft, FiChevronRight, FiClipboard, FiClock, FiInfo,
  FiArrowDown, FiLayers, FiLock, FiMessageSquare, FiMinus, FiMinusCircle, FiPlus, FiPlusCircle, FiRotateCcw, FiSend, FiUsers, FiX,
} from "react-icons/fi";
import { billingPost, billingPut, qs, useBilling } from "./billingApi";
import { dmy, monthLabel, periodLabel, rupees, thisMonth } from "./format";
import { LuClipboardCheck, LuClipboardList, LuListPlus, LuScale, LuTrendingDown, LuTrendingUp } from "react-icons/lu";
import { ComboInput, CountUp, Modal, Msg } from "./ui";
import { SOS_STATUS } from "./sosStatus";
import { BILLING_HOME } from "./access";
import { PageSkeleton } from "./Skeletons";

// SOS entry: one customer, one month. The services agreed in the customer's billing profile come up
// per outlet with "assigned"; the Service Coordinator enters "completed" (filled with the assigned
// number to start with), adds extra services done beyond the agreement, and submits to Accounts.
// Submitted = read-only. The coordinator can reopen it to correct; Accounts can send it back.

const ALL = "";
const STATUS_TONE = { ok: "green", warn: "amber", "": "grey" };
const norm = (v) => String(v || "").trim().toLowerCase();
let extraKey = 0;
const shiftMonth = (m, n) => {
  const [y, mm] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mm - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
// Termite area rows: one per contract line and billing period
const areaKey = (a) => `${a.contract_line_id}|${a.period_start}`;
const unitLabel = (u) => (/ft/i.test(u || "") ? "sq. ft" : "sq. m");
const when = (v) => (v ? new Date(v).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

export default function SosEntry() {
  const { companyId } = useParams();
  const [params, setParams] = useSearchParams();
  const month = params.get("month") || thisMonth();
  // Opened from the Bill Run ("SOS submitted - view"): the back arrow returns there, not to Monthly SOS.
  const fromRun = params.get("from") === "run";
  const { me } = useOutletContext();
  const canFill = me.can("MANAGE_SERVICE_PLANS");
  const canSendBack = me.can("GENERATE_INVOICE");
  const navigate = useNavigate();
  const { data, error, loading, reload } = useBilling(`/sos/${encodeURIComponent(companyId)}${qs({ month })}`);
  const { data: options } = useBilling(canFill ? `/service-options${qs({ company_id: companyId })}` : null);

  const [done, setDone] = useState({}); // contract_line_id -> completed (string for the input)
  const [remarks, setRemarks] = useState({});
  const [extras, setExtras] = useState([]);
  const [areas, setAreas] = useState({}); // termite: areaKey -> treated area (string for the input)
  const [areaRemarks, setAreaRemarks] = useState({});
  const [notes, setNotes] = useState("");
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState({});
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [reason, setReason] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [openRemarks, setOpenRemarks] = useState(() => new Set()); // rows whose remark field is open
  const toggleRemark = (id, open) => setOpenRemarks((cur) => {
    const next = new Set(cur);
    if (open ?? !next.has(id)) next.add(id);
    else next.delete(id);
    return next;
  });

  // Load the form from the SOS. A new SOS starts with completed = assigned, so only differences are typed.
  useEffect(() => {
    if (!data) return;
    const fresh = data.status === "NOT_STARTED";
    const d = {};
    const r = {};
    for (const l of data.lines.filter((x) => !x.is_extra)) {
      d[l.contract_line_id] = l.completed !== null ? String(l.completed) : fresh ? String(l.assigned) : "";
      r[l.contract_line_id] = l.remarks || "";
    }
    setDone(d);
    setRemarks(r);
    setExtras(data.lines.filter((x) => x.is_extra).map((x) => ({ key: (extraKey += 1), site_id: x.site_id || ALL, service: x.service, completed: String(x.completed ?? 1), remarks: x.remarks || "", area: x.area === null || x.area === undefined ? "" : String(x.area), unit: x.unit || "" })));
    const ar = {};
    const arr = {};
    for (const a of data.area_lines || []) {
      ar[areaKey(a)] = a.area === null || a.area === undefined ? "" : String(a.area);
      arr[areaKey(a)] = a.remarks || "";
    }
    setAreas(ar);
    setAreaRemarks(arr);
    setNotes(data.notes || "");
    setDirty(false);
    setMsg({});
  }, [data]);

  const editable = canFill && data && data.status !== "SUBMITTED" && !data.invoiced?.length;
  const agreed = useMemo(() => (data?.lines || []).filter((l) => !l.is_extra), [data]);
  const catalog = useMemo(() => {
    const names = [...(options?.catalog || []).map((c) => c.name), ...(options?.services || []).map((s) => s.sub_service), ...agreed.map((a) => a.service)];
    return [...new Set(names.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }, [options, agreed]);

  if (error) return <div className="ac-page"><Msg error={error} /></div>;
  if (loading || !data) return <PageSkeleton rows={6} />;

  // Cards: each outlet that has agreed services or extras, plus "All outlets" for whole-customer lines.
  // A group based contract is one table: one row per company (its outlet under the name), priced as on the invoice.
  const grp = Boolean(data.billing_group);
  const outletIds = [...new Set([...agreed.map((l) => l.site_id || ALL), ...extras.map((x) => x.site_id)])];
  // Termite only (no services agreed): its extra services are shown in the termite table instead.
  const termiteOnly = !agreed.length && (data.area_lines || []).length > 0;
  // Termite extras: the units the contract is priced in (sq. m / sq. ft) and the rate of each
  const areaUnits = [...new Set((data.area_lines || []).map((a) => a.unit))];
  const unitRate = (unit) => (data.area_lines || []).find((a) => a.unit === unit)?.rate ?? null;
  const cards = termiteOnly ? [] : grp ? [{ id: ALL, name: "Companies in this contract", all: true }] : [
    ...data.outlets.filter((o) => outletIds.includes(o.site_id)).map((o) => ({ id: o.site_id, name: o.name })),
    ...(outletIds.includes(ALL) ? [{ id: ALL, name: data.outlets.length ? "All outlets (whole customer)" : data.customer }] : []),
  ];
  const outletName = (siteId) => (siteId ? data.outlets.find((o) => o.site_id === siteId)?.name || "Outlet" : "All outlets");
  // What the invoice bills for a row: Fixed amount bills the assigned number, Service based the completed number.
  const billOf = (rate, qty) => ({ qty, amount: qty === null || rate === null || rate === undefined ? null : qty * Number(rate) });
  const lineBill = (l, n) => billOf(l.rate, (l.structure || data.structures[0]) === "FIXED" ? l.assigned : n);
  const money = (v) => (v === null || v === undefined ? "—" : rupees(v));
  // Outlets with nothing on this SOS yet (services, extras or Termite area rows): "Extra services at another outlet".
  const freeOutlets = data.outlets.filter((o) => !outletIds.includes(o.site_id) && !(data.area_lines || []).some((a) => a.site_id === o.site_id));
  const num = (v) => (v === "" || v === null || v === undefined ? null : Number(v));
  const totals = {
    assigned: agreed.reduce((t, l) => t + l.assigned, 0),
    completed: agreed.reduce((t, l) => t + (num(editable ? done[l.contract_line_id] : l.completed) || 0), 0),
    extra: (editable ? extras : data.lines.filter((x) => x.is_extra)).reduce((t, x) => t + (Number(x.completed) || 0), 0),
    missing: editable ? agreed.filter((l) => num(done[l.contract_line_id]) === null).length : 0,
  };
  const areaRows = data.area_lines || [];
  const areaOf = (a) => num(editable ? areas[areaKey(a)] : a.area);
  const areasMissing = editable ? areaRows.filter((a) => areaOf(a) === null).length : 0;
  const nothingToReport = !agreed.length && !areaRows.length;
  const rateOf = (siteId, service) => {
    const same = agreed.filter((a) => norm(a.service) === norm(service));
    const hit = same.find((a) => (a.site_id || ALL) === siteId) || same.find((a) => !a.site_id) || same[0];
    return hit ? hit.rate : null;
  };
  const [statusLabel, statusCls] = SOS_STATUS[data.status];

  const setDoneFor = (id, v) => { setDone((d) => ({ ...d, [id]: v })); setDirty(true); };
  const setExtra = (key, patch) => { setExtras((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x))); setDirty(true); };
  // a new extra service goes to the end of the list (first added stays first)
  const addExtra = (siteId) => { setExtras((xs) => [...xs, { key: (extraKey += 1), site_id: siteId, service: "", completed: "1", remarks: "", area: "", unit: (data.area_lines || [])[0]?.unit || "" }]); setDirty(true); };
  // Fill one outlet's services with the assigned numbers.
  const fillLines = (lines) => { setDone((d) => ({ ...d, ...Object.fromEntries(lines.map((l) => [l.contract_line_id, String(l.assigned)])) })); setDirty(true); };

  function payload() {
    return {
      month,
      notes,
      lines: agreed.map((l) => ({ contract_line_id: l.contract_line_id, completed: num(done[l.contract_line_id]), remarks: remarks[l.contract_line_id] || null })),
      // Termite only: an extra is an area (sq. m / sq. ft) at the contract's rate, else a number of services
      extras: extras.filter((x) => x.service.trim()).map((x) => (termiteOnly
        ? { site_id: x.site_id || null, service: x.service.trim(), area: x.area === "" ? null : Number(x.area), unit: x.unit || areaUnits[0] || null, remarks: x.remarks || null }
        : { site_id: x.site_id || null, service: x.service.trim(), completed: Number(x.completed) || 0, remarks: x.remarks || null })),
      areas: areaRows.map((a) => ({ contract_line_id: a.contract_line_id, period_start: a.period_start, area: num(areas[areaKey(a)]), remarks: areaRemarks[areaKey(a)] || null })),
    };
  }

  async function save() {
    setBusy(true);
    setMsg({});
    try {
      await billingPut(`/sos/${encodeURIComponent(companyId)}`, payload());
      setMsg({ ok: "Saved. Submit it when all numbers are in." });
      reload();
    } catch (err) {
      setMsg({ error: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    setBusy(true);
    setMsg({});
    try {
      await billingPost(`/sos/${encodeURIComponent(companyId)}/submit`, payload());
      setConfirm(false);
      setMsg({ ok: "Submitted to Accounts. They have been notified." });
      reload();
    } catch (err) {
      setConfirm(false);
      setMsg({ error: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function reopen() {
    setBusy(true);
    try {
      const r = await billingPost(`/sos/${encodeURIComponent(companyId)}/reopen`, { month, reason });
      setReopening(false);
      setReason("");
      setMsg({ ok: canFill ? `Reopened - correct it and submit again.${r.drafts_removed ? ` ${r.drafts_removed} draft invoice(s) removed.` : ""}` : `Sent back to the Service Coordinator.${r.drafts_removed ? ` ${r.drafts_removed} draft invoice(s) removed.` : ""}` });
      reload();
    } catch (err) {
      setMsg({ error: err.message });
    } finally {
      setBusy(false);
    }
  }

  function changeMonth(m) {
    if (dirty && !window.confirm("You have unsaved changes. Leave without saving?")) return;
    setParams(fromRun ? { month: m, from: "run" } : { month: m });
  }

  return (
    <div className="ac-page sos-page">
      <div className="sos-top">
        <button type="button" className="sos-back" onClick={() => navigate(fromRun ? `${BILLING_HOME}/run?month=${month}` : `${BILLING_HOME}/sos?month=${month}`)}
          aria-label={fromRun ? "Back to Bill Run" : "Back to Monthly SOS"} title={fromRun ? "Bill Run" : "Monthly SOS"}><FiArrowLeft /></button>
        <div className="sos-top-main">
          <h1>{data.billing_group ? data.billing_group.group : data.customer}</h1>
          <div className="bl-meta">
            <span className={`bl-status ${STATUS_TONE[statusCls] || "grey"}`}><span className="bl-status-dot" />{statusLabel}</span>
            {data.structures.map((st) => <span key={st}><FiLayers /> {st === "FIXED" ? "Fixed amount" : "Service based"}</span>)}
            {data.group && <span><FiUsers /> {data.group}</span>}
            {data.bill_by_day && <span><FiCalendar /> Bill by day {data.bill_by_day}</span>}
          </div>
        </div>
        <div className="sos-monthpill">
          <button type="button" onClick={() => changeMonth(shiftMonth(month, -1))} aria-label="Previous month"><FiChevronLeft /></button>
          <b>{monthLabel(month)}</b>
          <button type="button" disabled={month >= thisMonth()} onClick={() => changeMonth(shiftMonth(month, 1))} aria-label="Next month"><FiChevronRight /></button>
        </div>
      </div>

      {agreed.length > 0 && (() => {
        const diff = totals.completed - totals.assigned;
        return (
          <div className="sos-sum">
            <SumCard tone="slate" icon={LuClipboardList} label="Assigned" value={totals.assigned} note="agreed this month" />
            <SumCard tone="green" icon={LuClipboardCheck} label="Completed" value={totals.completed} note={totals.missing ? `${totals.missing} not entered` : "entered"} />
            <SumCard tone="purple" icon={LuListPlus} label="Extra" value={totals.extra} note="beyond the agreement" />
            <SumCard tone={diff < 0 ? "amber" : diff > 0 ? "blue" : "green"} icon={diff < 0 ? LuTrendingDown : diff > 0 ? LuTrendingUp : LuScale}
              label="Variance" value={diff} signed note={diff < 0 ? `${-diff} short of assigned` : diff > 0 ? `${diff} more than assigned` : "matches assigned"} />
          </div>
        );
      })()}

      {data.invoiced?.length > 0 && <div className="ac-info" style={{ marginBottom: 12 }}><span><FiLock /> Invoiced ({data.invoiced.join(", ")}). This SOS is locked.</span></div>}
      {data.status === "SUBMITTED" && !data.invoiced?.length && agreed.some((l) => l.added_later) && (
        <div className="ac-info" style={{ marginBottom: 12 }}>
          <span><FiInfo /> {agreed.filter((l) => l.added_later).map((l) => l.service).join(", ")}: added to the contract after this SOS was submitted, so nothing is entered for it. {canFill ? "Reopen" : "Send back"} the SOS to enter it.</span>
        </div>
      )}
      {data.status === "DRAFT" && data.reopen_reason && (
        <div className="ac-info error" style={{ marginBottom: 12 }}><span><FiRotateCcw /> Sent back by <b>{data.reopened_by}</b> on {when(data.reopened_at)}: “{data.reopen_reason}”</span></div>
      )}
      {/* Nothing to report this month. A Termite contract: say which month's SOS takes its treated area. */}
      {!data.has_agreement && (data.termite_next?.length ? (
        <div className="ac-info" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ flex: "1 1 260px" }}>
            Nothing to enter for {monthLabel(month)}.{" "}
            {data.termite_next.map((t) => `Termite ${t.contract_code}: the treated area for ${dmy(t.period_start)} to ${dmy(t.period_end)} is entered on the ${monthLabel(`${t.month}-01`)} SOS${t.month > thisMonth() ? " (open it once that month starts)" : ""}.`).join(" ")}
          </span>
          {data.termite_next[0].month !== month.slice(0, 7) && data.termite_next[0].month <= thisMonth() && (
            <button type="button" className="ac-btn sm" onClick={() => changeMonth(data.termite_next[0].month)}>Open {monthLabel(`${data.termite_next[0].month}-01`)}</button>
          )}
        </div>
      ) : (
        <div className="ac-info error" style={{ marginBottom: 12 }}><span>This customer has no services billed per service for {monthLabel(month)} in its billing profile.</span></div>
      ))}

      {/* Termite: the treated area completed in each billing period (week / day / month) this month bills,
          laid out like the services table. Accounts bill each period: area × the contract's rate. */}
      {areaRows.length > 0 && (() => {
        const rowsOut = areaRows.map((a) => {
          const n = areaOf(a);
          return { a, n, amt: n === null || a.rate === null ? null : n * a.rate };
        });
        const entered = rowsOut.filter((r) => r.n !== null);
        // + extra area added on the SOS (area x the contract's rate for its unit)
        const extraAmt = termiteOnly ? (editable ? extras : data.lines.filter((x) => x.is_extra)).reduce((t, x) => {
          const r = editable ? unitRate(x.unit || areaUnits[0]) : x.rate;
          return t + (x.area === "" || x.area === null || x.area === undefined || r === null || r === undefined ? 0 : Number(x.area) * r);
        }, 0) : 0;
        const toBill = entered.reduce((t, r) => t + (r.amt || 0), 0) + extraAmt;
        return (
          <>
            {!agreed.length && (
              // drawn again once the saved areas are loaded, so loading does not show as a change (+1 / -1)
              <div className="sos-sum" key={Object.keys(areas).length === areaRows.length ? "ready" : "loading"}>
                <SumCard tone="slate" icon={LuClipboardList} label="Areas to enter" value={areaRows.length} note={`period${areaRows.length === 1 ? "" : "s"} this month`} />
                <SumCard tone="green" icon={LuClipboardCheck} label="Entered" value={entered.length} note={entered.length === areaRows.length ? "all entered" : `${areaRows.length - entered.length} not entered`} />
                <SumCard tone={entered.length === areaRows.length ? "green" : "amber"} icon={LuScale} label="Not entered" value={areaRows.length - entered.length} note={entered.length === areaRows.length ? "ready to submit" : "enter the treated area"} />
                <SumCard tone="purple" icon={LuListPlus} label="To bill (₹)" value={Math.round(toBill)} note="area × rate, before GST" />
              </div>
            )}
            <div className="sos-card priced">
              <div className="sos-card-head">
                <h3>{data.billing_group ? data.billing_group.group : data.customer}</h3>
                <span className="ac-sub">{areaRows.length} item{areaRows.length === 1 ? "" : "s"}</span>
                <span className="sos-card-right">
                  <span className="sos-bill-note">Termite: area completed × rate is billed</span>
                  {editable && termiteOnly && <button type="button" className="ac-btn sos-addbtn" onClick={() => addExtra(areaRows[0].site_id || ALL)}><FiPlusCircle /> Add extra service</button>}
                </span>
              </div>
              <div className="sos-list">
                <div className="sos-item sos-thead"><span>Item</span><span>Assigned</span><span>Area completed</span><span>Status</span><span className="sos-money">Rate</span><span className="sos-money">Billed</span><span className="sos-money">Amount</span><span /></div>
                {rowsOut.map(({ a, n, amt }) => {
                  const k = areaKey(a);
                  const id = `a${k}`;
                  const remark = editable ? areaRemarks[k] : a.remarks;
                  const remarkOpen = openRemarks.has(id);
                  const u = unitLabel(a.unit);
                  return (
                    <div key={k} className="sos-item">
                      <div className="sos-item-main">
                        <b title={`${periodLabel(a.period_start, a.period_end)}${a.site ? ` · ${a.site}` : ""}`}>{a.service}</b>
                        {!remarkOpen && remark && <span className="sos-item-sub"><span className="sos-remark">“{remark}”</span></span>}
                        {remarkOpen && editable && (
                          <input className="sos-remarkinput" autoFocus value={areaRemarks[k] || ""} placeholder="Add a remark (optional)"
                            onChange={(e) => { setAreaRemarks((r) => ({ ...r, [k]: e.target.value })); setDirty(true); }} onBlur={() => toggleRemark(id, false)} aria-label="Remarks" />
                        )}
                      </div>
                      <span className="sos-num muted">—</span>
                      {editable ? (
                        <span className="sos-area">
                          <input type="number" min="0" step="0.01" className="ac-input" value={areas[k] ?? ""} placeholder="0"
                            onChange={(e) => { setAreas((st) => ({ ...st, [k]: e.target.value })); setDirty(true); }} aria-label={`Area completed for ${a.service}, ${periodLabel(a.period_start, a.period_end)}`} />
                          <span>{u}</span>
                        </span>
                      ) : (
                        <span className="sos-num">{n === null ? "—" : `${n} ${u}`}</span>
                      )}
                      <span className={`sos-state ${n === null ? "grey" : "green"}`}>{n === null ? <><FiMinusCircle /> Not entered</> : <><FiCheckCircle /> Done</>}</span>
                      <span className="sos-money">{a.rate === null ? <span className="sos-muted">—</span> : <>{money(a.rate)}<span className="sos-muted"> /{u}</span></>}</span>
                      <span className="sos-money">{n === null ? <span className="sos-muted">—</span> : n}</span>
                      <span className="sos-money">{amt === null ? <span className="sos-muted">—</span> : <b>{money(amt)}</b>}</span>
                      <span className="sos-acts">
                        {editable && <button type="button" className={`sos-iconbtn ${remark ? "on" : ""}`} onMouseDown={(e) => e.preventDefault()} onClick={() => toggleRemark(id)} title="Remark" aria-label="Remark"><FiMessageSquare /></button>}
                      </span>
                    </div>
                  );
                })}
                {termiteOnly && (editable ? extras : data.lines.filter((x) => x.is_extra)).map((x) => {
                  const id = `x${x.key || `${x.service}-${x.site_id}`}`;
                  const unit = x.unit || areaUnits[0] || "";
                  const rate = editable ? unitRate(unit) : x.rate;
                  const remarkOpen = openRemarks.has(id);
                  const xa = x.area === "" || x.area === null || x.area === undefined ? null : Number(x.area);
                  const xb = billOf(rate, xa);
                  return (
                    <div key={id} className="sos-item extra">
                      <div className="sos-item-main">
                        {editable ? (
                          <ComboInput className="sos-combo" value={x.service} options={catalog} autoFocus={!x.service} placeholder="Choose or type the service" onChange={(v) => setExtra(x.key, { service: v })} label="Extra service" />
                        ) : <b>{x.service}</b>}
                        <span className="sos-item-sub">
                          <span className="sos-extra-lbl">Extra</span>
                          {!remarkOpen && x.remarks && <span className="sos-remark">“{x.remarks}”</span>}
                        </span>
                        {remarkOpen && editable && (
                          <input className="sos-remarkinput" autoFocus value={x.remarks} placeholder="Why was it done? (optional)" onChange={(e) => setExtra(x.key, { remarks: e.target.value })} onBlur={() => toggleRemark(id, false)} aria-label="Remarks" />
                        )}
                      </div>
                      {/* the unit: sq. m or sq. ft, as priced on the customer's contract */}
                      {editable ? (
                        <select className="ac-select sos-unitsel" value={unit} onChange={(e) => setExtra(x.key, { unit: e.target.value })} aria-label="Unit">
                          {areaUnits.map((un) => <option key={un} value={un}>{unitLabel(un)}</option>)}
                        </select>
                      ) : <span className="sos-num muted">{unitLabel(unit)}</span>}
                      {editable ? (
                        <span className="sos-area">
                          <input type="number" min="0" step="0.01" className="ac-input" value={x.area ?? ""} placeholder="0" onChange={(e) => setExtra(x.key, { area: e.target.value })} aria-label={`Extra area for ${x.service || "service"}`} />
                          <span>{unitLabel(unit)}</span>
                        </span>
                      ) : <span className="sos-num">{xa === null ? "—" : `${xa} ${unitLabel(unit)}`}</span>}
                      <span className="sos-state purple"><FiPlusCircle /> Extra</span>
                      <span className="sos-money">{rate === null || rate === undefined ? <span className="sos-muted">—</span> : <>{money(rate)}<span className="sos-muted"> /{unitLabel(unit)}</span></>}</span>
                      <span className="sos-money">{xa ?? <span className="sos-muted">—</span>}</span>
                      <span className="sos-money">{xb.amount === null ? <span className="sos-muted">—</span> : <b>{money(xb.amount)}</b>}</span>
                      <span className="sos-acts">
                        {editable && <button type="button" className={`sos-iconbtn ${x.remarks ? "on" : ""}`} onMouseDown={(e) => e.preventDefault()} onClick={() => toggleRemark(id)} title="Remark" aria-label="Remark"><FiMessageSquare /></button>}
                        {editable && <button type="button" className="sos-iconbtn red" onClick={() => { setExtras((xs) => xs.filter((y) => y.key !== x.key)); setDirty(true); }} title="Remove" aria-label="Remove extra"><FiX /></button>}
                      </span>
                    </div>
                  );
                })}
                <div className="sos-item sos-grp-tot">
                  <span className="sos-grp-totlbl">
                    Total to bill
                    <span className="sos-grp-calc">{entered.length ? <>{entered.length} of {areaRows.length} entered · <b>{money(toBill)}</b></> : "Nothing entered yet"}</span>
                  </span>
                  <span className="sos-num muted">—</span>
                  <span className="sos-num">{entered.length ? `${entered.length} / ${areaRows.length}` : <span className="sos-muted">—</span>}</span>
                  <span className="sos-grp-note">{entered.length === areaRows.length ? "Area × rate billed" : "Enter every area"}</span>
                  <span />
                  <span />
                  <span className="sos-money"><b>{money(toBill)}</b></span>
                  <span />
                </div>
              </div>
            </div>
          </>
        );
      })()}

      {cards.map((card) => {
        const lines = card.all ? agreed : agreed.filter((l) => (l.site_id || ALL) === card.id);
        const cardExtras = editable
          ? extras.filter((x) => card.all || x.site_id === card.id)
          : data.lines.filter((x) => x.is_extra && (card.all || (x.site_id || ALL) === card.id));
        const a = lines.reduce((t, l) => t + l.assigned, 0);
        const c = lines.reduce((t, l) => t + (num(editable ? done[l.contract_line_id] : l.completed) || 0), 0);
        const canFillCard = editable && lines.some((l) => num(done[l.contract_line_id]) !== l.assigned);
        // what will be billed from this table (as on the invoice)
        const doneOf = (l) => num(editable ? done[l.contract_line_id] : l.completed);
        const bills = [
          ...lines.map((l) => lineBill(l, doneOf(l))),
          ...cardExtras.map((x) => billOf(editable ? rateOf(x.site_id, x.service) : x.rate, Number(x.completed) || 0)),
        ];
        const billQty = bills.reduce((t, b) => t + (b.qty || 0), 0);
        // rows without a rate yet (an extra priced by Accounts) are left out of the amount and flagged
        const billAmt = bills.reduce((t, b) => t + (b.amount || 0), 0);
        const unpriced = bills.filter((b) => b.amount === null && b.qty).length;
        const fixedCard = (lines[0]?.structure || data.structures[0]) === "FIXED";
        // Service based: the amount when every assigned service is done
        const fullAmt = lines.reduce((t, l) => t + (l.rate === null || l.rate === undefined ? 0 : l.assigned * Number(l.rate)), 0)
          + bills.slice(lines.length).reduce((t, b) => t + (b.amount || 0), 0);
        const anyEntered = lines.some((l) => doneOf(l) !== null);
        return (
          <div key={card.id || "all"} className={`sos-card priced${grp ? " grp" : ""}`}>
            <div className="sos-card-head">
              <h3>{card.name}</h3>
              <span className="ac-sub">{grp ? `${lines.length} outlet${lines.length === 1 ? "" : "s"}` : `${lines.length} service${lines.length === 1 ? "" : "s"}`}</span>
              {(cards.length > 1 || grp) && lines.length > 0 && <span className={c < a ? "sos-amber" : "sos-green"}><b>{c}</b> / {a}</span>}
              <span className="sos-card-right">
                {lines.length > 0 && <span className="sos-bill-note">{fixedCard ? "Fixed amount: assigned services are billed" : "Service based: completed services are billed"}</span>}
                {canFillCard && <button type="button" className="bl-link" onClick={() => fillLines(lines)}><FiClipboard /> Fill as assigned</button>}
                {editable && <button type="button" className="ac-btn sos-addbtn" onClick={() => addExtra(card.id)}><FiPlusCircle /> Add extra service</button>}
              </span>
            </div>

            <div className="sos-list">
              {(lines.length > 0 || cardExtras.length > 0) && (
                <div className="sos-item sos-thead"><span>{grp ? "Company · outlet" : "Service"}</span><span>Assigned</span><span>Completed</span><span>Status</span><span className="sos-money">Rate</span><span className="sos-money">Billed</span><span className="sos-money">Amount</span><span /></div>
              )}
              {/* agreed services first, then the extra services in the order they were added */}
              {lines.map((l) => {
                const id = `l${l.contract_line_id}`;
                const v = editable ? done[l.contract_line_id] : l.completed;
                const n = num(v);
                const remark = editable ? remarks[l.contract_line_id] : l.remarks;
                const remarkOpen = openRemarks.has(id);
                const st = n === null ? ["grey", FiMinusCircle, "Not entered"] : n < l.assigned ? ["amber", FiAlertTriangle, `${l.assigned - n} short`] : n > l.assigned ? ["blue", FiArrowUp, `${n - l.assigned} more`] : ["green", FiCheckCircle, "Done"];
                const StIcon = st[1];
                const lb = lineBill(l, n);
                return (
                  <div key={id} className="sos-item">
                    <div className="sos-item-main">
                      <b>{l.service}</b>
                      <span className="sos-item-sub">
                        {grp && <span>{l.site || "All outlets"}</span>}
                        <span className="sos-grp-calc">{lb.qty === null ? <>{l.assigned} assigned · {money(l.rate)} each</> : <>{lb.qty} × {money(l.rate)} = <b>{money(lb.amount)}</b></>}</span>
                        {!remarkOpen && remark && <span className="sos-remark">“{remark}”</span>}
                      </span>
                      {remarkOpen && editable && (
                        <input className="sos-remarkinput" autoFocus value={remarks[l.contract_line_id] || ""} placeholder="Add a remark (optional)"
                          onChange={(e) => { setRemarks((r) => ({ ...r, [l.contract_line_id]: e.target.value })); setDirty(true); }} onBlur={() => toggleRemark(id, false)} aria-label="Remarks" />
                      )}
                    </div>
                    <span className="sos-num">{l.assigned}</span>
                    <Counter editable={editable} value={v} min={0} onChange={(val) => setDoneFor(l.contract_line_id, val)} label={`Completed ${l.service}`} />
                    <span className={`sos-state ${st[0]}`}><StIcon /> {st[2]}</span>
                    <span className="sos-money">{money(l.rate)}</span>
                    <span className="sos-money">{lb.qty ?? <span className="sos-muted">—</span>}</span>
                    <span className="sos-money">{lb.amount === null ? <span className="sos-muted">—</span> : <b>{money(lb.amount)}</b>}</span>
                    <span className="sos-acts">
                      {editable && <button type="button" className={`sos-iconbtn ${remark ? "on" : ""}`} onMouseDown={(e) => e.preventDefault()} onClick={() => toggleRemark(id)} title="Remark" aria-label="Remark"><FiMessageSquare /></button>}
                    </span>
                  </div>
                );
              })}
              {cardExtras.map((x) => {
                const id = `x${x.key || `${x.service}-${x.site_id}`}`;
                const rate = editable ? rateOf(x.site_id, x.service) : x.rate;
                const remarkOpen = openRemarks.has(id);
                const xb = billOf(rate, Number(x.completed) || 0);
                return (
                  <div key={id} className="sos-item extra">
                    <div className="sos-item-main">
                      {editable ? (
                        <ComboInput className="sos-combo" value={x.service} options={catalog} autoFocus={!x.service} placeholder="Choose or type the service" onChange={(v) => setExtra(x.key, { service: v })} label="Extra service" />
                      ) : <b>{x.service}</b>}
                      <span className="sos-item-sub">
                        <span className="sos-extra-lbl">Extra</span>
                        {grp && <span>{outletName(x.site_id)}</span>}
                        {(x.service || !editable) && <span className="sos-grp-calc">{rate !== null && rate !== undefined ? <>{xb.qty} × {money(rate)} = <b>{money(xb.amount)}</b></> : "Rate set by Accounts"}</span>}
                        {!remarkOpen && x.remarks && <span className="sos-remark">“{x.remarks}”</span>}
                      </span>
                      {remarkOpen && editable && (
                        <input className="sos-remarkinput" autoFocus value={x.remarks} placeholder="Why was it done? (optional)" onChange={(e) => setExtra(x.key, { remarks: e.target.value })} onBlur={() => toggleRemark(id, false)} aria-label="Remarks" />
                      )}
                    </div>
                    <span className="sos-num muted">—</span>
                    <Counter editable={editable} value={x.completed} min={1}
                      onChange={(v) => setExtra(x.key, { completed: v })} label={`Extra ${x.service || "service"} done`} />
                    <span className="sos-state purple"><FiPlusCircle /> Extra</span>
                    <span className="sos-money">{rate !== null && rate !== undefined ? rupees(rate) : <span className="ac-sub">By Accounts</span>}</span><span className="sos-money">{xb.qty}</span><span className="sos-money">{xb.amount === null ? <span className="sos-muted">—</span> : <b>{money(xb.amount)}</b>}</span>
                    <span className="sos-acts">
                      {editable && <button type="button" className={`sos-iconbtn ${x.remarks ? "on" : ""}`} onMouseDown={(e) => e.preventDefault()} onClick={() => toggleRemark(id)} title="Remark" aria-label="Remark"><FiMessageSquare /></button>}
                      {editable && <button type="button" className="sos-iconbtn red" onClick={() => { setExtras((xs) => xs.filter((y) => y.key !== x.key)); setDirty(true); }} title="Remove" aria-label="Remove extra"><FiX /></button>}
                    </span>
                  </div>
                );
              })}

              {(lines.length > 0 || cardExtras.length > 0) && (() => {
                const note = fixedCard ? "Fixed: assigned billed" : anyEntered ? "Completed billed" : "Nothing entered yet";
                const ifAll = !fixedCard && fullAmt > billAmt ? `if all done ${money(fullAmt)}` : "";
                return (
                  <div className="sos-item sos-grp-tot">
                    <span className="sos-grp-totlbl">
                      Total to bill
                      <span className="sos-grp-calc">
                        {anyEntered || fixedCard ? <>{billQty} service{billQty === 1 ? "" : "s"} · <b>{money(billAmt)}</b></> : note}
                        {ifAll ? ` · ${ifAll}` : ""}{unpriced > 0 ? ` + ${unpriced} extra, rate by Accounts` : ""}
                      </span>
                    </span>
                    <span className="sos-num">{a}</span>
                    <span className="sos-num">{anyEntered ? c : <span className="sos-muted">—</span>}</span>
                    <span className="sos-grp-note">{note}</span>
                    <span />
                    <span className="sos-money"><b>{billQty}</b></span>
                    <span className="sos-money">
                      <b>{money(billAmt)}</b>
                      {ifAll && <span className="sos-grp-ifall">{ifAll}</span>}
                      {unpriced > 0 && <span className="sos-grp-pending">+ {unpriced} extra, rate by Accounts</span>}
                    </span>
                    <span />
                  </div>
                );
              })()}
              {!lines.length && !cardExtras.length && <div className="sos-empty">{grp ? "No companies here yet." : "No services here yet."}</div>}
            </div>
          </div>
        );
      })}

      {editable && freeOutlets.length > 0 && (
        <div className="sos-addoutlet">
          <span className="ac-sub">Extra services at another outlet:</span>
          {freeOutlets.map((o) => <button key={o.site_id} type="button" className="sos-addbtn" onClick={() => addExtra(o.site_id)}><FiPlus /> {o.name}</button>)}
        </div>
      )}

      {editable ? (
        noteOpen || notes ? (
          <div className="sos-note">
            <label htmlFor="sos-notes"><FiMessageSquare /> Note for Accounts</label>
            <textarea id="sos-notes" className="ac-textarea" rows={2} autoFocus={noteOpen && !notes} value={notes} maxLength={1000} placeholder="Anything Accounts should know" onChange={(e) => { setNotes(e.target.value); setDirty(true); }} />
          </div>
        ) : (
          <button type="button" className="sos-addx sos-addnote" onClick={() => setNoteOpen(true)}><FiMessageSquare /> Add a note for Accounts</button>
        )
      ) : data.notes ? (
        <div className="sos-note"><label><FiMessageSquare /> Note for Accounts</label><div className="ac-sub">{data.notes}</div></div>
      ) : null}

      <Msg {...msg} />

      <div className="sos-foot">
        <div className="sos-foot-msg">
          {data.invoiced?.length ? (
            <span className="sos-state grey"><FiLock /> Invoiced - locked</span>
          ) : data.status === "SUBMITTED" ? (
            <span className="sos-state green"><FiCheckCircle /> Submitted by {data.submitted_by} on {when(data.submitted_at)}</span>
          ) : !editable ? (
            <span className="sos-state grey"><FiClock /> Waiting for the Service Coordinator</span>
          ) : nothingToReport ? (
            <span className="sos-state grey"><FiInfo /> No agreed services to report</span>
          ) : totals.missing > 0 ? (
            <span className="sos-state amber"><FiAlertTriangle /> {totals.missing} service{totals.missing === 1 ? "" : "s"} not entered</span>
          ) : areasMissing > 0 ? (
            <span className="sos-state amber"><FiAlertTriangle /> Termite area not entered for {areasMissing} period{areasMissing === 1 ? "" : "s"}</span>
          ) : !agreed.length ? (
            <span className="sos-state green"><FiCheckCircle /> Termite area entered - ready to submit</span>
          ) : (
            <span className="sos-state green"><FiCheckCircle /> All services entered - ready to submit{totals.extra > 0 ? ` · ${totals.extra} extra` : ""}</span>
          )}
        </div>
        <div className="ac-actions">
          {editable && <button type="button" className="ac-btn" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save draft"}</button>}
          {editable && <button type="button" className="ac-btn ac-btn-primary" disabled={busy || totals.missing > 0 || areasMissing > 0 || nothingToReport} onClick={() => setConfirm(true)}><FiSend /> Submit to Accounts</button>}
          {data.status === "SUBMITTED" && !data.invoiced?.length && canFill && <button type="button" className="ac-btn" onClick={() => setReopening(true)}><FiRotateCcw /> Reopen to correct</button>}
          {data.status === "SUBMITTED" && !data.invoiced?.length && !canFill && canSendBack && <button type="button" className="ac-btn" onClick={() => setReopening(true)}><FiRotateCcw /> Send back</button>}
        </div>
      </div>

      {confirm && (
        <Modal onClose={() => !busy && setConfirm(false)} narrow label="Submit SOS">
          <div className="bl-m-head"><div><h3>Submit {monthLabel(month)} SOS?</h3><div className="ac-sub">{data.customer}</div></div><button type="button" className="bl-x" onClick={() => setConfirm(false)} aria-label="Close">✕</button></div>
          <div className="bl-m-body">
            {agreed.length > 0 && <div className="bl-chk"><span className="bl-dot" /><span><b>{totals.completed}</b> of <b>{totals.assigned}</b> assigned services completed</span></div>}
            {areaRows.length > 0 && <div className="bl-chk"><span className="bl-dot" /><span>Termite area completed for <b>{areaRows.length}</b> period{areaRows.length === 1 ? "" : "s"}, billed area × rate</span></div>}
            {totals.extra > 0 && <div className="bl-chk"><span className="bl-dot a" /><span><b>{totals.extra}</b> extra service(s), billed on top</span></div>}
            <div className="ac-sub">Accounts are notified and bill from these numbers. After submitting, reopen it to make a change.</div>
          </div>
          <div className="bl-m-foot"><span /><div className="ac-actions"><button type="button" className="ac-btn" disabled={busy} onClick={() => setConfirm(false)}>Cancel</button><button type="button" className="ac-btn ac-btn-primary" disabled={busy} onClick={submit}>{busy ? "Submitting…" : "Submit"}</button></div></div>
        </Modal>
      )}

      {reopening && (
        <Modal onClose={() => !busy && setReopening(false)} narrow label="Reopen SOS">
          <div className="bl-m-head"><div><h3>{canFill ? "Reopen to correct?" : "Send back to the Service Coordinator?"}</h3><div className="ac-sub">{data.customer} · {monthLabel(month)}</div></div><button type="button" className="bl-x" onClick={() => setReopening(false)} aria-label="Close">✕</button></div>
          <div className="bl-m-body">
            <div className="ac-sub">Any draft invoice made from this SOS is removed; the Bill Run makes it again once the SOS is submitted.</div>
            <textarea className="ac-textarea" rows={3} autoFocus value={reason} maxLength={500} placeholder={canFill ? "What is being corrected?" : "What needs correcting?"} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="bl-m-foot"><span /><div className="ac-actions"><button type="button" className="ac-btn" disabled={busy} onClick={() => setReopening(false)}>Cancel</button><button type="button" className="ac-btn ac-btn-primary" disabled={busy || !reason.trim()} onClick={reopen}>{busy ? "Working…" : canFill ? "Reopen" : "Send back"}</button></div></div>
        </Modal>
      )}
    </div>
  );
}

/** Big rounded − n + counter (read-only: just the number). */
function Counter({ editable, value, min, onChange, label }) {
  const n = value === "" || value === null || value === undefined ? null : Number(value);
  if (!editable) return <span className="sos-step ro">{n ?? "—"}</span>;
  const set = (v) => onChange(String(Math.min(999, Math.max(min, v))));
  return (
    <span className="sos-step">
      <button type="button" onClick={() => set((n ?? min) - 1)} disabled={n !== null && n <= min} aria-label="One less"><FiMinus /></button>
      <input type="number" min={min} max="999" value={value ?? ""} placeholder="—" onChange={(e) => onChange(e.target.value)} aria-label={label} />
      <button type="button" onClick={() => set((n ?? min - 1) + 1)} aria-label="One more"><FiPlus /></button>
    </span>
  );
}


/**
 * Summary figure: tinted icon, label, number, note. The number counts up when the page opens;
 * after that each change pops the number and floats a "+1" / "-1" up from it.
 */
let bubbleId = 0;
function SumCard({ tone, icon, label, value, note, signed }) {
  const Icon = icon;
  const [shown, setShown] = useState(value);
  const [changed, setChanged] = useState(false);
  const [bubbles, setBubbles] = useState([]);
  if (shown !== value) {
    const d = value - shown;
    setShown(value);
    setChanged(true);
    setBubbles((b) => [...b.slice(-3), { id: (bubbleId += 1), text: d > 0 ? `+${d}` : String(d), up: d > 0 }]);
  }
  const text = signed && value > 0 ? `+${value}` : String(value);
  return (
    <div className={`sos-sumcard ${tone}`}>
      <span key={tone} className="sos-sum-ic flip"><Icon /></span>
      <div className="sos-sum-body">
        <span className="sos-sum-lbl">{label}</span>
        <span className="sos-sum-val">
          <b key={changed ? value : "first"} className={changed ? "pop" : ""}>{changed ? text : <CountUp value={text} />}</b>
          {bubbles.map((x) => (
            <span key={x.id} className={`sos-bubble ${x.up ? "up" : "down"}`} onAnimationEnd={() => setBubbles((b) => b.filter((y) => y.id !== x.id))}>{x.text}</span>
          ))}
        </span>
        <small>{note}</small>
      </div>
    </div>
  );
}

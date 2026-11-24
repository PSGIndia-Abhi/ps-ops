import { useMemo, useState } from "react";
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { FiAlertTriangle, FiCalendar, FiChevronLeft, FiChevronRight, FiEdit3, FiPlayCircle, FiSearch, FiTrendingUp } from "react-icons/fi";
import { EmptyRow } from "../accountant/ui";
import { billingPost, qs, useBilling, useCustomerOptions } from "./billingApi";
import { CATEGORY_LABEL, amount, monthLabel, periodLabel, rupeesShort, thisMonth, today } from "./format";
import { Kpi, Modal, Msg, ServicesChip, TypeBadge, MonthPicker } from "./ui";
import useDebounced from "./useDebounced";
import CustomerFilter from "./CustomerFilter";

// Bill Run: contracts due in the month, with their services and warnings. Select and generate
// drafts; drafts are checked and issued from Draft Invoices. When nothing was skipped and no
// quantities are needed, it goes straight to the draft (one) or to Draft Invoices (several).

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Days in a "YYYY-MM" month. */
const daysIn = (m) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).getUTCDate();
/** "YYYY-MM-DD" moved by n days. */
const shiftDay = (d, n) => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
/** "2026-11-25" -> "25 Nov 2026". */
const dateLabel = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

export default function BillRun() {
  const { me } = useOutletContext();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Three views:
  //   Date (default, today)  the contracts due in that date's month whose Bill date is that day, plus
//                          every bill that missed an earlier Bill date (shown first, "Missed · n days late")
  //   Whole month            every contract due in the month (?month=YYYY-MM&view=month)
  //   All months             every active contract's next bill (?month=ALL)
  // Coming back from an SOS opened here keeps the view (?date= / ?month=).
  const [view, setView] = useState(() => {
    if (DATE_RE.test(params.get("date") || "")) return "date";
    if (params.get("month") === "ALL") return "all";
    return params.get("view") === "month" && /^\d{4}-\d{2}$/.test(params.get("month") || "") ? "month" : "date";
  });
  const [date, setDate] = useState(() => (DATE_RE.test(params.get("date") || "") ? params.get("date") : today()));
  const [pickedMonth, setPickedMonth] = useState(() => (/^\d{4}-\d{2}$/.test(params.get("month") || "") ? params.get("month") : thisMonth()));
  // All months: every active contract's next bill, each with the month it is billed in. Only bills due
  // by this month can be ticked; they are generated in this month's run.
  const allMonths = view === "all";
  const dateView = view === "date";
  const month = allMonths ? "ALL" : dateView ? date.slice(0, 7) : pickedMonth;
  // Up to the end of next month: a period is billed after it ends (November services, day 10 -> 10 Dec).
  const nextMonthStr = (() => {
    const d = new Date(Date.UTC(Number(thisMonth().slice(0, 4)), Number(thisMonth().slice(5, 7)), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  })();
  const maxDate = `${nextMonthStr}-${String(daysIn(nextMonthStr)).padStart(2, "0")}`;
  const setMonth = (m) => { setPickedMonth(m); setView("month"); };
  const changeView = (v) => {
    if (v === view) return;
    // Date view from a month: today in the current month, else the 1st of the month shown.
    if (v === "date" && !allMonths) setDate(pickedMonth === thisMonth() ? today() : `${pickedMonth}-01`);
    if (v === "month" && dateView) setPickedMonth(date.slice(0, 7));
    setView(v);
    setPicked(null);
  };
  const [type, setType] = useState("");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const q = useDebounced(search);
  const { data, error, loading, reload } = useBilling(`/due${qs({ month, type, category, q })}`);
  const [picked, setPicked] = useState(null); // null = nothing ticked yet (contracts are ticked by hand)
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [warnRow, setWarnRow] = useState(null); // the row whose warnings are open
  const [runError, setRunError] = useState("");

  const customerOptions = useCustomerOptions();
  const [customers, setCustomers] = useState([]); // customer filter: [] = all
  // Date view: contracts billed on that day, plus every bill that missed an earlier Bill date (carried
  // forward until it is made). A Bill date past the month's end (e.g. 31 in November) is its last day
  // (bill_date, from the server); contracts without a Bill date show in Whole month only.
  const [onlyMissed, setOnlyMissed] = useState(false);
  const byCustomer = useMemo(() => (data?.rows || [])
    .filter((r) => !dateView || (r.bill_date && (r.bill_date === date || (r.missed_days > 0 && r.bill_date < date))))
    .filter((r) => !customers.length || customers.includes(r.company_id) || (r.billing_group?.companies || []).some((c) => customers.includes(c.company_id))), [data, customers, dateView, date]);
  // A contract whose draft is made leaves the list (it is in Draft Invoices); the card counts them.
  // Missed bills first (the longest overdue on top), then the rest in the server's order.
  const open = byCustomer.filter((r) => !r.already_drafted);
  const missed = open.filter((r) => r.missed_days > 0);
  const oldestMissed = missed.reduce((t, r) => Math.max(t, r.missed_days), 0);
  const showOnlyMissed = onlyMissed && missed.length > 0; // nothing missed any more: back to everything
  const rows = (showOnlyMissed ? missed : open).map((r, i) => [r, i]).sort(([a, i], [b, j]) => (b.missed_days || 0) - (a.missed_days || 0) || i - j).map(([r]) => r);
  const selectable = (r) => !r.blocking && !r.already_drafted && r.due_now !== false;
  const runMonth = allMonths ? data?.this_month || thisMonth() : month; // the month the drafts are made in
  // Nothing is ticked by default: Accounts tick each contract (or "select all") themselves.
  const selected = picked ?? new Set();
  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };
  const allSelectable = rows.filter(selectable);
  const allOn = allSelectable.length > 0 && allSelectable.every((r) => selected.has(r.contract_id));
  // The cards follow the customer filter.
  const s = data ? {
    due: open.length,
    ready: open.filter((r) => !r.warnings.length && !r.already_drafted).length,
    missed: missed.length,
    already_drafted: byCustomer.filter((r) => r.already_drafted).length,
    estimated_total: open.reduce((t, r) => t + (r.estimated_total || 0), 0),
  } : null;
  const lateText = (n) => `${n} day${n === 1 ? "" : "s"} late`;
  const canGenerate = me.can("GENERATE_INVOICE");
  const todayStr = today();
  // An SOS opened from here returns to the same view (SosEntry's back arrow).
  const backQuery = dateView ? `&rundate=${date}` : allMonths ? "&runmonth=ALL" : `&runmonth=${pickedMonth}`;

  async function generate() {
    // An extra SOS service without a rate: enter it first on the Before generating page (laid out like
    // the draft), which then generates every selected contract.
    if (rows.some((r) => selected.has(r.contract_id) && r.extras_no_rate?.length)) {
      navigate(`/billing/run/generate${qs({ month: runMonth, ids: [...selected].join(",") })}`);
      return;
    }
    setBusy(true);
    setRunError("");
    try {
      const r = await billingPost("/runs", { month: runMonth, contract_ids: [...selected] });
      // Nothing to look at (nothing skipped, no quantities to fill in): go straight on - to the
      // draft itself when there is one, otherwise to Draft Invoices. Otherwise show the result.
      const clean = r.drafts.length > 0 && !r.skipped.length && !r.drafts.some((d) => d.needs_input);
      if (clean) {
        navigate(r.drafts.length === 1 ? `/billing/drafts/${r.drafts[0].id}` : "/billing/drafts");
        return;
      }
      setResult(r);
      setPicked(null);
      reload();
    } catch (err) {
      setRunError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ac-page">
      <div className="ac-head">
        <div>
          <h1 className="ac-title">Bill Run</h1>
        </div>
        <div className="ac-actions">
          <div className="bl-seg2" role="group" aria-label="View">
            <button type="button" className={allMonths ? "active" : ""} aria-pressed={allMonths} onClick={() => changeView("all")} title="See every contract's next bill">All months</button>
            <button type="button" className={dateView ? "active" : ""} aria-pressed={dateView} onClick={() => changeView("date")} title="Contracts whose Bill date is the chosen day">Date</button>
            <button type="button" className={view === "month" ? "active" : ""} aria-pressed={view === "month"} onClick={() => changeView("month")} title="Every contract due in the month">Whole month</button>
          </div>
          {dateView ? (
            <div className="bl-monthnav">
              <button type="button" className="bl-monthnav-btn" onClick={() => { setDate(shiftDay(date, -1)); setPicked(null); }} aria-label="Previous day" title="Previous day"><FiChevronLeft /></button>
              <input type="date" className="ac-input" style={{ width: 170 }} value={date} max={maxDate}
                onChange={(e) => { if (DATE_RE.test(e.target.value)) { setDate(e.target.value); setPicked(null); } }} aria-label="Date" />
              <button type="button" className="bl-monthnav-btn" disabled={date >= maxDate} onClick={() => { setDate(shiftDay(date, 1)); setPicked(null); }} aria-label="Next day" title="Next day"><FiChevronRight /></button>
            </div>
          ) : (
            <MonthPicker value={allMonths ? "" : pickedMonth} allowEmpty fallback={thisMonth()} onChange={(m) => { setMonth(m || thisMonth()); setPicked(null); }} />
          )}
          {canGenerate && (
            <button type="button" className="ac-btn ac-btn-primary" disabled={busy || !selected.size} onClick={generate}>
              {busy ? "Generating…" : `Generate drafts (${selected.size} selected)`}
            </button>
          )}
        </div>
      </div>
      <Msg error={runError} />

      <div className="ac-kpis bl-kpis-5">
        <Kpi color="blue" label={dateView ? "Due on this date" : "Due this month"} icon={FiCalendar} value={s?.due ?? "—"} note={dateView ? `bill date ${dateLabel(date)}` : "contracts"} />
        <Kpi color="green" label="Ready to generate" icon={FiPlayCircle} value={s?.ready ?? "—"} note="no warnings" />
        <Kpi color="red" label="Missed bill date" icon={FiAlertTriangle} value={s?.missed ?? "—"}
          note={s?.missed ? `oldest ${lateText(oldestMissed)}` : "all on time"} onClick={s?.missed ? () => { setOnlyMissed((v) => !v); setPicked(null); } : undefined} active={showOnlyMissed} />
        <Kpi color="purple" label="Already drafted" icon={FiEdit3} value={s?.already_drafted ?? "—"} note="in Draft Invoices" onClick={() => navigate("/billing/drafts")} />
        <Kpi color="teal" label="Estimated value" icon={FiTrendingUp} value={s ? rupeesShort(s.estimated_total) : "—"} note="incl. GST" />
      </div>

      <div className="ac-card">
        <div className="bl-filterbar">
          <div className="bl-search">
            <FiSearch aria-hidden="true" />
            <input className="ac-input" placeholder="Search customer or contract code…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search" />
          </div>
          <CustomerFilter options={customerOptions} value={customers} onChange={(v) => { setCustomers(v); setPicked(null); }} />
          <select className="ac-select" value={type} onChange={(e) => setType(e.target.value)} aria-label="Billing type">
            <option value="">All billing types</option>
            <option value="AMC">AMC</option>
            <option value="ONE_TIME">One-time</option>
            <option value="TERMITE">Termite</option>
            <option value="CHEMICAL">Chemical</option>
          </select>
          <select className="ac-select" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
            <option value="">All categories</option>
            <option value="COMMERCIAL">Commercial</option>
            <option value="RESIDENTIAL">Residential</option>
          </select>
        </div>
        <Msg error={error} />
        {/* Bills whose Bill date has passed with no bill made: carried forward and shown first. */}
        {s?.missed > 0 && (
          <div className="br-missed-banner" role="status">
            <span className="br-missed-ic"><FiAlertTriangle /></span>
            <div className="br-missed-text">
              <b>{s.missed} bill{s.missed === 1 ? "" : "s"} missed {s.missed === 1 ? "its" : "their"} bill date</b>
              <span>{s.missed === 1 ? `${lateText(oldestMissed)}.` : `The oldest is ${lateText(oldestMissed)}.`} Generate {s.missed === 1 ? "it" : "them"} as soon as possible - missed bills stay listed on every date until they are made.</span>
            </div>
            <button type="button" className={`br-missed-btn ${showOnlyMissed ? "on" : ""}`} aria-pressed={showOnlyMissed} onClick={() => { setOnlyMissed((v) => !v); setPicked(null); }}>
              {showOnlyMissed ? "Show all" : "Show only missed"}
            </button>
          </div>
        )}
        <div className="ac-table-wrap">
          <table className="ac-table ac-stack bl-tabstack">
            <thead>
              <tr>
                <th>
                  <input type="checkbox" className="bl-cb" checked={allOn} disabled={!allSelectable.length}
                    onChange={() => setPicked(allOn ? new Set() : new Set(allSelectable.map((r) => r.contract_id)))} aria-label="Select all" />
                </th>
                <th>Customer</th><th>Contract</th><th>Type</th><th>Bill date</th><th>Services (done / plan)</th><th>Period</th>{allMonths && <th>Billed in</th>}
                <th className="ac-num">Estimated (₹)</th><th>Needs input</th><th>Warnings</th>
              </tr>
            </thead>
            <tbody>
              {loading || !rows.length ? (
                <EmptyRow cols={allMonths ? 11 : 10} loading={loading} text={
                  s?.already_drafted ? `Nothing left to generate ${dateView ? "for this date" : "this month"}. ${s.already_drafted} draft${s.already_drafted === 1 ? " is" : "s are"} waiting in Draft Invoices.`
                    : dateView ? `Nothing to bill on ${dateLabel(date)} and no missed bills. Pick another date or see the whole month (contracts without a Bill date show there).`
                      : "Nothing is due for billing in this month. A contract billed in arrears appears in the month its period ends (each contract page shows which month)."} />
              ) : (
                rows.map((r) => {
                  const short = r.services && r.services.done < r.services.planned;
                  return (
                    // Clicking the row opens its SOS (back returns here); the tick box only selects.
                    <tr key={r.contract_id} className={`${short ? "bl-short" : ""} ${selected.has(r.contract_id) ? "bl-sel" : ""} ${r.sos ? "bl-click" : ""} ${r.missed_days > 0 ? "br-missed-row" : ""}`}
                      onClick={r.sos ? () => navigate(`/billing/sos/${encodeURIComponent(r.company_id)}?month=${String(r.period_start).slice(0, 7)}&from=run${backQuery}`) : undefined}
                      title={r.sos ? "Open the SOS" : undefined}>
                      <td onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" className="bl-cb" checked={selected.has(r.contract_id)} disabled={!selectable(r)} onChange={() => toggle(r.contract_id)} aria-label={`Select ${r.customer}`} />
                      </td>
                      <td>
                        {r.billing_group ? (
                          <>
                            <b>{r.billing_group.group}</b>
                          </>
                        ) : (
                          <><b>{r.customer}</b><div className="bl-sub">{CATEGORY_LABEL[r.category] || "Customer type not set"}</div></>
                        )}
                      </td>
                      <td>{r.contract_code}</td>
                      <td>
                        <TypeBadge type={r.billing_type} frequency={r.frequency_months} unit={r.frequency_unit} />
                        {r.separate_bills && <div className="bl-sub" style={{ marginTop: 4 }} title="Separate bills: a services invoice and a chemicals invoice each period">2 bills · services + chemicals</div>}
                      </td>
                      <td>
                        {r.bill_date ? (
                          <>
                            <span className="br-billdate">{dateLabel(r.bill_date)}</span>
                            {r.missed_days > 0 ? (
                              <span className="br-tag missed" title={`Bill date ${dateLabel(r.bill_date)} has passed - not billed yet`}><FiAlertTriangle /> Missed · {lateText(r.missed_days)}</span>
                            ) : r.bill_date === todayStr ? (
                              <span className="br-tag today" title="Bill today">Due today</span>
                            ) : null}
                          </>
                        ) : <span className="ac-sub" title="No Bill date on the contract: never marked missed">—</span>}
                      </td>
                      <td>{r.services ? <ServicesChip done={r.services.done} planned={r.services.planned} /> : <span className="bl-svc none">—</span>}</td>
                      <td>
                        {periodLabel(r.period_start, r.period_end)}
                        {r.periods > 1 && <div className="ac-sub" style={{ fontSize: 12 }}>{r.periods} invoices · one per {r.frequency_unit === "DAY" ? "day" : "week"}</div>}
                      </td>
                      {allMonths && (
                        <td>
                          {/* due now (this month or earlier): can be generated; later: shown only */}
                          <span className={`ac-badge ${r.due_now === false ? "b-grey" : r.bill_month < (data?.this_month || thisMonth()) ? "b-amber" : "b-blue"}`}
                            title={r.due_now === false ? "Not due yet: generate it in that month" : r.bill_month < (data?.this_month || thisMonth()) ? "Overdue: not billed in its month" : "Due this month"}>
                            {monthLabel(`${r.bill_month}-01`)}
                          </span>
                        </td>
                      )}
                      {/* separate bills: each bill's amount on hover only, so the row keeps its height */}
                      <td className="bl-num" title={r.bills && r.estimated_total !== null ? r.bills.filter((b) => b.estimated_total !== null).map((b) => `${b.kind === "CHEMICAL" ? "Chemicals" : "Services"} ₹${amount(b.estimated_total)}`).join(" · ") : undefined}>
                        {r.estimated_total === null ? "—" : amount(r.estimated_total)}
                      </td>
                      <td>
                        {r.extras_no_rate?.length ? <span className="ac-badge b-amber">Extra service rate</span>
                          : r.needs_input ? <span className="ac-badge b-amber">{r.billing_type === "CHEMICAL" ? "Quantities" : "Quantity"}</span>
                          : <span className="ac-sub">No</span>}
                      </td>
                      <td>
                        {/* One button per row: the warnings open in a box (red when something blocks generating) */}
                        {r.warnings.length > 0 ? (
                          <button type="button" className={`bl-warnbtn ${r.blocking ? "err" : ""}`} onClick={(e) => { e.stopPropagation(); setWarnRow(r); }}
                            title="See the warnings" aria-label={`${r.warnings.length} warning${r.warnings.length === 1 ? "" : "s"} for ${r.billing_group?.group || r.customer}`}>
                            <FiAlertTriangle /> {r.warnings.length} warning{r.warnings.length === 1 ? "" : "s"}
                          </button>
                        ) : <span className="ac-sub">—</span>}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {warnRow && (
        <Modal onClose={() => setWarnRow(null)} narrow label="Warnings">
          <div className="bl-m-head">
            <div>
              <h3>{warnRow.billing_group?.group || warnRow.customer}</h3>
              <div className="ac-sub">{warnRow.contract_code} · {periodLabel(warnRow.period_start, warnRow.period_end)}</div>
            </div>
            <button type="button" className="bl-x" onClick={() => setWarnRow(null)} aria-label="Close">✕</button>
          </div>
          <div className="bl-m-body">
            {warnRow.warnings.some((w) => w.blocking) && (
              <div>
                <div className="bl-m-sec">Must be fixed before generating</div>
                {warnRow.warnings.filter((w) => w.blocking).map((w) => <div key={w.code} className="bl-chk"><span className="bl-dot r" /><span>{w.message}</span></div>)}
              </div>
            )}
            {warnRow.warnings.some((w) => !w.blocking) && (
              <div>
                <div className="bl-m-sec">To check</div>
                {warnRow.warnings.filter((w) => !w.blocking).map((w) => <div key={w.code} className="bl-chk"><span className="bl-dot a" /><span>{w.message}</span></div>)}
              </div>
            )}
          </div>
          <div className="bl-m-foot">
            <span />
            <div className="ac-actions">
              <button type="button" className="ac-btn" onClick={() => setWarnRow(null)}>Close</button>
              {warnRow.sos && (
                <button type="button" className="ac-btn ac-btn-primary" onClick={() => navigate(`/billing/sos/${encodeURIComponent(warnRow.company_id)}?month=${String(warnRow.period_start).slice(0, 7)}&from=run${backQuery}`)}>Open SOS</button>
              )}
            </div>
          </div>
        </Modal>
      )}

      {result && (
        <Modal onClose={() => setResult(null)} narrow label="Bill run result">
          <div className="bl-m-head">
            <div className="bl-m-ok">✓</div>
            <div><h3>{result.drafts.length} draft{result.drafts.length === 1 ? "" : "s"} created</h3><div className="ac-sub">{result.skipped.length} skipped</div></div>
          </div>
          <div className="bl-m-body">
            {result.skipped.length > 0 && (
              <div>
                <div className="bl-m-sec">Skipped</div>
                {result.skipped.map((x) => (
                  <div key={x.contract_id} className="bl-chk"><span className="bl-dot r" /><span><b>{x.customer || x.contract_code}</b> — {x.reason}</span></div>
                ))}
              </div>
            )}
            {result.drafts.some((d) => d.needs_input) && <div className="ac-info">ⓘ Some drafts need quantities before they can be issued.</div>}
          </div>
          <div className="bl-m-foot">
            <span />
            <div className="ac-actions">
              <button type="button" className="ac-btn" onClick={() => setResult(null)}>Close</button>
              {result.drafts.length === 1 ? (
                <button type="button" className="ac-btn ac-btn-primary" onClick={() => navigate(`/billing/drafts/${result.drafts[0].id}`)}>Open draft</button>
              ) : result.drafts.length > 1 ? (
                <button type="button" className="ac-btn ac-btn-primary" onClick={() => navigate("/billing/drafts")}>Open Draft Invoices</button>
              ) : null}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}


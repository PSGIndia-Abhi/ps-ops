import { useMemo, useState } from "react";
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { FiAlertTriangle, FiCalendar, FiEdit3, FiPlayCircle, FiSearch, FiTrendingUp } from "react-icons/fi";
import { EmptyRow } from "../accountant/ui";
import { billingPost, qs, useBilling, useCustomerOptions } from "./billingApi";
import { CATEGORY_LABEL, amount, monthLabel, periodLabel, rupeesShort, thisMonth } from "./format";
import { Kpi, Modal, Msg, ServicesChip, TypeBadge, MonthPicker } from "./ui";
import useDebounced from "./useDebounced";
import CustomerFilter from "./CustomerFilter";

// Bill Run: contracts due in the month, with their services and warnings. Select and generate
// drafts; drafts are checked and issued from Draft Invoices. When nothing was skipped and no
// quantities are needed, it goes straight to the draft (one) or to Draft Invoices (several).

export default function BillRun() {
  const { me } = useOutletContext();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // ?month= when coming back from an SOS opened here
  const [month, setMonth] = useState(/^(\d{4}-\d{2}|ALL)$/.test(params.get("month") || "") ? params.get("month") : thisMonth());
  // All months: every active contract's next bill, each with the month it is billed in. Only bills due
  // by this month can be ticked; they are generated in this month's run.
  const allMonths = month === "ALL";
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
  const byCustomer = useMemo(() => (data?.rows || []).filter((r) => !customers.length || customers.includes(r.company_id) || (r.billing_group?.companies || []).some((c) => customers.includes(c.company_id))), [data, customers]);
  // A contract whose draft is made leaves the list (it is in Draft Invoices); the card counts them.
  const rows = byCustomer.filter((r) => !r.already_drafted);
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
    due: rows.length,
    ready: rows.filter((r) => !r.warnings.length && !r.already_drafted).length,
    with_warnings: rows.filter((r) => r.warnings.length).length,
    already_drafted: byCustomer.filter((r) => r.already_drafted).length,
    estimated_total: rows.reduce((t, r) => t + (r.estimated_total || 0), 0),
  } : null;
  const canGenerate = me.can("GENERATE_INVOICE");

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
          <button type="button" className={`bl-allbtn ${allMonths ? "on" : ""}`} aria-pressed={allMonths}
            onClick={() => { setMonth(allMonths ? thisMonth() : "ALL"); setPicked(null); }} title={allMonths ? "Back to one month" : "See every contract's next bill"}>All months</button>
          <MonthPicker value={allMonths ? "" : month} allowEmpty fallback={thisMonth()} onChange={(m) => { setMonth(m || thisMonth()); setPicked(null); }} />
          {canGenerate && (
            <button type="button" className="ac-btn ac-btn-primary" disabled={busy || !selected.size} onClick={generate}>
              {busy ? "Generating…" : `Generate drafts (${selected.size} selected)`}
            </button>
          )}
        </div>
      </div>
      <Msg error={runError} />

      <div className="ac-kpis bl-kpis-5">
        <Kpi color="blue" label="Due this month" icon={FiCalendar} value={s?.due ?? "—"} note="contracts" />
        <Kpi color="green" label="Ready to generate" icon={FiPlayCircle} value={s?.ready ?? "—"} note="no warnings" />
        <Kpi color="orange" label="With warnings" icon={FiAlertTriangle} value={s?.with_warnings ?? "—"} note="PO, profile or service shortfall" />
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
        <div className="ac-table-wrap">
          <table className="ac-table ac-stack">
            <thead>
              <tr>
                <th>
                  <input type="checkbox" className="bl-cb" checked={allOn} disabled={!allSelectable.length}
                    onChange={() => setPicked(allOn ? new Set() : new Set(allSelectable.map((r) => r.contract_id)))} aria-label="Select all" />
                </th>
                <th>Customer</th><th>Contract</th><th>Type</th><th>Services (done / plan)</th><th>Period</th>{allMonths && <th>Billed in</th>}
                <th className="ac-num">Estimated (₹)</th><th>Needs input</th><th>Warnings</th>
              </tr>
            </thead>
            <tbody>
              {loading || !rows.length ? (
                <EmptyRow cols={allMonths ? 10 : 9} loading={loading} text={s?.already_drafted ? `Nothing left to generate this month. ${s.already_drafted} draft${s.already_drafted === 1 ? " is" : "s are"} waiting in Draft Invoices.` : "Nothing is due for billing in this month. A contract billed in arrears appears in the month its period ends (each contract page shows which month)."} />
              ) : (
                rows.map((r) => {
                  const short = r.services && r.services.done < r.services.planned;
                  return (
                    // Clicking the row opens its SOS (back returns here); the tick box only selects.
                    <tr key={r.contract_id} className={`${short ? "bl-short" : ""} ${selected.has(r.contract_id) ? "bl-sel" : ""} ${r.sos ? "bl-click" : ""}`}
                      onClick={r.sos ? () => navigate(`/billing/sos/${encodeURIComponent(r.company_id)}?month=${String(r.period_start).slice(0, 7)}&from=run`) : undefined}
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
                <button type="button" className="ac-btn ac-btn-primary" onClick={() => navigate(`/billing/sos/${encodeURIComponent(warnRow.company_id)}?month=${String(warnRow.period_start).slice(0, 7)}&from=run`)}>Open SOS</button>
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


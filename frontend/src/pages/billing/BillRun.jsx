import { useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { FiAlertTriangle, FiCalendar, FiEdit3, FiPlayCircle, FiSearch, FiTrendingUp } from "react-icons/fi";
import { EmptyRow } from "../accountant/ui";
import { billingPost, qs, useBilling, useCustomerOptions } from "./billingApi";
import { CATEGORY_LABEL, amount, periodLabel, rupeesShort, thisMonth } from "./format";
import { Kpi, Modal, Msg, ServicesChip, TypeBadge } from "./ui";
import useDebounced from "./useDebounced";
import CustomerFilter from "./CustomerFilter";

// Bill Run: contracts due in the month, with their services and warnings. Select and generate
// drafts; drafts are checked and issued from Draft Invoices. When nothing was skipped and no
// quantities are needed, it goes straight to the draft (one) or to Draft Invoices (several).

export default function BillRun() {
  const { me } = useOutletContext();
  const navigate = useNavigate();
  const [month, setMonth] = useState(thisMonth());
  const [type, setType] = useState("");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const q = useDebounced(search);
  const { data, error, loading, reload } = useBilling(`/due${qs({ month, type, category, q })}`);
  const [picked, setPicked] = useState(null); // null = nothing ticked yet (contracts are ticked by hand)
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [runError, setRunError] = useState("");

  const customerOptions = useCustomerOptions();
  const [customers, setCustomers] = useState([]); // customer filter: [] = all
  const rows = useMemo(() => (data?.rows || []).filter((r) => !customers.length || customers.includes(r.company_id) || (r.billing_group?.companies || []).some((c) => customers.includes(c.company_id))), [data, customers]);
  const selectable = (r) => !r.blocking && !r.already_drafted;
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
    already_drafted: rows.filter((r) => r.already_drafted).length,
    estimated_total: rows.reduce((t, r) => t + (r.estimated_total || 0), 0),
  } : null;
  const canGenerate = me.can("GENERATE_INVOICE");

  async function generate() {
    setBusy(true);
    setRunError("");
    try {
      const r = await billingPost("/runs", { month, contract_ids: [...selected] });
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
          <p className="ac-sub">Contracts due for billing in the selected month. Generate drafts, check them, then issue.</p>
        </div>
        <div className="ac-actions">
          <input type="month" className="ac-input" style={{ width: 170 }} value={month} onChange={(e) => { setMonth(e.target.value || thisMonth()); setPicked(null); }} aria-label="Month" />
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
        <Kpi color="purple" label="Already drafted" icon={FiEdit3} value={s?.already_drafted ?? "—"} note="awaiting issue" />
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
                <th>Customer</th><th>Contract</th><th>Type</th><th>Services (done / plan)</th><th>Period</th>
                <th className="ac-num">Estimated (₹)</th><th>Needs input</th><th>Warnings</th>
              </tr>
            </thead>
            <tbody>
              {loading || !rows.length ? (
                <EmptyRow cols={9} loading={loading} text="Nothing is due for billing in this month. A contract billed in arrears appears in the month its period ends (each contract page shows which month)." />
              ) : (
                rows.map((r) => {
                  const short = r.services && r.services.done < r.services.planned;
                  return (
                    <tr key={r.contract_id} className={`${short ? "bl-short" : ""} ${selected.has(r.contract_id) ? "bl-sel" : ""}`}>
                      <td>
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
                      <td><TypeBadge type={r.billing_type} frequency={r.frequency_months} unit={r.frequency_unit} /></td>
                      <td>{r.services ? <ServicesChip done={r.services.done} planned={r.services.planned} /> : <span className="bl-svc none">—</span>}</td>
                      <td>
                        {periodLabel(r.period_start, r.period_end)}
                        {r.periods > 1 && <div className="ac-sub" style={{ fontSize: 12 }}>{r.periods} invoices · one per {r.frequency_unit === "DAY" ? "day" : "week"}</div>}
                      </td>
                      <td className="bl-num">{r.estimated_total === null ? "—" : amount(r.estimated_total)}</td>
                      <td>{r.needs_input ? <span className="ac-badge b-amber">{r.billing_type === "CHEMICAL" ? "Quantities" : "Quantity"}</span> : <span className="ac-sub">No</span>}</td>
                      <td>
                        {r.already_drafted && <span className="ac-badge b-purple">Draft created</span>}
                        {r.warnings.map((w) => (
                          <span key={w.code} className={`bl-warn ${w.blocking ? "err" : ""}`}>{w.blocking ? "✕" : "⚠"} {w.message}</span>
                        ))}
                        {!r.already_drafted && !r.warnings.length && <span className="ac-sub">—</span>}
                        {r.sos && (
                          <button type="button" className="bl-link" style={{ display: "block", marginTop: 4 }}
                            onClick={() => navigate(`/billing/sos/${encodeURIComponent(r.company_id)}?month=${String(r.period_start).slice(0, 7)}`)}>
                            {r.sos === "SUBMITTED" ? "✓ SOS submitted - view" : "Open SOS"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

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


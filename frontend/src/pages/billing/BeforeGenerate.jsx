import { useMemo, useState } from "react";
import { Link, useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { billingPost, qs, useBilling } from "./billingApi";
import { amountInWords, lineAmount, totalsFor } from "./calc";
import { amount, dmy, monthLabel, rupees, thisMonth } from "./format";
import { Msg, ServicesChip, BackButton } from "./ui";

// Before generating: opened from the Bill Run when a selected contract has extra services the
// Service Coordinator added on the SOS without a rate (they cannot price them). Laid out like the
// draft invoice. Only the rate of those extra services can be entered; "Generate drafts" creates the
// drafts for every contract selected in the Bill Run, and stays off until each rate is entered.
// The rate is saved on the SOS line, so the SOS shows it too.

export default function BeforeGenerate() {
  const { me } = useOutletContext();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const month = params.get("month") || thisMonth();
  const ids = useMemo(() => (params.get("ids") || "").split(",").filter(Boolean), [params]);
  const { data, error, loading } = useBilling(`/runs/preview${qs({ month, contract_ids: ids.join(",") })}`);
  const [rates, setRates] = useState({}); // { "<contract>|<line key>": "750" }
  const [qtys, setQtys] = useState({}); // extra service quantity changed here (default: the SOS number)
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({});
  const [result, setResult] = useState(null);

  const contracts = data?.contracts || [];
  const keyOf = (c, l) => `${c.contract_id}|${c.period_start}|${l.key}`;
  const qtyOf = (c, l) => qtys[keyOf(c, l)] ?? String(l.quantity);
  const withRates = (c) => c.lines.map((l) => (l.needs_rate ? { ...l, rate: rates[keyOf(c, l)] ?? "", quantity: qtyOf(c, l) } : l));
  const missing = contracts.flatMap((c) => c.lines.filter((l) => l.needs_rate && (!(Number(rates[keyOf(c, l)]) > 0) || !(Number(qtyOf(c, l)) > 0))));
  const others = ids.length - new Set(contracts.map((c) => c.contract_id)).size;
  const canGenerate = me.can("GENERATE_INVOICE");

  async function generate() {
    setBusy(true);
    setMsg({});
    try {
      // each extra service: its rate and the quantity to bill (the SOS number unless changed here)
      const extras = contracts.flatMap((c) => c.lines.filter((l) => l.needs_rate)
        .map((l) => ({ sos_line_ids: l.sos_line_ids || [], rate: Number(rates[keyOf(c, l)]), quantity: Number(qtyOf(c, l)) })));
      const r = await billingPost("/runs", { month, contract_ids: ids, extras });
      const clean = r.drafts.length > 0 && !r.skipped.length && !r.drafts.some((d) => d.needs_input);
      if (clean) {
        navigate(r.drafts.length === 1 ? `/billing/drafts/${r.drafts[0].id}` : "/billing/drafts");
        return;
      }
      setResult(r);
    } catch (err) {
      setMsg({ error: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ac-page">
      <div className="ac-head">
        <div>
          <div className="bl-backrow"><BackButton to="/billing/run" label="Bill Run" /><div className="ac-sub" style={{ fontSize: 13 }}><Link to="/billing/run">Bill Run</Link> / Before generating</div></div>
          <h1 className="ac-title">Enter the rate for extra services</h1>
          <p className="ac-sub">
            {monthLabel(`${month}-01`)} · The Service Coordinator added these services on the SOS without a rate. Enter each rate, then generate the draft.
          </p>
        </div>
        <div className="ac-actions">
          <button type="button" className="ac-btn" disabled={busy} onClick={() => navigate("/billing/run")}>Cancel</button>
          {canGenerate && !result && (
            <button type="button" className="ac-btn ac-btn-primary" disabled={busy || loading || !ids.length || missing.length > 0} onClick={generate}>
              {busy ? "Generating…" : `Generate draft${ids.length === 1 ? "" : "s"}`}
            </button>
          )}
        </div>
      </div>
      <Msg error={error || msg.error} />
      {!loading && !error && !result && (
        <div className="ac-info">
          {missing.length
            ? `ⓘ Enter the rate (and quantity) for ${missing.length} extra service${missing.length === 1 ? "" : "s"} to generate.`
            : "ⓘ Every rate is entered. Generate creates the draft; it is checked and issued from Draft Invoices."}
          {others > 0 && ` ${others} other selected contract${others === 1 ? "" : "s"} will be generated as well.`}
        </div>
      )}

      {result && (
        <div className="ac-card">
          <h3 className="ac-card-title">{result.drafts.length} draft{result.drafts.length === 1 ? "" : "s"} created · {result.skipped.length} skipped</h3>
          {result.skipped.map((x) => (
            <div key={x.contract_id} className="bl-chk"><span className="bl-dot r" /><span><b>{x.customer || x.contract_code}</b> — {x.reason}</span></div>
          ))}
          {result.drafts.some((d) => d.needs_input) && <div className="ac-info">ⓘ Some drafts need quantities before they can be issued.</div>}
          <div className="ac-actions" style={{ marginTop: 12 }}>
            <button type="button" className="ac-btn" onClick={() => navigate("/billing/run")}>Back to Bill Run</button>
            {result.drafts.length > 0 && <button type="button" className="ac-btn ac-btn-primary" onClick={() => navigate(result.drafts.length === 1 ? `/billing/drafts/${result.drafts[0].id}` : "/billing/drafts")}>Open draft{result.drafts.length === 1 ? "" : "s"}</button>}
          </div>
        </div>
      )}

      {loading && <div className="ac-card"><div className="ac-sub">Loading…</div></div>}
      {!loading && !error && !contracts.length && !result && (
        <div className="ac-card"><div className="ac-sub">No extra services need a rate. Go back to the Bill Run and generate.</div></div>
      )}

      {!result && contracts.map((c) => {
        const lines = withRates(c);
        const t = totalsFor(lines, c.tax_mode, c.gst_rate);
        return (
          <div key={`${c.contract_id}|${c.period_start}`} className="bl-split" style={{ marginBottom: 16 }}>
            <div className="bl-stack">
              <div className="ac-card">
                <div className="ac-card-head">
                  <div>
                    <h3 className="ac-card-title">{c.customer}</h3>
                    <div className="ac-sub">{c.contract_code} · Period {dmy(c.period_start)} to {dmy(c.period_end)}</div>
                  </div>
                  <span className="bl-lock-note">🔒 From the contract and the SOS</span>
                </div>
                {c.bill_to && <div className="ac-sub" style={{ marginBottom: 10 }}>Bill To: {[c.bill_to.name, String(c.bill_to.address || "").replace(/\n/g, ", "), c.bill_to.state].filter(Boolean).join(", ")}</div>}
                <div className="ac-table-wrap">
                  <table className="ac-table ac-stack">
                    <thead>
                      <tr><th>Item</th><th className="ac-num">Rate (₹)</th><th>Services (done / plan)</th><th className="ac-num">Qty</th><th className="ac-num">Amount (₹)</th></tr>
                    </thead>
                    <tbody>
                      {lines.map((l) => {
                        const k = keyOf(c, l);
                        const blank = l.needs_rate && !(Number(l.rate) > 0);
                        return (
                          <tr key={k} className={l.needs_rate ? "bl-sel" : ""}>
                            <td style={{ minWidth: 200 }}>
                              <b>{l.item_name}</b>
                              {blank && <span className="ac-badge b-amber" style={{ marginLeft: 6 }}>Enter rate</span>}
                              <div className="bl-sub">{[l.extra && "Extra service (added on the SOS)", l.site, l.sac_code && `SAC ${l.sac_code}`, l.unit && `per ${l.unit}`].filter(Boolean).join(" · ")}</div>
                            </td>
                            <td className="bl-num" style={{ width: 130 }}>
                              {l.needs_rate ? (
                                <input type="number" min="0.01" step="0.01" inputMode="decimal" className="bl-cell-input num" value={rates[k] ?? ""}
                                  onChange={(e) => setRates({ ...rates, [k]: e.target.value })} aria-label={`Rate for ${l.item_name}`} />
                              ) : amount(l.rate)}
                            </td>
                            <td><ServicesChip done={l.services_done} planned={l.services_planned} /></td>
                            <td className="bl-num" style={{ width: 150 }}>
                              {l.needs_rate ? (
                                <div className="bl-stp sp-stp ct-qty" style={{ marginLeft: "auto" }}>
                                  <button type="button" onClick={() => setQtys({ ...qtys, [k]: String(Math.max(1, (Number(l.quantity) || 1) - 1)) })} disabled={(Number(l.quantity) || 1) <= 1} aria-label="Less">−</button>
                                  <input type="number" min="1" max="99999" step="1" value={l.quantity} onChange={(e) => setQtys({ ...qtys, [k]: e.target.value })} aria-label={`Quantity for ${l.item_name}`} />
                                  <button type="button" onClick={() => setQtys({ ...qtys, [k]: String(Math.min(99999, (Number(l.quantity) || 0) + 1)) })} aria-label="More">+</button>
                                </div>
                              ) : l.quantity}
                            </td>
                            <td className="bl-num"><b>{blank ? "—" : amount(lineAmount(l))}</b></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="bl-stack">
              <div className="ac-card">
                <h3 className="ac-card-title">Totals</h3>
                <div className="bl-tot">
                  <span className="k">Sub total</span><span className="v">{amount(t.subtotal)}</span>
                  {c.tax_mode === "CGST_SGST" && <><span className="k">CGST {c.gst_rate / 2}%</span><span className="v">{amount(t.cgst)}</span><span className="k">SGST {c.gst_rate / 2}%</span><span className="v">{amount(t.sgst)}</span></>}
                  {c.tax_mode === "IGST" && <><span className="k">IGST {c.gst_rate}%</span><span className="v">{amount(t.igst)}</span></>}
                  {c.tax_mode === "NONE" && <><span className="k">GST</span><span className="v">No GST</span></>}
                  <span className="k">Round off</span><span className="v">{amount(t.round_off)}</span>
                  <span className="grand">Total</span><span className="v grand">{rupees(t.total)}</span>
                </div>
                <div className="bl-words">{amountInWords(t.total)}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { billingPost, billingPut, openPdf, qs, useBilling } from "./billingApi";
import { amountInWords, gstRateOf, lineAmount, totalsFor } from "./calc";
import { CATEGORY_LABEL, amount, dmy, monthLabel, periodLabel, rupees, typeLabel } from "./format";
import IssueDialog from "./IssueDialog";
import { Field, Msg, ServicesChip } from "./ui";
import { InvoiceSkeleton } from "./Skeletons";

// Draft invoice: header, lines (with services done against the plan and the billing basis), totals,
// the checks before issuing, preview and issue. The lines are locked - items, rates and the billing
// basis come from the contract and the SOS. Only the invoice date, the PO and the blanks the Bill Run
// could not fill (a chemical / area quantity, the rate of an extra service) can be entered here.
// Preview and Issue save unsaved changes first, so Save is optional. Issue goes straight through
// (then opens Print / Share) when there is nothing to confirm; warnings still ask first.

const ADJ = {
  NONE: "Full amount",
  SERVICES: "Services done",
  FULL_DESPITE_SHORTFALL: "Bill full amount",
  DAYS: "Days worked",
  PERCENT: "Percent",
  MANUAL: "Manual amount",
};

function formFrom(inv) {
  return {
    invoice_date: inv.invoice_date,
    ship_to_site_id: inv.ship_to_site_id || "",
    description: inv.description,
    po_ids: inv.po_ids,
    lines: inv.lines.map((l) => ({ ...l, key: l.id })),
  };
}

export default function DraftEditor() {
  const { me } = useOutletContext();
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: inv, error, loading, setData } = useBilling(`/invoices/${id}`);
  const { data: options } = useBilling(inv ? `/service-options${qs({ company_id: inv.customer.company_id })}` : null);
  const [edits, setEdits] = useState(null);
  const [check, setCheck] = useState(null);
  const [msg, setMsg] = useState({});
  const [busy, setBusy] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [issuedNow, setIssuedNow] = useState(null); // issued with nothing to confirm: the success message
  const issued = useRef(false);

  const editable = inv?.status === "DRAFT" && me.can("GENERATE_INVOICE");
  const form = edits || (inv ? formFrom(inv) : null);
  const dirty = Boolean(edits);
  const gstRate = gstRateOf(inv?.gst_rate); // copied from the contract when the draft was made
  const totals = form && inv ? totalsFor(form.lines, inv.tax_mode, gstRate) : null;

  // The checks before issuing, for the saved draft.
  const version = inv?.version;
  useEffect(() => {
    if (!version || inv?.status !== "DRAFT") return undefined;
    let live = true;
    billingPost(`/invoices/${id}/check`)
      .then((r) => live && setCheck(r))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [id, version, inv?.status]);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return undefined;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const set = (patch) => setEdits({ ...form, ...patch });
  const setLine = (key, patch) => set({ lines: form.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) });

  async function save() {
    setBusy(true);
    setMsg({});
    try {
      const body = {
        version: inv.version,
        invoice_date: form.invoice_date,
        po_ids: form.po_ids,
        // only the blanks a line allows (quantity of a per-unit line, rate of an extra service)
        lines: form.lines.map((l) => ({ id: l.id, quantity: l.quantity, rate: l.rate })),
      };
      const saved = await billingPut(`/invoices/${id}`, body);
      setData(saved);
      setEdits(null);
      setMsg({ ok: "Draft saved." });
      return saved;
    } catch (err) {
      setMsg({ error: err.message, errors: err.errors });
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function preview() {
    if (dirty && !(await save())) return;
    try {
      await openPdf(`/invoices/${id}/preview`);
    } catch (err) {
      setMsg({ error: err.message });
    }
  }

  async function startIssue() {
    if (dirty && !(await save())) return;
    setBusy(true);
    try {
      const r = await billingPost(`/invoices/${id}/check`);
      setCheck(r);
      if (!r.can_issue) {
        setMsg({ error: "Fix these before issuing:", errors: r.errors });
        return;
      }
      // Warnings (services short, no PO, ...) still need a confirmation in the Issue dialog.
      if (r.warnings?.length) {
        setIssuing(true);
        return;
      }
      // Nothing to confirm: issue now, then the success message prints (the server emailed it when the
      // customer has automatic email on). confirm_warnings stays false, so a
      // warning that appears in the meantime stops the issue instead of being accepted unseen.
      const res = await billingPost("/invoices/issue", { ids: [id], confirm_warnings: false });
      if (res.issued?.length) {
        issued.current = true;
        setIssuedNow(res);
      } else {
        setMsg({ error: "The invoice was not issued:", errors: res.failed?.[0]?.errors || [] });
      }
    } catch (err) {
      setMsg({ error: err.message });
    } finally {
      setBusy(false);
    }
  }

  if (loading && !inv) return <InvoiceSkeleton />;
  if (error && !inv) return <Msg error={error} />;
  if (!inv) return null;

  const sites = options?.sites || [];
  const pos = [...inv.pos, ...inv.available_pos.filter((p) => !inv.pos.some((x) => x.id === p.id))];

  return (
    <div className="ac-page">
      <div className="ac-head">
        <div>
          <div className="ac-crumb"><button type="button" onClick={() => navigate("/billing/drafts")}>Draft Invoices</button> / {inv.customer.name}</div>
          <h1 className="ac-title">
            {inv.status === "DRAFT" ? "Draft Invoice" : `Invoice ${inv.invoice_number}`}{" "}
            <span className={`ac-badge ${inv.status === "DRAFT" ? "b-amber" : inv.status === "ISSUED" ? "b-green" : "b-grey"}`} style={{ verticalAlign: "middle" }}>
              {inv.status.charAt(0) + inv.status.slice(1).toLowerCase()}
            </span>
          </h1>
          <p className="ac-sub">
            {inv.contract.contract_code} · {typeLabel(inv.contract.billing_type, inv.contract.frequency_months, inv.contract.frequency_unit)} · Period {dmy(inv.period_start)} to {dmy(inv.period_end)}
            {inv.services ? ` · Services ${inv.services.done} of ${inv.services.planned}` : ""} · Print copies: {inv.print_copies}
          </p>
        </div>
        {inv.status === "DRAFT" && (
          <div className="ac-actions">
            {editable && <button type="button" className="ac-btn" disabled={busy || !dirty} onClick={save}>{busy ? "Saving…" : "Save"}</button>}
            {editable && dirty && <button type="button" className="ac-btn" disabled={busy} onClick={() => setEdits(null)}>Discard changes</button>}
            {me.can("GENERATE_INVOICE") && <button type="button" className="ac-btn" disabled={busy} onClick={preview}>Preview PDF</button>}
            {me.can("ISSUE_INVOICE") && <button type="button" className="ac-btn green" disabled={busy} onClick={startIssue}>{busy ? "Please wait…" : "Issue invoice"}</button>}
          </div>
        )}
      </div>
      {inv.status !== "DRAFT" && (
        <div className="ac-info"><span>ⓘ This invoice is {inv.status.toLowerCase()} and can no longer be edited. <Link to="/billing/invoices">Go to Issued Invoices</Link></span></div>
      )}
      <Msg {...msg} />

      <div className="bl-split">
        <div className="bl-stack">
          <div className="ac-card">
            <div className="bl-grid g4">
              <Field label="Customer"><input className="ac-input" readOnly value={inv.customer.name} /></Field>
              <Field label="Category"><input className="ac-input" readOnly value={`${CATEGORY_LABEL[inv.customer.category] || "—"} · ${inv.tax_mode === "NONE" ? "No GST" : inv.tax_mode === "IGST" ? "IGST" : "GST"}`} /></Field>
              <Field label="Invoice date" required>
                <input type="date" className="ac-input" value={form.invoice_date || ""} disabled={!editable} onChange={(e) => set({ invoice_date: e.target.value })} />
              </Field>
              <Field label="Bill To" className="bl-span2">
                <input className="ac-input" readOnly value={[inv.bill_to.name, inv.bill_to.address.replace(/\n/g, ", "), inv.bill_to.state].filter(Boolean).join(", ")} />
              </Field>
              {/* a group based invoice bills the group (its companies are the lines): no Ship To */}
              {inv.contract.contract_kind !== "GROUP" && (
                <Field label="Ship To">
                  <select className="ac-select" value={form.ship_to_site_id} disabled>
                    <option value="">Same as Bill To</option>
                    {sites.map((s) => <option key={s.site_id} value={s.site_id}>{s.name}</option>)}
                    {form.ship_to_site_id && !sites.some((s) => s.site_id === form.ship_to_site_id) && <option value={form.ship_to_site_id}>{inv.ship_to?.name || form.ship_to_site_id}</option>}
                  </select>
                </Field>
              )}
              <Field label={`Purchase order${inv.contract.po_required ? " (required)" : ""}`}>
                {pos.length ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingTop: 4 }}>
                    {pos.map((p) => (
                      <label key={p.id} className="bl-toggle" style={{ paddingTop: 0 }}>
                        <input type="checkbox" disabled={!editable} checked={form.po_ids.includes(p.id)}
                          onChange={(e) => set({ po_ids: e.target.checked ? [...form.po_ids, p.id] : form.po_ids.filter((x) => x !== p.id) })} />
                        {p.po_number}{p.kind === "ADVANCE" ? " (advance)" : ""}{p.is_open_po ? " · Open PO" : p.expiry_date ? ` · till ${dmy(p.expiry_date)}` : ""}
                      </label>
                    ))}
                  </div>
                ) : (
                  <input className="ac-input" readOnly value={inv.contract.po_required ? "No valid PO - add one in Purchase Orders" : "Not required"} />
                )}
              </Field>
              <Field label="Description" className="bl-span4">
                <input className="ac-input" value={form.description} readOnly />
              </Field>
            </div>
          </div>

          <div className="ac-card">
            <div className="ac-card-head">
              <h3 className="ac-card-title">Invoice lines</h3>
              <span className="bl-lock-note">🔒 From the contract and the SOS</span>
            </div>
            <div className="ac-table-wrap">
              <table className="ac-table ac-stack">
                <thead>
                  <tr><th>Item</th><th className="ac-num">Rate (₹)</th><th>Services (done / plan)</th><th className="ac-num">Qty</th><th>Billing basis</th><th className="ac-num">Amount (₹)</th></tr>
                </thead>
                <tbody>
                  {form.lines.map((l) => {
                    const short = l.services_planned !== null && l.services_planned !== undefined && l.services_done < l.services_planned;
                    // Fixed amount contracts bill the agreed number even when fewer were done: no red row
                    const fixedBilled = short && inv.contract?.shortfall_billing === "FULL";
                    // the only blanks a draft can fill: a per-unit quantity, the rate of an extra service
                    const qtyOpen = editable && l.pricing_basis === "PER_UNIT";
                    const rateOpen = editable && !l.contract_line_id;
                    const blank = (qtyOpen && !Number(l.quantity)) || (rateOpen && !Number(l.rate));
                    return (
                      <tr key={l.key} className={short && !fixedBilled && l.adjustment_type !== "FULL_DESPITE_SHORTFALL" ? "bl-short" : ""}>
                        <td style={{ minWidth: 200 }}>
                          <b>{l.item_name}</b>
                          {blank && <span className="ac-badge b-amber" style={{ marginLeft: 6 }}>Enter {qtyOpen && !Number(l.quantity) ? "quantity" : "rate"}</span>}
                          <div className="bl-sub">{[l.site, l.sac_code && `SAC ${l.sac_code}`, l.unit && `per ${l.unit}`].filter(Boolean).join(" · ")}</div>
                          {l.invoice_group && <div className="bl-sub" style={{ color: "#1d4ed8" }}>Printed in one line: “{l.invoice_group}”</div>}
                        </td>
                        <td className="bl-num" style={{ width: 110 }}>
                          {rateOpen ? <input type="number" min="0" step="0.01" className="bl-cell-input num" value={l.rate} onChange={(e) => setLine(l.key, { rate: e.target.value })} aria-label="Rate" /> : amount(l.rate)}
                        </td>
                        <td>
                          <ServicesChip done={l.services_done} planned={l.services_planned} />
                          {fixedBilled && <div className="bl-sub">Fixed amount: billed for {l.services_planned} (agreed)</div>}
                          {l.missed_dates?.length > 0 && <div className="bl-err" style={{ marginTop: 4 }}>Not done: {l.missed_dates.map(dmy).join(", ")}</div>}
                        </td>
                        <td className="bl-num" style={{ width: 120 }}>
                          {qtyOpen ? <input type="number" min="0" step="0.001" className="bl-cell-input num" value={l.quantity} onChange={(e) => setLine(l.key, { quantity: e.target.value })} aria-label="Quantity" /> : l.quantity}
                        </td>
                        <td style={{ minWidth: 160 }}>
                          <span>{ADJ[l.adjustment_type]}{l.adjustment_reason ? ` – ${l.adjustment_reason}` : ""}</span>
                          {l.adjustment_type === "SERVICES" && <div className="bl-sub">{amount(l.rate)} × {l.services_done} ÷ {l.services_planned}</div>}
                        </td>
                        <td className="bl-num"><b>{amount(lineAmount(l))}</b></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="ac-info" style={{ marginTop: 12 }}>
              ⓘ Services done / plan come from the Service Coordinator’s monthly SOS ({monthLabel(inv.period_start)}). {inv.contract?.shortfall_billing === "FULL" ? "Fixed amount: the agreed number is billed, even when fewer were done." : "Service based: the completed number is billed."} Items and rates come from the contract price list and cannot be changed here. To correct one, fix the contract or the SOS, delete this draft and run the bill again.
            </div>
          </div>
        </div>

        <div className="bl-stack">
          <div className="ac-card">
            <h3 className="ac-card-title">Totals{dirty ? " (unsaved)" : ""}</h3>
            <div className="bl-tot">
              <span className="k">Sub total</span><span className="v">{amount(totals.subtotal)}</span>
              {inv.tax_mode === "CGST_SGST" && <><span className="k">CGST {gstRate / 2}%</span><span className="v">{amount(totals.cgst)}</span><span className="k">SGST {gstRate / 2}%</span><span className="v">{amount(totals.sgst)}</span></>}
              {inv.tax_mode === "IGST" && <><span className="k">IGST {gstRate}%</span><span className="v">{amount(totals.igst)}</span></>}
              {inv.tax_mode === "NONE" && <><span className="k">GST</span><span className="v">{inv.customer.category === "RESIDENTIAL" ? "No GST – Residential" : "No GST"}</span></>}
              <span className="k">Round off</span><span className="v">{amount(totals.round_off)}</span>
              <span className="grand">Total</span><span className="v grand">{rupees(totals.total)}</span>
            </div>
            <div className="bl-words">{amountInWords(totals.total)}</div>
            {check?.advance && (
              <div className="bl-words">
                Advance remaining {rupees(check.advance.remaining)} · {rupees(check.advance.will_adjust)} will be adjusted against this invoice
              </div>
            )}
          </div>

          {inv.status === "DRAFT" && (
            <div className="ac-card">
              <div className="ac-card-head">
                <h3 className="ac-card-title">Issue check</h3>
                {dirty && <span className="ac-sub" style={{ fontSize: 12 }}>for the saved draft</span>}
              </div>
              {!check ? (
                <div className="ac-sub">Checking…</div>
              ) : (
                <>
                  {check.checks.map((c) => (
                    <div key={c.code} className="bl-chk"><span className={`bl-dot ${c.ok ? "" : c.level === "WARNING" ? "a" : "r"}`} /><span>{c.message}</span></div>
                  ))}
                  {check.errors.filter((e) => !check.checks.some((c) => c.message === e)).map((e) => (
                    <div key={e} className="bl-chk"><span className="bl-dot r" /><span>{e}</span></div>
                  ))}
                  {check.warnings.filter((w) => !check.checks.some((c) => c.message === w)).map((w) => (
                    <div key={w} className="bl-chk"><span className="bl-dot a" /><span>{w}</span></div>
                  ))}
                </>
              )}
            </div>
          )}
          <div className="ac-sub" style={{ fontSize: 12 }}>Period {periodLabel(inv.period_start, inv.period_end)} · Place of supply {inv.place_of_supply}</div>
        </div>
      </div>

      {issuing && (
        <IssueDialog
          drafts={[{ id: inv.id, customer: inv.customer.name, total: inv.total }]}
          warnings={check?.warnings || []}
          onDone={(r) => {
            issued.current = r.issued.length > 0;
          }}
          onClose={() => {
            setIssuing(false);
            if (issued.current) navigate("/billing/invoices");
          }}
        />
      )}
      {issuedNow && (
        <IssueDialog
          drafts={[{ id: inv.id, customer: inv.customer.name, total: inv.total }]}
          issuedResult={issuedNow}
          onClose={() => {
            setIssuedNow(null);
            navigate("/billing/invoices");
          }}
        />
      )}
    </div>
  );
}

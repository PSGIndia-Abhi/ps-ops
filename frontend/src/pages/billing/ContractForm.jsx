import { useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import { EmptyRow } from "../accountant/ui";
import { billingPost, billingPut, qs, useBilling } from "./billingApi";
import { GST_RATES, gstHint } from "./calc";
import BillingProfileCard from "./BillingProfileCard";
import DescriptionPicker from "./DescriptionPicker";
import FrequencySelect from "./FrequencySelect";
import { amount, dmy, monthLabel, nextBilling, today } from "./format";
import { Field, Modal, Msg, StatusBadge } from "./ui";
import { deepCleaningServices, pestServices } from "../../components/CreateBookingModal";

// A contract and its price list. New: header + lines in one save. Existing: the header is saved on
// its own; price lines are added, corrected, or re-priced from a date (the old price is kept as history).

const TYPES = [["AMC", "AMC"], ["ONE_TIME", "One-time"], ["TERMITE", "Termite"], ["CHEMICAL", "Chemical"]];

const PO_TYPES = ["CHEMICAL", "TERMITE"]; // always billed against a PO
const SQM = "sq.m";

const emptyLine = (siteId = "", type = "", kind = "SERVICE") => ({
  key: `n${Date.now()}${Math.random()}`, site_id: siteId, sac_code: kind === "CHEMICAL" ? "" : "998531", rate: "", default_qty: "", plan_service_type: "", plan_sub_service: "",
  item_kind: kind, invoice_group: "",
  // Termite work is priced per square metre: area (sq. m) x rate per sq. m, set for each customer.
  ...(type === "TERMITE" && kind === "SERVICE" ? { item_name: "Termite Post-Construction Treatment", pricing_basis: "PER_UNIT", unit: SQM } : { item_name: "", pricing_basis: "FIXED", unit: "Nos", default_qty: 1 }),
});
const isSqm = (l) => l.pricing_basis === "PER_UNIT" && /^sq/i.test(l.unit || "");
const lineTotal = (l) => (l.rate === "" || l.default_qty === "" || l.default_qty === null || l.default_qty === undefined ? null : Number(l.rate) * Number(l.default_qty));

export default function ContractForm() {
  const { id } = useParams();
  const isNew = id === "new";
  const { me } = useOutletContext();
  const canEdit = me.can("MANAGE_BILLING_MASTERS");
  const navigate = useNavigate();
  const { data: contract, error, reload } = useBilling(isNew ? null : `/contracts/${id}`);
  const { data: customers } = useBilling("/customers");
  const [edits, setEdits] = useState(null);
  const [newLines, setNewLines] = useState([emptyLine()]);
  const [tab, setTab] = useState("prices");
  const [msg, setMsg] = useState({});
  const [busy, setBusy] = useState(false);
  const [statusAction, setStatusAction] = useState(null);
  const [repricing, setRepricing] = useState(null);
  const [lineEdit, setLineEdit] = useState(null); // line being corrected or added

  const base = contract || { billing_type: "AMC", frequency_months: 1, bill_timing: "ARREARS", invoice_grouping: "PER_CUSTOMER", po_required: false, gst_applicable: true, shortfall_billing: "PRO_RATA", start_date: today(), description_template: "", company_id: "" };
  const form = edits || { ...base, po_ids: (contract?.pos || []).map((p) => p.id) };
  const set = (patch) => setEdits({ ...form, ...patch });
  const companyId = form.company_id;
  const { data: options } = useBilling(companyId ? `/service-options${qs({ company_id: companyId })}` : null);
  const sites = options?.sites || [];
  const services = options?.services || [];
  const catalog = options?.catalog || [];
  const serviceGroups = buildServiceGroups(services, catalog);
  const readOnly = !canEdit || form.status === "ENDED";
  const residential = (isNew ? customers?.find((c) => c.company_id === form.company_id)?.category : contract?.category) === "RESIDENTIAL";
  const needsPo = PO_TYPES.includes(form.billing_type) || Boolean(form.po_required);
  const { data: poData, error: poError } = useBilling(companyId && needsPo ? `/pos${qs({ company_id: companyId, status: "ACTIVE" })}` : null);
  const poRows = (poData?.rows || []).filter((p) => p.display_status !== "EXPIRED" || form.po_ids.includes(p.id));
  // When this contract is next billed, and whether its customer can be billed at all (Bill To profile).
  const next = form.status === "ENDED" || form.status === "PAUSED" ? null : nextBilling(form, isNew ? form.start_date : contract?.next_period_start);
  const thisMonthKey = today().slice(0, 7);
  const { data: profile, error: profileError, loading: profileLoading, reload: reloadProfile } = useBilling(companyId ? `/profiles/${encodeURIComponent(companyId)}` : null);
  const customerRow = (customers || []).find((c) => c.company_id === companyId) || null;
  const profileMissing = Boolean(companyId) && !profileLoading && !profile && /no billing profile/i.test(profileError || "");
  const poLabel = (p) => `${p.po_number} · ${p.is_open_po ? "Open PO" : `till ${dmy(p.expiry_date)}`}${p.kind === "ADVANCE" ? " · Advance" : ""}${p.po_amount === null ? "" : ` · ₹${amount(p.po_amount)}`}`;

  function header() {
    return {
      company_id: form.company_id,
      billing_type: form.billing_type,
      frequency_months: form.billing_type === "ONE_TIME" ? null : Number(form.frequency_months) || 1,
      cycle_start_day: form.cycle_start_day || undefined,
      bill_timing: form.bill_timing,
      start_date: form.start_date,
      end_date: form.end_date || null,
      invoice_grouping: form.invoice_grouping,
      site_id: form.site_id || null,
      po_required: PO_TYPES.includes(form.billing_type) ? true : Boolean(form.po_required),
      gst_applicable: form.gst_applicable !== false,
      gst_rate: form.gst_applicable === false ? 18 : Number(form.gst_rate ?? 18),
      ...(needsPo ? { po_ids: form.po_ids } : {}),
      shortfall_billing: form.shortfall_billing,
      description_template: form.description_template?.trim() || undefined,
      notes: form.notes || null,
    };
  }
  const lineBody = (l) => ({
    site_id: l.site_id || (sites.length === 1 ? sites[0].site_id : null), item_name: (l.item_name || "").trim(), item_kind: l.item_kind || "SERVICE",
    invoice_group: (l.invoice_group || "").trim() || null, service_id: l.service_id || null, sac_code: l.item_kind === "CHEMICAL" ? l.sac_code || null : l.sac_code || "998531", pricing_basis: l.pricing_basis, unit: l.unit || "nos",
    rate: l.rate, default_qty: l.default_qty === "" || l.default_qty === null ? null : l.default_qty,
    plan_service_type: l.plan_sub_service ? l.plan_service_type || null : null, plan_sub_service: l.plan_sub_service || null,
    effective_from: l.effective_from || undefined,
  });

  async function save() {
    if (form.gst_applicable !== false && !residential && !GST_RATES.includes(Number(form.gst_rate ?? 18))) {
      setMsg({ error: `GST rate must be one of ${GST_RATES.join(", ")} %.` });
      return;
    }
    if (form.billing_type !== "ONE_TIME" && !form.frequency_months) {
      setMsg({ error: "Choose the billing frequency." });
      return;
    }
    if (!form.description_template?.trim()) {
      setMsg({ error: "Type or choose the description on invoice." });
      return;
    }
    if (form.billing_type === "TERMITE" && !form.po_ids.length) {
      setMsg({ error: "Termite contracts need a purchase order. Choose the purchase order." });
      return;
    }
    setBusy(true);
    setMsg({});
    try {
      if (isNew) {
        const r = await billingPost("/contracts", { ...header(), lines: newLines.filter((l) => l.item_name).map(lineBody) });
        navigate(`/billing/contracts/${r.id}`, { replace: true });
        return;
      }
      await billingPut(`/contracts/${id}`, { ...header(), updated_at: contract.updated_at });
      setEdits(null);
      setMsg({ ok: "Contract saved." });
      reload();
    } catch (err) {
      setMsg({ error: err.message, errors: err.errors });
    } finally {
      setBusy(false);
    }
  }

  async function saveLine(line) {
    setBusy(true);
    setMsg({});
    try {
      if (line.id) await billingPut(`/contracts/${id}/lines/${line.id}`, lineBody(line));
      else await billingPost(`/contracts/${id}/lines`, lineBody(line));
      setLineEdit(null);
      setMsg({ ok: "Price list saved." });
      reload();
    } catch (err) {
      setMsg({ error: err.message });
    } finally {
      setBusy(false);
    }
  }

  if (!isNew && !contract) return error ? <Msg error={error} /> : <div className="ac-card">Loading…</div>;

  const typeIs = (t) => form.billing_type === t;
  const linesShown = isNew ? newLines : contract.lines;
  const sqmMode = typeIs("TERMITE") || linesShown.some(isSqm);
  const cols = sqmMode ? 7 : 5;

  return (
    <div className="ac-page">
      <div className="ac-head">
        <div>
          <div className="ac-crumb"><button type="button" onClick={() => navigate("/billing/contracts")}>Contracts</button> / {isNew ? "New" : contract.contract_code}</div>
          <h1 className="ac-title">{isNew ? "New Contract" : "Edit Contract"} {!isNew && <StatusBadge value={contract.status} />}</h1>
          {!isNew && <p className="ac-sub">{contract.customer} · Next period from {dmy(contract.next_period_start)}{contract.last_invoice_number ? ` · Last invoice ${contract.last_invoice_number}` : ""}</p>}
        </div>
        {canEdit && (
          <div className="ac-actions">
            {!isNew && contract.status === "ACTIVE" && <button type="button" className="ac-btn" onClick={() => setStatusAction("PAUSED")}>Pause</button>}
            {!isNew && contract.status === "PAUSED" && <button type="button" className="ac-btn" onClick={() => setStatusAction("ACTIVE")}>Resume</button>}
            {!isNew && contract.status !== "ENDED" && <button type="button" className="ac-btn" onClick={() => setStatusAction("ENDED")}>End contract</button>}
            {!readOnly && <button type="button" className="ac-btn ac-btn-primary" disabled={busy || (!isNew && !edits)} onClick={save}>{busy ? "Saving…" : isNew ? "Create contract" : "Save contract"}</button>}
          </div>
        )}
      </div>
      <Msg {...msg} />
      {next && (
        <div className="ac-info" style={{ marginBottom: 12 }}>
          {/* one span: the box is a flex row, so loose text and <b> would each become a narrow column */}
          <span>
            ⓘ {isNew ? "First" : "Next"} invoice: <b>{dmy(next.start)} to {dmy(next.end)}</b>, billed {next.advance ? "at the start" : "at the end"} of the period,
            {" "}so it appears in the <b>Bill Run for {monthLabel(next.billMonth)}</b>
            {next.billMonth < thisMonthKey ? " (already due: open this month's Bill Run)" : next.billMonth === thisMonthKey ? " (this month)" : ""}.
          </span>
        </div>
      )}
      {profileMissing && (
        <div className="ac-info error" role="alert" style={{ marginBottom: 12 }}>
          <span>
            ⚠ This customer has no billing details (Bill To address and GST state), so the Bill Run cannot make its invoice.
            {" "}<a href="#billing-details">Fill them in under Billing details</a>.
          </span>
        </div>
      )}

      <div className="ac-card">
        <h3 className="ac-card-title">Contract details</h3>
        <div className="bl-grid g4">
          <Field label="Customer" required>
            {isNew ? (
              <select className="ac-select" value={form.company_id} onChange={(e) => { set({ company_id: e.target.value, site_id: "", po_ids: [] }); setNewLines([emptyLine("", form.billing_type)]); }}>
                <option value="">Choose a customer…</option>
                {(customers || []).map((c) => <option key={c.company_id} value={c.company_id} disabled={!c.category}>{c.name}{!c.category ? " (customer type not set)" : !c.profile_complete ? " (no billing profile)" : ""}</option>)}
              </select>
            ) : <input className="ac-input" readOnly value={contract.customer} />}
          </Field>
          <Field label="Billing type" required className="bl-span2">
            <div className="ac-pills" style={{ width: "100%" }}>
              {TYPES.map(([v, l]) => (
                <button key={v} type="button" disabled={!isNew} className={`ac-pill ${typeIs(v) ? "active" : ""}`} style={{ whiteSpace: "nowrap", padding: "7px 10px" }}
                  onClick={() => {
                    set({ billing_type: v, frequency_months: v === "ONE_TIME" ? null : form.frequency_months || 1, po_required: PO_TYPES.includes(v) ? true : form.po_required });
                    // Untouched lines follow the type (termite: per square metre).
                    if (newLines.every((l) => l.rate === "" && l.default_qty === "")) setNewLines(newLines.map((l) => ({ ...emptyLine(l.site_id, v), key: l.key })));
                  }}>{l}</button>
              ))}
            </div>
          </Field>
          <Field label="Billing frequency" required={typeIs("AMC")}>
            <FrequencySelect value={form.frequency_months} oneTime={typeIs("ONE_TIME")} disabled={readOnly} onChange={(v) => set({ frequency_months: v })} />
          </Field>
          <Field label="Bill date" required>
            <select className="ac-select" value={form.bill_timing} disabled={readOnly} onChange={(e) => set({ bill_timing: e.target.value })}>
              <option value="ADVANCE">Start of the month</option>
              <option value="ARREARS">End of the month</option>
            </select>
          </Field>
          <Field label="Term start date" required>
            <input type="date" className="ac-input" value={form.start_date || ""} disabled={!isNew} onChange={(e) => set({ start_date: e.target.value })} />
          </Field>
          <Field label="Term end date">
            <input type="date" className="ac-input" value={form.end_date || ""} disabled={readOnly} onChange={(e) => set({ end_date: e.target.value })} />
          </Field>
          <Field label="Invoice grouping">
            <select className="ac-select" value={form.invoice_grouping} disabled={readOnly} onChange={(e) => set({ invoice_grouping: e.target.value })}>
              <option value="PER_CUSTOMER">One invoice for the customer</option>
              <option value="PER_SITE">One invoice per outlet</option>
            </select>
          </Field>
          <Field label="Bill structure" hint={form.shortfall_billing === "FULL" ? "The full amount every period, even if a service is missed" : "Billed for the services actually done (amount ÷ planned × done)"}>
            <select className="ac-select" value={form.shortfall_billing} disabled={readOnly} onChange={(e) => set({ shortfall_billing: e.target.value })}>
              <option value="FULL">Fixed amount</option>
              <option value="PRO_RATA">Service based</option>
            </select>
          </Field>
          <Field label="Description on invoice" required className="bl-span2" hint="Type it, or choose a saved one. {month}, {period}, {from_month}, {to_month} are filled in. A new wording is saved for next time.">
            <DescriptionPicker value={form.description_template || ""} disabled={readOnly} onChange={(text) => set({ description_template: text })} />
          </Field>
          <Field label="GST" hint={residential ? "Residential customer: never charged GST" : form.gst_applicable === false ? "Invoices go out without GST" : `${gstHint(form.gst_rate ?? 18, profile?.state_code)}. A change applies to new drafts only.`}>
            <div className="nc-gst">
              <select className="ac-select" value={residential || form.gst_applicable === false ? "NO" : "YES"} disabled={readOnly || residential}
                onChange={(e) => set({ gst_applicable: e.target.value === "YES" })}>
                <option value="YES">Apply GST</option>
                <option value="NO">No GST</option>
              </select>
              {!residential && form.gst_applicable !== false && (
                <span className="nc-rate">
                  <input type="number" min="5" max="28" step="1" className="ac-input" value={form.gst_rate ?? 18} disabled={readOnly} onChange={(e) => set({ gst_rate: e.target.value })} aria-label="GST rate in percent" />
                  <b>%</b>
                </span>
              )}
            </div>
          </Field>
          <Field label="PO required">
            <label className="bl-toggle">
              <input type="checkbox" checked={PO_TYPES.includes(form.billing_type) || Boolean(form.po_required)} disabled={readOnly || PO_TYPES.includes(form.billing_type)} onChange={(e) => set({ po_required: e.target.checked })} />
              {typeIs("CHEMICAL") ? "Always for chemical supply" : typeIs("TERMITE") ? "Always for termite work" : form.po_required ? "Yes" : "No"}
            </label>
          </Field>
          {needsPo && (
            <Field label="Purchase order" required={typeIs("TERMITE")} className="bl-span2"
              hint={!companyId ? "Choose the customer first" : poError ? poError : poData && !poRows.length ? "No purchase orders for this customer. Add one in Purchase Orders." : ""}>
              <select className="ac-select" value={form.po_ids[0] || ""} disabled={readOnly || !companyId}
                onChange={(e) => set({ po_ids: e.target.value ? [e.target.value] : [] })}>
                <option value="">{!companyId ? "Choose the customer first" : !poData ? "Loading…" : "Choose a purchase order…"}</option>
                {poRows.map((p) => {
                  const other = p.contract_id && p.contract_id !== id;
                  return <option key={p.id} value={p.id} disabled={Boolean(other)}>{poLabel(p)}{other ? ` (used by ${p.contract_code})` : ""}</option>;
                })}
              </select>
            </Field>
          )}
          <Field label="Notes" className={needsPo ? "bl-span2" : "bl-span4"}>
            <input className="ac-input" value={form.notes || ""} disabled={readOnly} maxLength={1000} onChange={(e) => set({ notes: e.target.value })} />
          </Field>
        </div>
      </div>

      {!isNew && customerRow && <BillingProfileCard customer={customerRow} canEdit={canEdit} onSaved={reloadProfile} />}

      <div className="ac-card">
        <div className="ac-tabs bl-tabs">
          <button type="button" className={`ac-tab ${tab === "prices" ? "active" : ""}`} onClick={() => setTab("prices")}>Price list</button>
          {!isNew && <button type="button" className={`ac-tab ${tab === "history" ? "active" : ""}`} onClick={() => setTab("history")}>Price history ({contract.price_history.length})</button>}
        </div>

        {tab === "prices" && (
          <>
            <div className="ac-card-head">
              <span className="ac-sub" style={{ fontSize: 13 }}>
                {typeIs("TERMITE") ? "Set this customer's rate per sq. m and the treated area. Amount = rate × area. Excluding GST." : `Set this customer's amount for each service. ${residential || form.gst_applicable === false ? "No GST is added." : "Excluding GST (18% is added on the invoice)."}`}
              </span>
              {!readOnly && companyId && (
                <div className="ac-actions">
                  <button type="button" className="ac-btn sm ac-btn-primary" onClick={() => (isNew
                    ? setNewLines([...newLines.filter((l) => l.item_name || l.rate !== ""), ...(sites.length > 1 ? sites.map((x) => emptyLine(x.site_id, form.billing_type)) : [emptyLine(sites[0]?.site_id || "", form.billing_type)])])
                    : setLineEdit(emptyLine(sites.length === 1 ? sites[0].site_id : "", form.billing_type)))}>+ Add service</button>
                  <button type="button" className="ac-btn sm" onClick={() => (isNew
                    ? setNewLines([...newLines.filter((l) => l.item_name || l.rate !== ""), emptyLine(sites.length === 1 ? sites[0].site_id : "", "", "CHEMICAL")])
                    : setLineEdit(emptyLine(sites.length === 1 ? sites[0].site_id : "", "", "CHEMICAL")))}>+ Add chemical</button>
                </div>
              )}
            </div>
            <div className="ac-table-wrap">
              <table className="ac-table ac-stack bl-prices">
                <colgroup>
                  <col style={{ width: "22%" }} />
                  <col />
                  {sqmMode && <col style={{ width: 150 }} />}
                  {sqmMode && <col style={{ width: 150 }} />}
                  <col style={{ width: 170 }} />
                  <col style={{ width: 130 }} />
                  <col style={{ width: 190 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Outlet</th>
                    <th>Service / chemical</th>
                    {sqmMode && <th className="ac-num">Rate per sq. m (₹)</th>}
                    {sqmMode && <th className="ac-num">Area (sq. m)</th>}
                    <th className="ac-num">Amount (₹)</th>
                    <th>Valid from</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {!companyId && <EmptyRow cols={cols} text="Choose the customer first" />}
                  {companyId && !linesShown.length && <EmptyRow cols={cols} text="No services priced yet. Use + Add service." />}
                  {companyId && isNew && newLines.map((l) => (
                    <LineRow key={l.key} line={l} sqmMode={sqmMode} sites={sites} groups={serviceGroups} catalog={catalog} onChange={(patch) => setNewLines(newLines.map((x) => (x.key === l.key ? { ...x, ...patch } : x)))} onRemove={newLines.length > 1 ? () => setNewLines(newLines.filter((x) => x.key !== l.key)) : null} />
                  ))}
                  {!isNew && contract.lines.map((l) => (lineEdit?.id === l.id ? (
                    <LineRow key={l.id} line={lineEdit} sqmMode={sqmMode} sites={sites} groups={serviceGroups} catalog={catalog} onChange={(patch) => setLineEdit({ ...lineEdit, ...patch })} fixedRate onSave={() => saveLine(lineEdit)} onCancel={() => setLineEdit(null)} busy={busy} />
                  ) : (
                    <tr key={l.id}>
                      <td>{l.site || "All outlets"}</td>
                      <td>
                        {l.item_name}
                        {l.item_kind === "CHEMICAL" && <> <span className="ac-badge b-teal">Chemical</span></>}
                        {l.invoice_group && <div className="bl-sub">Printed as “{l.invoice_group}”</div>}
                      </td>
                      {sqmMode && <td className="bl-num">{isSqm(l) ? amount(l.rate) : "—"}</td>}
                      {sqmMode && <td className="bl-num">{isSqm(l) ? l.default_qty ?? "—" : "—"}</td>}
                      <td className="bl-num"><b>{amount(isSqm(l) ? lineTotal(l) ?? 0 : Number(l.rate) * (Number(l.default_qty) || 1))}</b></td>
                      <td>
                        {dmy(l.effective_from)}
                        {l.effective_from > today() && <div><span className="ac-badge b-amber">Upcoming</span></div>}
                        {l.effective_to && <div className="bl-sub">till {dmy(l.effective_to)}</div>}
                      </td>
                      <td>
                        {!readOnly && !l.effective_to && (
                          <div className="ac-actions" style={{ justifyContent: "flex-end" }}>
                            <button type="button" className="ac-btn sm" onClick={() => setLineEdit({ ...l, default_qty: l.default_qty ?? "" })}>Edit</button>
                            <button type="button" className="ac-btn sm" onClick={() => setRepricing(l)}>Change price</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )))}
                  {!isNew && lineEdit && !lineEdit.id && (
                    <LineRow line={lineEdit} sqmMode={sqmMode} sites={sites} groups={serviceGroups} catalog={catalog} onChange={(patch) => setLineEdit({ ...lineEdit, ...patch })} onSave={() => saveLine(lineEdit)} onCancel={() => setLineEdit(null)} busy={busy} />
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "history" && !isNew && (
          <table className="ac-table ac-stack">
            <thead><tr><th>Outlet</th><th>Item</th><th className="ac-num">Rate (₹)</th><th>From</th><th>To</th></tr></thead>
            <tbody>
              {!contract.price_history.length ? <EmptyRow cols={5} text="No earlier prices" /> : contract.price_history.map((l) => (
                <tr key={l.id}><td>{l.site || "—"}</td><td>{l.item_name}</td><td className="bl-num">{amount(l.rate)}</td><td>{dmy(l.effective_from)}</td><td>{dmy(l.effective_to)}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {repricing && <RepriceDialog line={repricing} contractId={id} onClose={() => setRepricing(null)} onDone={() => { setRepricing(null); setMsg({ ok: "New price saved. The old price stays on earlier invoices." }); reload(); }} />}
      {statusAction && <StatusDialog contract={contract} status={statusAction} onClose={() => setStatusAction(null)} onDone={() => { setStatusAction(null); reload(); }} />}
    </div>
  );
}

/** Pest control, deep cleaning (the booking list), then other names used on this customer's jobs or quotations. */
function buildServiceGroups(jobServices, catalog) {
  const seen = new Set();
  const take = (names) => names.filter((n) => {
    const k = String(n || "").trim().toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return [
    ["Pest control", take(pestServices)],
    ["Deep cleaning", take(deepCleaningServices)],
    ["Other", take([...jobServices.map((x) => x.sub_service), ...catalog.map((c) => c.name)]).sort((x, y) => x.localeCompare(y))],
  ].filter(([, names]) => names.length);
}

function LineRow({ line, sqmMode, sites, groups, catalog, onChange, onRemove, onSave, onCancel, busy, fixedRate = false }) {
  const same = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
  const { data: chemicals } = useBilling(line.item_kind === "CHEMICAL" ? "/chemicals" : null);
  const sqm = isSqm(line);
  const known = groups.some(([, names]) => names.some((n) => same(n, line.item_name)));
  // The service name also links the line to the customer's service plan (same outlet and service),
  // so the invoice follows the services actually done.
  // The outlet comes from the customer: its only outlet, or the outlet this row was added for.
  const siteId = line.site_id || (sites.length === 1 ? sites[0].site_id : "");
  const outletName = sites.find((x) => x.site_id === siteId)?.name || line.site || (sites.length ? "All outlets" : "—");
  // Without an outlet the line follows the customer's whole-customer plan for the same service.
  const link = (name) => ({ plan_service_type: "", plan_sub_service: name || "" });
  function pick(name) {
    const svc = catalog.find((c) => same(c.name, name));
    onChange({ item_name: name, service_id: svc?.id || null, site_id: siteId || null, ...link(name) });
  }
  const total = sqm ? lineTotal(line) : line.rate === "" ? null : Number(line.rate) * (Number(line.default_qty) || 1);
  const rateInput = (label) => (fixedRate
    ? <span className="ac-sub" title="Use Change price to change the amount from a date">{amount(line.rate)}</span>
    : <input type="number" min="0" step="0.01" className="bl-cell-input num" value={line.rate} placeholder="0.00" onChange={(e) => onChange({ rate: e.target.value })} aria-label={label} />);
  return (
    <tr className="bl-sel bl-price-edit">
      <td>
        <span className="bl-outlet">{outletName}</span>
      </td>
      <td>
        {line.item_kind === "CHEMICAL" ? (
          <>
            <input className="bl-cell-input" list="cf-chemicals" value={line.item_name || ""} maxLength={255} placeholder="Type or choose the chemical" onChange={(e) => onChange({ item_name: e.target.value, plan_service_type: "", plan_sub_service: "" })} aria-label="Chemical" />
            <datalist id="cf-chemicals">{(chemicals || []).map((c) => <option key={c} value={c} />)}</datalist>
          </>
        ) : (
          <select className="bl-cell-input" value={line.item_name || ""} onChange={(e) => pick(e.target.value)} aria-label="Service">
            <option value="">Choose a service…</option>
            {groups.map(([label, names]) => (
              <optgroup key={label} label={label}>
                {names.map((n) => <option key={n} value={n}>{n}</option>)}
              </optgroup>
            ))}
            {line.item_name && !known && <option value={line.item_name}>{line.item_name}</option>}
          </select>
        )}
        {/* Lines with the same summary print as ONE invoice line (this text, their total). */}
        <input className="bl-cell-input" style={{ marginTop: 6 }} value={line.invoice_group || ""} maxLength={255} placeholder="Invoice line summary (optional)" title="Lines with the same summary print as one invoice line" onChange={(e) => onChange({ invoice_group: e.target.value })} aria-label="Invoice line summary" />
      </td>
      {sqmMode && <td>{sqm ? rateInput("Rate per square metre") : <span className="ac-sub">—</span>}</td>}
      {sqmMode && (
        <td>
          {sqm ? <input type="number" min="0" step="0.01" className="bl-cell-input num" value={line.default_qty ?? ""} placeholder="sq. m" onChange={(e) => onChange({ default_qty: e.target.value })} aria-label="Area in square metres" />
            : <span className="ac-sub">—</span>}
        </td>
      )}
      <td className="bl-num">{sqm ? <b>{total === null ? "—" : amount(total)}</b> : rateInput("Amount")}</td>
      <td>{line.effective_from ? dmy(line.effective_from) : <span className="ac-sub">From start</span>}</td>
      <td>
        {onSave ? (
          <div className="ac-actions" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="ac-btn sm ac-btn-primary" disabled={busy || !line.item_name || line.rate === "" || (sqm && !line.default_qty)} onClick={onSave}>Save</button>
            <button type="button" className="ac-btn sm" onClick={onCancel}>Cancel</button>
          </div>
        ) : onRemove ? <div style={{ textAlign: "right" }}><button type="button" className="bl-x" style={{ fontSize: 15 }} onClick={onRemove} aria-label="Remove">✕</button></div> : null}
      </td>
    </tr>
  );
}

function RepriceDialog({ line, contractId, onClose, onDone }) {
  const [rate, setRate] = useState(line.rate);
  const [from, setFrom] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    setError("");
    try {
      await billingPut(`/contracts/${contractId}/lines/${line.id}`, { rate, effective_from: from });
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }
  return (
    <Modal onClose={onClose} narrow label="Change price">
      <div className="bl-m-head"><div><h3>Change price</h3><div className="ac-sub">{line.item_name}{line.site ? ` · ${line.site}` : ""} · now ₹{amount(line.rate)} from {dmy(line.effective_from)}</div></div><button type="button" className="bl-x" onClick={onClose} aria-label="Close">✕</button></div>
      <div className="bl-m-body">
        <div className="bl-grid g2">
          <Field label="New rate (₹, excl. GST)" required><input type="number" min="0" step="0.01" className="ac-input" value={rate} onChange={(e) => setRate(e.target.value)} /></Field>
          <Field label="Starts on" required hint="The current price ends the day before."><input type="date" className="ac-input" min={line.effective_from} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        </div>
        <Msg error={error} />
      </div>
      <div className="bl-m-foot"><span /><div className="ac-actions"><button type="button" className="ac-btn" onClick={onClose}>Cancel</button><button type="button" className="ac-btn ac-btn-primary" disabled={busy || !from || rate === "" || Number(rate) === Number(line.rate)} onClick={submit}>Save new price</button></div></div>
    </Modal>
  );
}

function StatusDialog({ contract, status, onClose, onDone }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const verb = { PAUSED: "Pause", ACTIVE: "Resume", ENDED: "End" }[status];
  async function submit() {
    try {
      await billingPost(`/contracts/${contract.id}/status`, { status, reason });
      onDone();
    } catch (err) {
      setError(err.message);
    }
  }
  return (
    <Modal onClose={onClose} narrow label={`${verb} contract`}>
      <div className="bl-m-head"><div><h3>{verb} contract {contract.contract_code}?</h3><div className="ac-sub">{status === "ENDED" ? "An ended contract is no longer billed and cannot be restarted." : status === "PAUSED" ? "A paused contract is left out of the Bill Run until it is resumed." : "The contract will be billed again from its next period."}</div></div><button type="button" className="bl-x" onClick={onClose} aria-label="Close">✕</button></div>
      <div className="bl-m-body">
        <Field label="Reason"><input className="ac-input" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} /></Field>
        <Msg error={error} />
      </div>
      <div className="bl-m-foot"><span /><div className="ac-actions"><button type="button" className="ac-btn" onClick={onClose}>Back</button><button type="button" className="ac-btn ac-btn-primary" onClick={submit}>{verb} contract</button></div></div>
    </Modal>
  );
}

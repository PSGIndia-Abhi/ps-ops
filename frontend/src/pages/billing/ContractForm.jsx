import { useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import { EmptyRow } from "../accountant/ui";
import { billingPost, billingPut, qs, useBilling } from "./billingApi";
import { amount, dmy, today } from "./format";
import { Field, Modal, Msg, StatusBadge } from "./ui";

// A contract and its price list. New: header + lines in one save. Existing: the header is saved on
// its own; price lines are added, corrected, or re-priced from a date (the old price is kept as history).

const TYPES = [["AMC", "AMC"], ["ONE_TIME", "One-time"], ["TERMITE", "Termite"], ["CHEMICAL", "Chemical"]];
const BASES = [["FIXED", "Fixed"], ["PER_SERVICE", "Per service"], ["PER_UNIT", "Per unit"]];
const BASIS_CLASS = { FIXED: "b-blue", PER_SERVICE: "b-purple", PER_UNIT: "b-teal" };
const PLACEHOLDERS = ["{month}", "{period}", "{from_month}", "{to_month}"];

const emptyLine = (siteId = "") => ({ key: `n${Date.now()}${Math.random()}`, site_id: siteId, item_name: "", sac_code: "998531", pricing_basis: "FIXED", unit: "Month", rate: "", default_qty: "", plan_service_type: "", plan_sub_service: "" });

export default function ContractForm() {
  const { id } = useParams();
  const isNew = id === "new";
  const { me } = useOutletContext();
  const canEdit = me.can("MANAGE_BILLING_MASTERS");
  const navigate = useNavigate();
  const { data: contract, error, reload } = useBilling(isNew ? null : `/contracts/${id}`);
  const { data: customers } = useBilling(isNew ? "/customers" : null);
  const [edits, setEdits] = useState(null);
  const [newLines, setNewLines] = useState([emptyLine()]);
  const [tab, setTab] = useState("prices");
  const [msg, setMsg] = useState({});
  const [busy, setBusy] = useState(false);
  const [statusAction, setStatusAction] = useState(null);
  const [repricing, setRepricing] = useState(null);
  const [lineEdit, setLineEdit] = useState(null); // line being corrected or added

  const base = contract || { billing_type: "AMC", frequency_months: 1, bill_timing: "ARREARS", invoice_grouping: "PER_CUSTOMER", po_required: false, shortfall_billing: "PRO_RATA", start_date: today(), description_template: "", company_id: "" };
  const form = edits || base;
  const set = (patch) => setEdits({ ...form, ...patch });
  const companyId = form.company_id;
  const { data: options } = useBilling(companyId ? `/service-options${qs({ company_id: companyId })}` : null);
  const sites = options?.sites || [];
  const services = options?.services || [];
  const readOnly = !canEdit || form.status === "ENDED";

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
      po_required: form.billing_type === "CHEMICAL" ? true : Boolean(form.po_required),
      shortfall_billing: form.shortfall_billing,
      description_template: form.description_template || undefined,
      notes: form.notes || null,
    };
  }
  const lineBody = (l) => ({
    site_id: l.site_id || null, item_name: l.item_name, sac_code: l.sac_code || null, pricing_basis: l.pricing_basis, unit: l.unit || "nos",
    rate: l.rate, default_qty: l.default_qty === "" || l.default_qty === null ? null : l.default_qty,
    plan_service_type: l.plan_sub_service ? l.plan_service_type || null : null, plan_sub_service: l.plan_sub_service || null,
    effective_from: l.effective_from || undefined,
  });

  async function save() {
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

      <div className="ac-card">
        <h3 className="ac-card-title">Contract details</h3>
        <div className="bl-grid g4">
          <Field label="Customer" required>
            {isNew ? (
              <select className="ac-select" value={form.company_id} onChange={(e) => { set({ company_id: e.target.value, site_id: "" }); setNewLines([emptyLine()]); }}>
                <option value="">Choose a customer…</option>
                {(customers || []).map((c) => <option key={c.company_id} value={c.company_id} disabled={!c.category}>{c.name}{!c.category ? " (customer type not set)" : !c.profile_complete ? " (no billing profile)" : ""}</option>)}
              </select>
            ) : <input className="ac-input" readOnly value={contract.customer} />}
          </Field>
          <Field label="Billing type" required>
            <div className="ac-pills" style={{ width: "100%" }}>
              {TYPES.map(([v, l]) => (
                <button key={v} type="button" disabled={!isNew} className={`ac-pill ${typeIs(v) ? "active" : ""}`} style={{ whiteSpace: "nowrap", padding: "7px 10px" }}
                  onClick={() => set({ billing_type: v, frequency_months: v === "ONE_TIME" ? null : form.frequency_months || 1, po_required: v === "CHEMICAL" ? true : form.po_required })}>{l}</button>
              ))}
            </div>
          </Field>
          <Field label="Frequency" required={typeIs("AMC")}>
            <select className="ac-select" value={form.frequency_months || ""} disabled={readOnly || typeIs("ONE_TIME")} onChange={(e) => set({ frequency_months: Number(e.target.value) })}>
              {typeIs("ONE_TIME") && <option value="">Once</option>}
              {[1, 3, 4, 6, 12].map((n) => <option key={n} value={n}>Every {n} month{n > 1 ? "s" : ""}</option>)}
            </select>
          </Field>
          <Field label="Bill timing" required>
            <select className="ac-select" value={form.bill_timing} disabled={readOnly} onChange={(e) => set({ bill_timing: e.target.value })}>
              <option value="ARREARS">In arrears (end of period)</option>
              <option value="ADVANCE">In advance (start of period)</option>
            </select>
          </Field>
          <Field label="Start date" required>
            <input type="date" className="ac-input" value={form.start_date || ""} disabled={!isNew} onChange={(e) => set({ start_date: e.target.value })} />
          </Field>
          <Field label="End date">
            <input type="date" className="ac-input" value={form.end_date || ""} disabled={readOnly} onChange={(e) => set({ end_date: e.target.value })} />
          </Field>
          <Field label="Invoice grouping">
            <select className="ac-select" value={form.invoice_grouping} disabled={readOnly} onChange={(e) => set({ invoice_grouping: e.target.value })}>
              <option value="PER_CUSTOMER">One invoice for the customer</option>
              <option value="PER_SITE">One invoice per outlet</option>
            </select>
          </Field>
          <Field label="When services are short">
            <select className="ac-select" value={form.shortfall_billing} disabled={readOnly} onChange={(e) => set({ shortfall_billing: e.target.value })}>
              <option value="PRO_RATA">Bill services done</option>
              <option value="FULL">Bill full amount</option>
            </select>
          </Field>
          <Field label="Description on invoice" className="bl-span3">
            <input className="ac-input" value={form.description_template || ""} disabled={readOnly} maxLength={500} placeholder={typeIs("ONE_TIME") ? "Pest control service carried out on {period}" : "Pest control services for the month of {month}"} onChange={(e) => set({ description_template: e.target.value })} />
            {!readOnly && <div className="bl-chipbar">{PLACEHOLDERS.map((p) => <button key={p} type="button" className="bl-chip" onClick={() => set({ description_template: `${form.description_template || ""}${p}` })}>{p}</button>)}</div>}
          </Field>
          <Field label="PO required">
            <label className="bl-toggle">
              <input type="checkbox" checked={typeIs("CHEMICAL") || Boolean(form.po_required)} disabled={readOnly || typeIs("CHEMICAL")} onChange={(e) => set({ po_required: e.target.checked })} />
              {typeIs("CHEMICAL") ? "Always for chemical supply" : form.po_required ? "Yes" : "No"}
            </label>
          </Field>
          <Field label="Notes" className="bl-span4">
            <input className="ac-input" value={form.notes || ""} disabled={readOnly} maxLength={1000} onChange={(e) => set({ notes: e.target.value })} />
          </Field>
        </div>
      </div>

      <div className="ac-card">
        <div className="ac-tabs bl-tabs">
          <button type="button" className={`ac-tab ${tab === "prices" ? "active" : ""}`} onClick={() => setTab("prices")}>Price list</button>
          {!isNew && <button type="button" className={`ac-tab ${tab === "history" ? "active" : ""}`} onClick={() => setTab("history")}>Price history ({contract.price_history.length})</button>}
        </div>

        {tab === "prices" && (
          <>
            <div className="ac-card-head">
              <span className="ac-sub" style={{ fontSize: 13 }}>Rates are excluding GST. Link a line to a planned service so the invoice uses the services done.</span>
              {!readOnly && companyId && (
                <div className="ac-actions">
                  {isNew && sites.length > 1 && <button type="button" className="ac-btn sm" onClick={() => setNewLines([...newLines.filter((l) => l.item_name), ...sites.map((s) => emptyLine(s.site_id))])}>Add all outlets</button>}
                  <button type="button" className="ac-btn sm ac-btn-primary" onClick={() => (isNew ? setNewLines([...newLines, emptyLine(sites.length === 1 ? sites[0].site_id : "")]) : setLineEdit(emptyLine(sites.length === 1 ? sites[0].site_id : "")))}>+ Add line</button>
                </div>
              )}
            </div>
            <div className="ac-table-wrap">
              <table className="ac-table ac-stack">
                <thead>
                  <tr><th>Outlet</th><th>Item text</th><th>Pricing basis</th><th>Unit</th><th className="ac-num">Rate (₹)</th><th className="ac-num">Default qty</th><th>Planned service</th><th>Valid from</th><th /></tr>
                </thead>
                <tbody>
                  {!companyId && <EmptyRow cols={9} text="Choose the customer first" />}
                  {companyId && !linesShown.length && <EmptyRow cols={9} text="No price lines" />}
                  {companyId && isNew && newLines.map((l) => (
                    <LineRow key={l.key} line={l} sites={sites} services={services} onChange={(patch) => setNewLines(newLines.map((x) => (x.key === l.key ? { ...x, ...patch } : x)))} onRemove={newLines.length > 1 ? () => setNewLines(newLines.filter((x) => x.key !== l.key)) : null} />
                  ))}
                  {!isNew && contract.lines.map((l) => (lineEdit?.id === l.id ? (
                    <LineRow key={l.id} line={lineEdit} sites={sites} services={services} onChange={(patch) => setLineEdit({ ...lineEdit, ...patch })} fixedRate onSave={() => saveLine(lineEdit)} onCancel={() => setLineEdit(null)} busy={busy} />
                  ) : (
                    <tr key={l.id}>
                      <td>{l.site || "All outlets"}</td>
                      <td>{l.item_name}{l.sac_code && <div className="bl-sub">SAC {l.sac_code}</div>}</td>
                      <td><span className={`ac-badge ${BASIS_CLASS[l.pricing_basis]}`}>{BASES.find(([v]) => v === l.pricing_basis)?.[1]}</span></td>
                      <td>{l.unit}</td>
                      <td className="bl-num">{amount(l.rate)}</td>
                      <td className="bl-num">{l.pricing_basis === "PER_SERVICE" && l.plan_sub_service ? "from jobs" : l.default_qty ?? "—"}</td>
                      <td>{l.plan_sub_service || <span className="ac-sub">—</span>}</td>
                      <td>
                        {dmy(l.effective_from)}
                        {l.effective_from > today() && <div><span className="ac-badge b-amber">Upcoming</span></div>}
                        {l.effective_to && <div className="bl-sub">till {dmy(l.effective_to)}</div>}
                      </td>
                      <td>
                        {!readOnly && !l.effective_to && (
                          <div className="ac-actions">
                            <button type="button" className="ac-btn sm" onClick={() => setLineEdit({ ...l, rate: l.rate, default_qty: l.default_qty ?? "", plan_service_type: l.plan_service_type || "", plan_sub_service: l.plan_sub_service || "" })}>Edit</button>
                            <button type="button" className="ac-btn sm" onClick={() => setRepricing(l)}>Change price</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )))}
                  {!isNew && lineEdit && !lineEdit.id && (
                    <LineRow line={lineEdit} sites={sites} services={services} onChange={(patch) => setLineEdit({ ...lineEdit, ...patch })} onSave={() => saveLine(lineEdit)} onCancel={() => setLineEdit(null)} busy={busy} />
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

function LineRow({ line, sites, services, onChange, onRemove, onSave, onCancel, busy, fixedRate = false }) {
  return (
    <tr className="bl-sel">
      <td>
        <select className="bl-cell-input" value={line.site_id || ""} onChange={(e) => onChange({ site_id: e.target.value })} aria-label="Outlet">
          <option value="">All outlets</option>
          {sites.map((s) => <option key={s.site_id} value={s.site_id}>{s.name}</option>)}
        </select>
      </td>
      <td>
        <input className="bl-cell-input" value={line.item_name} placeholder="Item text *" onChange={(e) => onChange({ item_name: e.target.value })} aria-label="Item text" />
        <input className="bl-cell-input" style={{ marginTop: 4 }} value={line.sac_code || ""} placeholder="SAC" onChange={(e) => onChange({ sac_code: e.target.value })} aria-label="SAC" />
      </td>
      <td>
        <select className="bl-cell-input" value={line.pricing_basis} onChange={(e) => onChange({ pricing_basis: e.target.value, unit: e.target.value === "PER_SERVICE" ? "Service" : e.target.value === "PER_UNIT" ? "sqm" : "Month" })} aria-label="Pricing basis">
          {BASES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </td>
      <td><input className="bl-cell-input" style={{ width: 80 }} value={line.unit || ""} onChange={(e) => onChange({ unit: e.target.value })} aria-label="Unit" /></td>
      <td>
        {fixedRate ? <span className="ac-sub" title="Use Change price to change the rate from a date">{amount(line.rate)}</span>
          : <input type="number" min="0" step="0.01" className="bl-cell-input num" style={{ width: 110 }} value={line.rate} onChange={(e) => onChange({ rate: e.target.value })} aria-label="Rate" />}
      </td>
      <td><input type="number" min="0" step="0.001" className="bl-cell-input num" style={{ width: 90 }} value={line.default_qty ?? ""} placeholder={line.pricing_basis === "PER_SERVICE" ? "from jobs" : ""} onChange={(e) => onChange({ default_qty: e.target.value })} aria-label="Default quantity" /></td>
      <td>
        <select className="bl-cell-input" value={line.plan_sub_service ? `${line.plan_service_type || ""}|${line.plan_sub_service}` : ""} disabled={!line.site_id}
          title={line.site_id ? "" : "Choose the outlet to link a planned service"}
          onChange={(e) => {
            const [t, s] = e.target.value.split("|");
            onChange({ plan_service_type: s ? t : "", plan_sub_service: s || "" });
          }} aria-label="Planned service">
          <option value="">Not linked</option>
          {services.map((s) => <option key={`${s.service_type}|${s.sub_service}`} value={`${s.service_type}|${s.sub_service}`}>{s.sub_service}</option>)}
          {line.plan_sub_service && !services.some((s) => s.sub_service === line.plan_sub_service) && <option value={`${line.plan_service_type || ""}|${line.plan_sub_service}`}>{line.plan_sub_service}</option>}
        </select>
      </td>
      <td>{line.effective_from ? dmy(line.effective_from) : <span className="ac-sub">From start</span>}</td>
      <td>
        {onSave ? (
          <div className="ac-actions">
            <button type="button" className="ac-btn sm ac-btn-primary" disabled={busy || !line.item_name || line.rate === ""} onClick={onSave}>Save</button>
            <button type="button" className="ac-btn sm" onClick={onCancel}>Cancel</button>
          </div>
        ) : onRemove ? <button type="button" className="bl-x" style={{ fontSize: 15 }} onClick={onRemove} aria-label="Remove">✕</button> : null}
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

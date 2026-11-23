import { useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import {
  FiAlertCircle, FiCalendar, FiCheck, FiClock, FiDroplet, FiEdit2, FiFileText, FiHash, FiLayers, FiList, FiPause, FiPercent,
  FiPlay, FiPlusCircle, FiRepeat, FiSliders, FiXCircle,
} from "react-icons/fi";
import { LuIndianRupee } from "react-icons/lu";
import { EmptyRow } from "../accountant/ui";
import { billingPost, billingPut, qs, useBilling } from "./billingApi";
import { GST_RATES, gstHint } from "./calc";
import BillingProfileCard from "./BillingProfileCard";
import DescriptionPicker from "./DescriptionPicker";
import FrequencySelect from "./FrequencySelect";
import InvoiceDelivery from "./InvoiceDelivery";
import { TERMITE_UNITS, TYPE_LABEL, amount, dmy, frequencyText, initials, isOnce, monthLabel, nextBilling, rupees, shortDate, today, unitOf } from "./format";
import { Field, Modal, Msg, StatusBadge, BackButton } from "./ui";
import { deepCleaningServices, pestServices } from "../../components/CreateBookingModal";
import { PageSkeleton } from "./Skeletons";

// A contract and its price list. New: header + lines in one save. Existing: the header is saved on
// its own; price lines are added, corrected, or re-priced from a date (the old price is kept as history).

const TYPES = [["AMC", "AMC"], ["ONE_TIME", "One-time"], ["TERMITE", "Termite"], ["CHEMICAL", "Chemical"]];

const PO_TYPES = ["CHEMICAL", "TERMITE"]; // always billed against a PO
const SQM = "sq.m";
const SQFT = "sq.ft";
// Termite bill structure: priced per square metre or per square foot of treated area (the line's unit)
const AREA_UNITS = [[SQM, "Square metre (sq. m)"], [SQFT, "Square feet (sq. ft)"]];

const emptyLine = (siteId = "", type = "", kind = "SERVICE") => ({
  key: `n${Date.now()}${Math.random()}`, site_id: siteId, sac_code: kind === "CHEMICAL" ? "" : "998531", rate: "", default_qty: "", plan_service_type: "", plan_sub_service: "",
  item_kind: kind, invoice_group: "",
  // Termite work is priced per square metre or square foot (Bill structure): area x rate, set for each customer.
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
  const [tab, setTab] = useState("details");
  const [msg, setMsg] = useState({});
  const [busy, setBusy] = useState(false);
  const [statusAction, setStatusAction] = useState(null);
  const [lineEdit, setLineEdit] = useState(null); // line being added
  const [bulk, setBulk] = useState(null); // Edit: every current line editable at once ({ [line id]: edited line })

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
  const next = form.status === "ENDED" || form.status === "PAUSED" ? null : nextBilling(form, isNew ? form.start_date : form.next_period_start || contract?.next_period_start);
  // The next billing date can be moved only while nothing is drafted or issued on the contract.
  const nextEditable = !isNew && Boolean(contract?.next_period_editable) && !readOnly;
  const thisMonthKey = today().slice(0, 7);
  const { data: profile, error: profileError, loading: profileLoading, reload: reloadProfile } = useBilling(companyId ? `/profiles/${encodeURIComponent(companyId)}` : null);
  const customerRow = (customers || []).find((c) => c.company_id === companyId) || null;
  // A group based contract is billed to the group's Bill To: its main company's own profile is not needed.
  const groupContract = contract?.contract_kind === "GROUP";
  const profileMissing = !groupContract && Boolean(companyId) && !profileLoading && !profile && /no billing profile/i.test(profileError || "");
  const groupBillToMissing = groupContract && contract.group_bill_to_complete === false;
  const poLabel = (p) => `${p.po_number} · ${p.is_open_po ? "Open PO" : `till ${dmy(p.expiry_date)}`}${p.kind === "ADVANCE" ? " · Advance" : ""}${p.po_amount === null ? "" : ` · ₹${amount(p.po_amount)}`}`;

  function header() {
    return {
      company_id: form.company_id,
      billing_type: form.billing_type,
      // One-time, and Termite billed once (no frequency), have none.
      frequency_months: form.billing_type === "ONE_TIME" || isOnce(form) ? null : Number(form.frequency_months) || 1,
      frequency_unit: unitOf(form),
      cycle_start_day: form.cycle_start_day || undefined,
      bill_timing: form.bill_timing,
      start_date: form.start_date,
      end_date: form.end_date || null,
      ...(nextEditable && form.next_period_start && form.next_period_start !== contract.next_period_start ? { next_period_start: form.next_period_start } : {}),
      invoice_grouping: form.invoice_grouping,
      site_id: form.site_id || null,
      po_required: PO_TYPES.includes(form.billing_type) ? true : Boolean(form.po_required),
      gst_applicable: form.gst_applicable !== false,
      gst_rate: form.gst_applicable === false ? 18 : Number(form.gst_rate ?? 18),
      ...(needsPo ? { po_ids: form.po_ids } : {}),
      shortfall_billing: form.shortfall_billing,
      description_template: form.description_template?.trim() || undefined,
      // services and chemicals on two invoices each period; the chemical one has its own description
      separate_bills: Boolean(form.separate_bills),
      chemical_description_template: form.separate_bills ? form.chemical_description_template?.trim() || null : null,
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
    if (!isOnce(form) && !form.frequency_months) {
      setMsg({ error: "Choose the billing frequency." });
      return;
    }
    if (!form.description_template?.trim()) {
      setMsg({ error: "Type or choose the description on invoice." });
      return;
    }
    if (form.separate_bills && !form.chemical_description_template?.trim()) {
      setMsg({ error: "Type or choose the description for the chemical bill." });
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

  const lineChanged = (orig, l) => l && (String(l.item_name || "").trim() !== orig.item_name
    || Number(l.default_qty || 0) !== Number(orig.default_qty || 0) || Number(l.rate) !== Number(orig.rate));
  function startEdit() {
    setLineEdit(null);
    setMsg({});
    setBulk(Object.fromEntries(contract.lines.filter((l) => !l.effective_to).map((l) => [l.id, { ...l, default_qty: l.default_qty ?? "" }])));
  }
  async function saveAllLines() {
    const changed = contract.lines.filter((o) => !o.effective_to && lineChanged(o, bulk[o.id])).map((o) => ({ orig: o, line: bulk[o.id] }));
    if (!changed.length) { setBulk(null); return; }
    const empty = changed.find(({ line }) => !String(line.item_name || "").trim() || line.rate === "");
    if (empty) { setMsg({ error: "Each line needs its name and rate." }); return; }
    const noDate = changed.find(({ orig, line }) => Number(line.rate) !== Number(orig.rate) && !line.price_from);
    if (noDate) { setMsg({ error: `Choose the date the new rate starts from for ${noDate.line.item_name}.` }); return; }
    setBusy(true);
    setMsg({});
    let done = 0;
    try {
      for (const { orig, line } of changed) {
        const body = lineBody(line);
        const repriced = Number(line.rate) !== Number(orig.rate);
        await billingPut(`/contracts/${id}/lines/${orig.id}`, { ...body, effective_from: repriced ? line.price_from : body.effective_from });
        done += 1;
      }
      setBulk(null);
      setMsg({ ok: `${done} line${done === 1 ? "" : "s"} saved.${changed.some(({ orig, line }) => Number(line.rate) !== Number(orig.rate)) ? " New rates apply from their dates; earlier invoices keep the old rates." : ""}` });
      reload();
    } catch (err) {
      setMsg({ error: done ? `${done} line(s) saved, then: ${err.message}` : err.message });
      if (done) reload();
    } finally {
      setBusy(false);
    }
  }

  async function saveLine(line) {
    const orig = line.id ? contract.lines.find((x) => x.id === line.id) : null;
    const repriced = Boolean(orig) && Number(line.rate) !== Number(orig.rate);
    if (repriced && !line.price_from) { setMsg({ error: "Choose the date the new rate starts from." }); return; }
    setBusy(true);
    setMsg({});
    try {
      const body = lineBody(line);
      if (line.id) await billingPut(`/contracts/${id}/lines/${line.id}`, { ...body, effective_from: repriced ? line.price_from : body.effective_from });
      else await billingPost(`/contracts/${id}/lines`, body);
      setLineEdit(null);
      setMsg({ ok: repriced ? `Saved. The new rate applies from ${dmy(line.price_from)}; earlier invoices keep the old rate.` : "Price list saved." });
      reload();
    } catch (err) {
      setMsg({ error: err.message });
    } finally {
      setBusy(false);
    }
  }

  if (!isNew && !contract) return error ? <Msg error={error} /> : <PageSkeleton />;

  const typeIs = (t) => form.billing_type === t;
  // Termite billed once (new Termite contracts): no frequency, bill date or term dates. Older Termite
  // contracts with a frequency keep them.
  const termiteOnce = typeIs("TERMITE") && isOnce(form);
  const linesShown = isNew ? newLines : contract.lines;
  const sqmMode = typeIs("TERMITE") || linesShown.some(isSqm);
  const cols = 7;
  // Termite bill structure: per square metre or per square foot (the unit of its area lines). A saved
  // contract keeps the unit of its price lines; new lines added to it use the same unit.
  const areaUnit = isNew ? (form.area_unit === SQFT ? SQFT : SQM) : linesShown.find(isSqm)?.unit === SQFT ? SQFT : SQM;
  // Termite items can each be priced per sq. m or per sq. ft: with both, the labels say so and each
  // saved line shows its own unit.
  const mixedUnits = !isNew && new Set(linesShown.filter(isSqm).map((l) => (l.unit === SQFT ? SQFT : SQM))).size > 1;
  const areaLabel = mixedUnits ? "sq. m / sq. ft" : areaUnit === SQFT ? "sq. ft" : "sq. m";
  const lineUnitText = (l) => (l.unit === SQFT ? "sq. ft" : "sq. m");
  const mkLine = (...args) => {
    const l = emptyLine(...args);
    return isSqm(l) ? { ...l, unit: areaUnit } : l;
  };

  // Summary figures (current price lines only).
  const currentLines = isNew ? newLines.filter((l) => l.item_name && l.rate !== "") : contract.lines.filter((l) => !l.effective_to);
  const hasKind = (kind) => currentLines.some((l) => (l.item_kind || "SERVICE") === kind);
  const lineValue = (l) => (isSqm(l) ? lineTotal(l) ?? 0 : Number(l.rate) * (Number(l.default_qty) || 1));
  const billValue = currentLines.reduce((t, l) => t + (Number(lineValue(l)) || 0), 0);
  const outletCount = new Set(currentLines.map((l) => l.site_id || "all")).size;
  const noGst = residential || form.gst_applicable === false;
  const freq = frequencyText(form);
  const dirty = isNew || Boolean(edits);
  // a group based contract is billed in the group's name
  const customerName = isNew ? customerRow?.name || "New contract" : contract.group_name || contract.customer;
  const TABS = [
    ["details", "Details", <FiSliders key="i" />, null],
    ["prices", "Services & prices", <FiList key="i" />, linesShown.filter((l) => !l.effective_to && (l.item_name || !isNew)).length],
    ...(!isNew ? [["billing", "Bill To & delivery", <FiFileText key="i" />, null], ["history", "Price history", <FiClock key="i" />, contract.price_history.length]] : []),
  ];

  return (
    <div className="ac-page ct-page">
      <div className="bl-backrow"><BackButton to="/billing/contracts" label="Contracts" /><div className="ac-crumb" style={{ marginBottom: 8 }}><button type="button" onClick={() => navigate("/billing/masters")}>Masters</button> / <button type="button" onClick={() => navigate("/billing/contracts")}>Contracts</button> / {isNew ? "New" : contract.contract_code}</div></div>

      <div className="ct-hero">
        <span className="ct-avatar">{initials(customerName)}</span>
        <div className="ct-hero-main">
          <h1>{customerName}</h1>
          <div className="bl-meta">
            {!isNew && <span><FiHash /> {contract.contract_code}</span>}
            {!isNew && <StatusBadge value={contract.status} />}
            <span><FiRepeat /> {TYPE_LABEL[form.billing_type] || form.billing_type} · {freq.toLowerCase()}</span>
            <span><FiLayers /> {typeIs("TERMITE") ? `Per ${areaLabel}` : form.shortfall_billing === "FULL" ? "Fixed amount" : "Service based"}</span>
            {/* separate bills: each period, one invoice for the services and one for the chemicals */}
            {form.separate_bills && <span title="Each period: one invoice for pest control services, one for chemicals (same PO)"><FiFileText /> Separate bills · services + chemicals</span>}
            {!isNew && contract.last_invoice_number && <span><FiFileText /> Last {contract.last_invoice_number}</span>}
          </div>
        </div>
        {canEdit && !isNew && (
          <div className="ct-hero-side">
            {contract.status === "ACTIVE" && <button type="button" className="ac-btn" onClick={() => setStatusAction("PAUSED")}><FiPause /> Pause</button>}
            {contract.status === "PAUSED" && <button type="button" className="ac-btn" onClick={() => setStatusAction("ACTIVE")}><FiPlay /> Resume</button>}
            {contract.status !== "ENDED" && <button type="button" className="ac-btn danger-text" onClick={() => setStatusAction("ENDED")}><FiXCircle /> End contract</button>}
          </div>
        )}
      </div>

      <div className="ct-sum">
        <div className="ct-sumcard blue">
          <span className="ct-sum-ic"><LuIndianRupee /></span>
          <div><span>Value per bill</span><b>{rupees(billValue)}</b><small>{noGst ? "no GST" : "excl. GST"} · {freq.toLowerCase()}</small></div>
        </div>
        <div className="ct-sumcard purple">
          <span className="ct-sum-ic"><FiList /></span>
          <div><span>Services</span><b>{currentLines.length} line{currentLines.length === 1 ? "" : "s"}</b><small>{outletCount ? `${outletCount} outlet${outletCount === 1 ? "" : "s"}` : "none priced yet"}</small></div>
        </div>
        <div className={`ct-sumcard ${next && next.billMonth <= thisMonthKey ? "amber" : "green"}`}>
          <span className="ct-sum-ic"><FiCalendar /></span>
          <div>
            <span>{isNew ? "First invoice" : "Next invoice"}</span>
            <b>{!next ? "—" : termiteOnce ? "One invoice" : next.start === next.end ? shortDate(next.start) : `${shortDate(next.start)} – ${shortDate(next.end)}`}</b>
            <small>{next ? `Bill Run ${monthLabel(next.billMonth)}${next.billMonth < thisMonthKey ? " · already due" : next.billMonth === thisMonthKey ? " · this month" : ""}` : form.status === "PAUSED" ? "Paused - not billed" : "Not billed"}</small>
          </div>
        </div>
        <div className="ct-sumcard teal">
          <span className="ct-sum-ic"><FiPercent /></span>
          <div>
            <span>GST</span>
            <b>{noGst ? "No GST" : `${form.gst_rate ?? 18}%`}</b>
            <small>{residential ? "Residential customer" : noGst ? "Invoices without GST" : gstHint(form.gst_rate ?? 18, profile?.state_code)}</small>
          </div>
        </div>
      </div>

      <Msg {...msg} />
      {groupBillToMissing && (
        <div className="ac-info error" role="alert" style={{ marginBottom: 12 }}>
          <span>⚠ The group's billing details (Bill To) are missing, so the Bill Run cannot make its invoice. They are filled in on New Contract, step 1, when this group is chosen.</span>
        </div>
      )}
      {profileMissing && (
        <div className="ac-info error" role="alert" style={{ marginBottom: 12 }}>
          <span>
            ⚠ This customer has no billing details (Bill To address and GST state), so the Bill Run cannot make its invoice.
            {!isNew && <>{" "}<button type="button" className="bl-link" onClick={() => setTab("billing")}>Fill them in under Bill To &amp; delivery</button>.</>}
          </span>
        </div>
      )}

      <div className="bl-utabs bl-segtabs" role="tablist">
        {TABS.map(([k, l, icon, n]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`bl-utab ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>
            <span className="bl-utab-ic" aria-hidden="true">{icon}</span>
            {l}
            {n !== null && <span className="bl-count">{n}</span>}
          </button>
        ))}
      </div>

      {tab === "details" && (
        <div className="ct-secs">
          <section className="ct-sec">
            <h3><span className="ct-sec-ic blue"><FiCalendar /></span>Billing schedule</h3>
            <div className="bl-grid g2">
              {isNew && (
                <Field label="Customer" required className="bl-span2">
                  <select className="ac-select" value={form.company_id} onChange={(e) => { set({ company_id: e.target.value, site_id: "", po_ids: [] }); setNewLines([mkLine("", form.billing_type)]); }}>
                    <option value="">Choose a customer…</option>
                    {(customers || []).map((c) => <option key={c.company_id} value={c.company_id} disabled={!c.category}>{c.name}{!c.category ? " (customer type not set)" : !c.profile_complete ? " (no billing profile)" : ""}</option>)}
                  </select>
                </Field>
              )}
              <Field label="Billing type" required className="bl-span2" hint={!isNew ? "Set when the contract was created" : ""}>
                <div className="ct-seg" role="group" aria-label="Billing type">
                  {TYPES.map(([v, l]) => (
                    <button key={v} type="button" disabled={!isNew} className={typeIs(v) ? "active" : ""} aria-pressed={typeIs(v)}
                      onClick={() => {
                        set({
                          billing_type: v, frequency_months: v === "ONE_TIME" || v === "TERMITE" ? null : form.frequency_months || 1, po_required: PO_TYPES.includes(v) ? true : form.po_required,
                          frequency_unit: "MONTH",
                          // Termite is billed once: start = the day it is saved, no end date, billed after.
                          ...(v === "TERMITE" ? { bill_timing: "ARREARS", start_date: today(), end_date: "" } : {}),
                        });
                        // Untouched lines follow the type (termite: per sq. m / sq. ft, as the Bill structure).
                        if (newLines.every((l2) => l2.rate === "" && l2.default_qty === "")) setNewLines(newLines.map((l2) => ({ ...mkLine(l2.site_id, v), key: l2.key })));
                      }}>{l}</button>
                  ))}
                </div>
              </Field>
              {!termiteOnce && (
                <>
              <Field
                label="Billing frequency"
                required={typeIs("AMC") || typeIs("TERMITE")}
                hint={typeIs("TERMITE") && !isNew && !contract?.next_period_editable ? "Fixed once an invoice is drafted or issued" : typeIs("TERMITE") && unitOf(form) !== "MONTH" ? `One invoice per ${unitOf(form) === "DAY" ? "day" : "week"}` : ""}
              >
                {typeIs("TERMITE") ? (
                  // Termite: billed every day, week or month
                  <select className="ac-select" value={unitOf(form)} disabled={readOnly || (!isNew && !contract?.next_period_editable)} onChange={(e) => set({ frequency_unit: e.target.value, frequency_months: 1 })}>
                    {TERMITE_UNITS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                ) : (
                  <FrequencySelect value={form.frequency_months} oneTime={typeIs("ONE_TIME")} disabled={readOnly} onChange={(v) => set({ frequency_months: v })} />
                )}
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
              <Field label="Term end date" hint="Leave empty for an open-ended contract">
                <input type="date" className="ac-input" value={form.end_date || ""} disabled={readOnly} onChange={(e) => set({ end_date: e.target.value })} />
              </Field>
                </>
              )}
              {!isNew && (
                <Field label="Next bill from" className="bl-span2" hint={nextEditable ? "Billed in Vyapar until a date? Set the first date not billed yet." : "Follows on from the last invoice"}>
                  <input type="date" className="ac-input" value={form.next_period_start || ""} disabled={!nextEditable}
                    min={form.start_date || undefined} max={form.end_date || undefined} onChange={(e) => set({ next_period_start: e.target.value })} />
                </Field>
              )}
            </div>
          </section>

          <section className="ct-sec">
            <h3><span className="ct-sec-ic purple"><FiFileText /></span>Invoice</h3>
            <div className="bl-grid g2">
              <Field label="Invoice grouping">
                <select className="ac-select" value={form.invoice_grouping} disabled={readOnly} onChange={(e) => set({ invoice_grouping: e.target.value })}>
                  <option value="PER_CUSTOMER">One invoice for the customer</option>
                  <option value="PER_SITE">One invoice per outlet</option>
                </select>
              </Field>
              {typeIs("TERMITE") ? (
                // Termite is billed on the treated area: rate per square metre or per square foot × area
                <Field label="Bill structure" required hint={isNew ? `Rate per ${areaLabel} × treated area` : "Set by the contract's price lines"}>
                  <select
                    className="ac-select"
                    value={areaUnit}
                    disabled={readOnly || !isNew}
                    onChange={(e) => {
                      const unit = e.target.value;
                      set({ area_unit: unit });
                      setNewLines(newLines.map((l) => (isSqm(l) ? { ...l, unit } : l)));
                    }}
                  >
                    {AREA_UNITS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </Field>
              ) : (
                <Field label="Bill structure" hint={form.shortfall_billing === "FULL" ? "Full amount every period, even if a service is missed" : "Billed for the services actually done"}>
                  <select className="ac-select" value={form.shortfall_billing} disabled={readOnly} onChange={(e) => set({ shortfall_billing: e.target.value })}>
                    <option value="FULL">Fixed amount</option>
                    <option value="PRO_RATA">Service based</option>
                  </select>
                </Field>
              )}
              {/* Separate bills: offered when the contract bills both services and chemicals (or already has it on). */}
              {(form.separate_bills || (hasKind("SERVICE") && hasKind("CHEMICAL"))) && (
                <Field label="Separate bills" className="bl-span2" hint={form.separate_bills ? "Each period: one invoice for pest control services, one for chemicals (same PO)" : "Pest control services and chemicals on one invoice"}>
                  <label className="bl-toggle">
                    <input type="checkbox" checked={Boolean(form.separate_bills)} disabled={readOnly}
                      onChange={(e) => set({ separate_bills: e.target.checked, ...(e.target.checked && !form.chemical_description_template ? { chemical_description_template: "Towards charges for the chemical charges for the month of {month}" } : {}) })} />
                    Separate bills for pest control services and chemicals
                  </label>
                </Field>
              )}
              <Field label={form.separate_bills ? "Description – pest control bill" : "Description on invoice"} required className="bl-span2" hint="{month}, {period}, {from_month}, {to_month} are filled in. A new wording is saved for next time.">
                <DescriptionPicker value={form.description_template || ""} disabled={readOnly} onChange={(text) => set({ description_template: text })} />
              </Field>
              {form.separate_bills && (
                <Field label="Description – chemical bill" required className="bl-span2">
                  <DescriptionPicker value={form.chemical_description_template || ""} disabled={readOnly} onChange={(text) => set({ chemical_description_template: text })} />
                </Field>
              )}
              <Field label="GST" hint={residential ? "Residential customer: never charged GST" : form.gst_applicable === false ? "Invoices go out without GST" : "A change applies to new drafts only"}>
                <div className="nc-gst">
                  <select className="ac-select" value={noGst ? "NO" : "YES"} disabled={readOnly || residential}
                    onChange={(e) => set({ gst_applicable: e.target.value === "YES" })}>
                    <option value="YES">Apply GST</option>
                    <option value="NO">No GST</option>
                  </select>
                  {!noGst && (
                    <span className="ct-suffix">
                      <input type="number" min="5" max="28" step="1" className="ac-input" value={form.gst_rate ?? 18} disabled={readOnly} onChange={(e) => set({ gst_rate: e.target.value })} aria-label="GST rate in percent" />
                      <i>%</i>
                    </span>
                  )}
                </div>
              </Field>
              <Field label="PO required">
                <label className={`ct-switch ${PO_TYPES.includes(form.billing_type) || form.po_required ? "on" : ""}`}>
                  <input type="checkbox" checked={PO_TYPES.includes(form.billing_type) || Boolean(form.po_required)} disabled={readOnly || PO_TYPES.includes(form.billing_type)} onChange={(e) => set({ po_required: e.target.checked })} />
                  <span className="ct-switch-track"><span /></span>
                  {typeIs("CHEMICAL") ? "Always for chemical supply" : typeIs("TERMITE") ? "Always for termite work" : form.po_required ? "Yes - bill against a PO" : "No"}
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
              <Field label="Notes" className="bl-span2">
                <input className="ac-input" value={form.notes || ""} disabled={readOnly} maxLength={1000} placeholder="Internal notes (not printed)" onChange={(e) => set({ notes: e.target.value })} />
              </Field>
            </div>
          </section>
        </div>
      )}

      {/* Bill To and invoice delivery (print copies, email) - the customer's, used by every contract of it.
          A group based contract bills the group: its Bill To is the group's (set on New Contract). */}
      {tab === "billing" && !isNew && customerRow && (
        <div className="bl-stack">
          {contract.contract_kind === "GROUP" ? (
            <BillingProfileCard customer={customerRow} canEdit={canEdit} onSaved={reload}
              group={{ group_id: contract.group_id, name: contract.group_name || contract.group || "", companies: (contract.companies || []).length }} />
          ) : (
            <BillingProfileCard customer={customerRow} canEdit={canEdit} onSaved={reloadProfile} />
          )}
          {contract.contract_kind !== "GROUP" && <InvoiceDelivery companyId={companyId} canEdit={canEdit} />}
        </div>
      )}

      {tab === "prices" && (
        <div className="ac-card ct-prices">
          <div className="ct-prices-head">
            <span className="ac-sub">
              {typeIs("TERMITE") ? `Rate per ${areaLabel} × treated area. Excluding GST.` : `Amount for each service. ${noGst ? "No GST is added." : `Excluding GST (${form.gst_rate ?? 18}% is added on the invoice).`}`}
            </span>
            {!readOnly && companyId && bulk && (
              <div className="ac-actions">
                <button type="button" className="ac-btn sm" disabled={busy} onClick={() => { setBulk(null); setMsg({}); }}>Cancel</button>
                <button type="button" className="ac-btn sm ac-btn-primary" disabled={busy} onClick={saveAllLines}><FiCheck /> {busy ? "Saving…" : "Save changes"}</button>
              </div>
            )}
            {!readOnly && companyId && !bulk && (
              <div className="ac-actions">
                {!isNew && contract.lines.some((l) => !l.effective_to) && (
                  <button type="button" className="ac-btn sm" disabled={Boolean(lineEdit)} onClick={startEdit} title="Edit the names, quantities and rates"><FiEdit2 /> Edit</button>
                )}
                <button type="button" className="ac-btn sm" onClick={() => (isNew
                  ? setNewLines([...newLines.filter((l) => l.item_name || l.rate !== ""), mkLine(sites.length === 1 ? sites[0].site_id : "", "", "CHEMICAL")])
                  : setLineEdit(mkLine(sites.length === 1 ? sites[0].site_id : "", "", "CHEMICAL")))}><FiDroplet /> Add chemical</button>
                <button type="button" className="ac-btn sm ct-addbtn" onClick={() => (isNew
                  ? setNewLines([...newLines.filter((l) => l.item_name || l.rate !== ""), ...(sites.length > 1 ? sites.map((x) => mkLine(x.site_id, form.billing_type)) : [mkLine(sites[0]?.site_id || "", form.billing_type)])])
                  : setLineEdit(mkLine(sites.length === 1 ? sites[0].site_id : "", form.billing_type)))}><FiPlusCircle /> Add service</button>
              </div>
            )}
          </div>
          <div className="ac-table-wrap">
            <table className="ac-table ac-stack bl-prices">
              <colgroup>
                <col style={{ width: "16%" }} />
                <col />
                {sqmMode && <col style={{ width: 150 }} />}
                {sqmMode && <col style={{ width: 150 }} />}
                {!sqmMode && <col style={{ width: 140 }} />}
                {!sqmMode && <col style={{ width: 124 }} />}
                <col style={{ width: 130 }} />
                <col style={{ width: 130 }} />
                <col style={{ width: 110 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Outlet</th>
                  <th>Service / chemical</th>
                  {sqmMode && <th className="ac-num">{mixedUnits ? "Rate (₹)" : `Rate per ${areaLabel} (₹)`}</th>}
                  {sqmMode && <th className="ac-num">{mixedUnits ? "Area" : `Area (${areaLabel})`}</th>}
                  {!sqmMode && <th className="ac-num">Qty / month</th>}
                  {!sqmMode && <th className="ac-num">Rate (₹)</th>}
                  <th className="ac-num">Amount (₹)</th>
                  <th>Valid from</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {!companyId && <EmptyRow cols={cols} text="Choose the customer first" />}
                {companyId && !linesShown.length && <EmptyRow cols={cols} text="No services priced yet. Use Add service." />}
                {companyId && isNew && newLines.map((l) => (
                  <LineRow key={l.key} line={l} sqmMode={sqmMode} sites={sites} groups={serviceGroups} catalog={catalog} onChange={(patch) => setNewLines(newLines.map((x) => (x.key === l.key ? { ...x, ...patch } : x)))} onRemove={newLines.length > 1 ? () => setNewLines(newLines.filter((x) => x.key !== l.key)) : null} />
                ))}
                {!isNew && contract.lines.map((l) => (bulk?.[l.id] ? (
                  <LineRow key={l.id} line={bulk[l.id]} sqmMode={sqmMode} sites={sites} groups={serviceGroups} catalog={catalog} original={l}
                    onChange={(patch) => setBulk((b) => ({ ...b, [l.id]: { ...b[l.id], ...patch } }))} />
                ) : (
                  <tr key={l.id}>
                    <td>{l.site || <span className="ac-sub">All outlets</span>}</td>
                    <td>
                      <b className="ct-item">{l.item_name}</b>
                      {l.item_kind === "CHEMICAL" && <span className="ct-kind"><FiDroplet /> Chemical</span>}
                      {l.invoice_group && <div className="bl-sub">Printed as “{l.invoice_group}”</div>}
                    </td>
                    {sqmMode && <td className="bl-num">{isSqm(l) ? <>{amount(l.rate)}{mixedUnits && <div className="bl-sub">per {lineUnitText(l)}</div>}</> : "—"}</td>}
                    {sqmMode && <td className="bl-num">{isSqm(l) ? l.default_qty ?? "—" : "—"}</td>}
                    {!sqmMode && <td className="bl-num">{Number(l.default_qty) || 1}</td>}
                    {!sqmMode && <td className="bl-num">{amount(l.rate)}</td>}
                    <td className="bl-num"><b>{amount(lineValue(l))}</b></td>
                    <td>
                      {dmy(l.effective_from)}
                      {l.effective_from > today() && <div className="sos-amber">Upcoming</div>}
                      {l.effective_to && <div className="bl-sub">till {dmy(l.effective_to)}</div>}
                    </td>
                    <td />
                  </tr>
                )))}
                {!isNew && lineEdit && !lineEdit.id && (
                  <LineRow line={lineEdit} sqmMode={sqmMode} sites={sites} groups={serviceGroups} catalog={catalog} onChange={(patch) => setLineEdit({ ...lineEdit, ...patch })} onSave={() => saveLine(lineEdit)} onCancel={() => setLineEdit(null)} busy={busy} />
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "history" && !isNew && (
        <div className="ac-card">
          <div className="ac-table-wrap">
            <table className="ac-table ac-stack">
              <thead><tr><th>Outlet</th><th>Item</th><th className="ac-num">Rate (₹)</th><th>From</th><th>To</th></tr></thead>
              <tbody>
                {!contract.price_history.length ? <EmptyRow cols={5} text="No earlier prices" /> : contract.price_history.map((l) => (
                  <tr key={l.id}><td>{l.site || "—"}</td><td>{l.item_name}</td><td className="bl-num">{amount(l.rate)}</td><td>{dmy(l.effective_from)}</td><td>{dmy(l.effective_to)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!readOnly && dirty && (
        <div className="ct-savebar">
          <span className="sos-state amber"><FiAlertCircle /> {isNew ? "New contract - not saved yet" : "Unsaved changes"}</span>
          <div className="ac-actions">
            {!isNew && <button type="button" className="ac-btn" disabled={busy} onClick={() => { setEdits(null); setMsg({}); }}>Discard</button>}
            <button type="button" className="ac-btn ac-btn-primary" disabled={busy} onClick={save}><FiCheck /> {busy ? "Saving…" : isNew ? "Create contract" : "Save contract"}</button>
          </div>
        </div>
      )}

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

function LineRow({ line, sqmMode, sites, groups, catalog, onChange, onRemove, onSave, onCancel, busy, original = null }) {
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
  const qtyMin = line.item_kind === "CHEMICAL" ? 0 : 1;
  const rateInput = (label) => <input type="number" min="0" step="0.01" className="bl-cell-input num" value={line.rate} placeholder="0.00" onChange={(e) => onChange({ rate: e.target.value })} aria-label={label} />;
  // a saved line whose rate is changed: the new rate starts from a date (the old one stays on earlier invoices)
  const repriced = Boolean(original) && line.rate !== "" && Number(line.rate) !== Number(original.rate);
  const fromDay = String(original?.effective_from || "").slice(0, 10);
  const nextDay = /^\d{4}-\d{2}-\d{2}$/.test(fromDay) ? new Date(Date.parse(`${fromDay}T00:00:00Z`) + 86400000).toISOString().slice(0, 10) : "";
  return (
    <tr className="bl-sel bl-price-edit">
      <td>
        <span className="bl-outlet">{outletName}</span>
      </td>
      <td>
        {original ? (
          // editing a saved line: the name is typed, no list
          <input className="bl-cell-input" value={line.item_name || ""} maxLength={255} placeholder={line.item_kind === "CHEMICAL" ? "Chemical name" : "Service name"} onChange={(e) => onChange({ item_name: e.target.value })} aria-label={line.item_kind === "CHEMICAL" ? "Chemical" : "Service"} />
        ) : line.item_kind === "CHEMICAL" ? (
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
      </td>
      {sqmMode && <td>{sqm ? rateInput(line.unit === SQFT ? "Rate per square foot" : "Rate per square metre") : <span className="ac-sub">—</span>}</td>}
      {sqmMode && (
        <td>
          {sqm ? <input type="number" min="0" step="0.01" className="bl-cell-input num" value={line.default_qty ?? ""} placeholder={line.unit === SQFT ? "sq. ft" : "sq. m"} onChange={(e) => onChange({ default_qty: e.target.value })} aria-label={line.unit === SQFT ? "Area in square feet" : "Area in square metres"} />
            : <span className="ac-sub">—</span>}
        </td>
      )}
      {!sqmMode && (
        <td>
          <div className="bl-stp sp-stp ct-qty">
            <button type="button" onClick={() => onChange({ default_qty: String(Math.max(qtyMin, (Number(line.default_qty) || qtyMin) - 1)) })} disabled={(Number(line.default_qty) || qtyMin) <= qtyMin} aria-label="Less">−</button>
            <input type="number" min={qtyMin} max="999" step={line.item_kind === "CHEMICAL" ? "0.01" : "1"} value={line.default_qty ?? ""} placeholder="1" onChange={(e) => onChange({ default_qty: e.target.value })} aria-label={line.item_kind === "CHEMICAL" ? "Quantity" : "Services per month"} />
            <button type="button" onClick={() => onChange({ default_qty: String(Math.min(999, (Number(line.default_qty) || 0) + 1)) })} aria-label="More">+</button>
          </div>
        </td>
      )}
      {!sqmMode && <td>{rateInput("Rate")}</td>}
      <td className="bl-num">{sqm || !sqmMode ? <b>{total === null ? "—" : amount(total)}</b> : rateInput("Amount")}</td>
      <td>
        {repriced ? (
          <>
            <input type="date" className="bl-cell-input" min={nextDay} value={line.price_from || ""} onChange={(e) => onChange({ price_from: e.target.value })} aria-label="New rate from" />
            <div className="bl-sub">New rate from (was ₹{amount(original.rate)})</div>
          </>
        ) : line.effective_from ? dmy(line.effective_from) : <span className="ac-sub">From start</span>}
      </td>
      <td>
        {onSave ? (
          <div className="ac-actions" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="ac-btn sm ac-btn-primary" disabled={busy || !String(line.item_name || "").trim() || line.rate === "" || (sqm && !line.default_qty) || (repriced && !line.price_from)} onClick={onSave}>Save</button>
            <button type="button" className="ac-btn sm" onClick={onCancel}>Cancel</button>
          </div>
        ) : onRemove ? <div style={{ textAlign: "right" }}><button type="button" className="bl-x" style={{ fontSize: 15 }} onClick={onRemove} aria-label="Remove">✕</button></div> : null}
      </td>
    </tr>
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

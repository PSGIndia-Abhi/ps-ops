import { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { ApiError, billingGet, billingPost, billingPut, qs, useBilling } from "./billingApi";
import { GST_RATES, gstHint } from "./calc";
import { CATEGORY_LABEL, amount, dmy, monthLabel, nextBilling, thisMonth, today } from "./format";
import DescriptionPicker from "./DescriptionPicker";
import FrequencySelect from "./FrequencySelect";
import { STATES } from "./states";
import { Field, Msg } from "./ui";
import { deepCleaningServices, pestServices } from "../../components/CreateBookingModal";

// New contract, one step at a time, with everything billing needs in one place:
//   1 Customer      - the customer and its billing profile (Bill To, GSTIN, GST state, payment terms)
//   2 Contract      - billing type, frequency, timing, dates, GST, shortfall rule, description
//   3 Purchase order - only when one is needed: pick one or add a new one here
//   4 Services      - the service, its amount and (Service Plan permission) how many per month
//   5 Review        - the checklist, then Create
// The billing profile (step 1) and a new PO (step 3) are saved when Next is pressed, since they
// are useful on their own; the contract is created only at the last step.
// The customer type (Commercial / Residential) stays on the customer (Companies screen).

const TYPES = [["AMC", "AMC"], ["ONE_TIME", "One-time"], ["TERMITE", "Termite"], ["CHEMICAL", "Chemical"]];
const PO_TYPES = ["CHEMICAL", "TERMITE"]; // always billed against a PO
const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const SQM = "sq.m";

let lineKey = 0;
// kind: SERVICE (from the service list) or CHEMICAL (typed; remembered for other customers).
// group: optional invoice line summary - lines with the same summary print as ONE invoice line.
// qty: services per month (from the Service Plan) for a service, typed for a chemical.
const newLine = (termite, kind = "SERVICE") => ({ key: (lineKey += 1), kind, item_name: termite && kind === "SERVICE" ? "Termite Post-Construction Treatment" : "", rate: "", area: "", qty: kind === "CHEMICAL" ? 1 : "", group: "", picked: false });
const lineTotal = (l, termite) => Number(l.rate) * (termite && l.kind === "SERVICE" ? Number(l.area) || 0 : Number(l.qty) || 0);
const sameName = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
/** The plan's services, one per name, with how many per month: [{ name, qty }]. */
function planServicesOf(plan) {
  const out = [];
  for (const l of plan?.lines || []) {
    const hit = out.find((x) => sameName(x.name, l.sub_service));
    if (hit) hit.qty += Number(l.visits_per_month) || 0;
    else if (l.sub_service) out.push({ name: l.sub_service, qty: Number(l.visits_per_month) || 0 });
  }
  return out;
}

export default function NewContract() {
  const { me } = useOutletContext();
  const navigate = useNavigate();
  const canPlan = me.can("MANAGE_SERVICE_PLANS");
  const { data: customers } = useBilling("/customers");

  const [step, setStep] = useState(1);
  const [msg, setMsg] = useState({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null); // { id, code, planNote }

  // 1. customer + billing profile
  const [companyId, setCompanyId] = useState("");
  const [profile, setProfile] = useState(null); // the form; null while loading
  const [profileSaved, setProfileSaved] = useState(false);
  const customer = (customers || []).find((c) => c.company_id === companyId) || null;
  const residential = customer?.category === "RESIDENTIAL";

  // 2. contract terms
  const [terms, setTerms] = useState({
    billing_type: "AMC", frequency_months: 1, bill_timing: "ARREARS", start_date: today(), end_date: "",
    shortfall_billing: "PRO_RATA", gst_applicable: true, gst_rate: 18, po_required: false, description_template: null, notes: "",
  });
  const setT = (patch) => setTerms((t) => ({ ...t, ...patch }));
  const termite = terms.billing_type === "TERMITE";
  const gstOn = !residential && terms.gst_applicable !== false;
  const needsPo = PO_TYPES.includes(terms.billing_type) || terms.po_required;

  // 3. purchase order
  const [poId, setPoId] = useState("");
  const [addingPo, setAddingPo] = useState(false);
  const [po, setPo] = useState({ po_number: "", po_date: today(), valid_from: "", expiry_date: "", open: false, po_amount: "", kind: "STANDARD", remarks: "" });
  const setP = (patch) => setPo((p) => ({ ...p, ...patch }));
  const { data: poData, reload: reloadPos } = useBilling(companyId && needsPo ? `/pos${qs({ company_id: companyId, status: "ACTIVE" })}` : null);
  const poRows = (poData?.rows || []).filter((p) => p.display_status !== "EXPIRED" && !p.contract_id);
  const emptyPo = { po_number: "", po_date: today(), valid_from: "", expiry_date: "", open: false, po_amount: "", kind: "STANDARD", remarks: "" };
  // Picking an existing PO fills in its details (shown, not edited, here).
  function choosePo(id) {
    const p = poRows.find((x) => x.id === id);
    setPoId(id);
    setAddingPo(false);
    setPo(p
      ? { po_number: p.po_number, po_date: p.po_date || "", valid_from: p.valid_from || "", expiry_date: p.expiry_date || "", open: Boolean(p.is_open_po), po_amount: p.po_amount ?? "", kind: p.kind || "STANDARD", remarks: p.remarks || "" }
      : emptyPo);
  }
  function startNewPo() {
    setPoId("");
    setAddingPo(true);
    setPo(emptyPo);
  }
  function cancelNewPo() {
    setAddingPo(false);
    setPo(emptyPo);
    setMsg({});
  }

  // 4. services and prices
  const [lines, setLines] = useState([newLine(false)]);
  const setLine = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  // Services and / or chemicals: lines of a kind that is switched off are kept but not saved.
  const [kinds, setKinds] = useState({ SERVICE: true, CHEMICAL: false });
  const { data: chemicals } = useBilling("/chemicals");
  // Services come from the customer's Service Plan (set by the Service Coordinator): one row per
  // planned service, quantity = services per month; Accounts types the rate per service.
  const planWanted = Boolean(companyId) && terms.billing_type !== "TERMITE";
  const { data: servicePlan, loading: planLoading } = useBilling(planWanted ? `/service-plans/${encodeURIComponent(companyId)}` : null);
  const planServices = useMemo(() => planServicesOf(servicePlan), [servicePlan]);
  // This month's assigned / completed (Service Plans > Services this month): the quantity billed is
  // the completed number; until it is entered the plan's number per month is shown.
  const doneMonth = thisMonth();
  const { data: monthData } = useBilling(planWanted && servicePlan ? `/service-plans/${encodeURIComponent(companyId)}/months${qs({ month: doneMonth })}` : null);
  useEffect(() => {
    if (!planWanted || !servicePlan) return;
    setLines((ls) => {
      const old = ls.filter((l) => l.kind === "SERVICE");
      const rows = planServicesOf(servicePlan).map((p) => {
        const had = old.find((x) => sameName(x.item_name, p.name));
        const m = (monthData?.rows || []).find((r) => sameName(r.sub_service, p.name));
        const completed = m && m.completed !== null && m.completed !== undefined ? Number(m.completed) : null;
        return { ...(had || newLine(false, "SERVICE")), item_name: p.name, planQty: p.qty, completed, qty: completed ?? p.qty };
      });
      return [...rows, ...ls.filter((l) => l.kind !== "SERVICE")];
    });
  }, [servicePlan, monthData, planWanted]);
  const [groupText, setGroupText] = useState("");
  function toggleKind(kind) {
    const next = { ...kinds, [kind]: !kinds[kind] };
    if (!next.SERVICE && !next.CHEMICAL) return; // at least one
    setKinds(next);
    if (next[kind] && !lines.some((l) => l.kind === kind)) setLines((ls) => [...ls, newLine(false, kind)]);
  }
  const { data: options } = useBilling(companyId ? `/service-options${qs({ company_id: companyId })}` : null);
  const sites = options?.sites || [];
  const serviceGroups = useMemo(() => groupsFor(options), [options]);

  const steps = [
    { n: 1, title: "Customer" },
    { n: 2, title: "Contract" },
    ...(needsPo ? [{ n: 3, title: "Purchase order" }] : []),
    { n: 4, title: "Services & prices" },
    { n: 5, title: "Review" },
  ];
  const at = steps.findIndex((s) => s.n === step);
  const next = nextBilling(terms, terms.start_date);

  // Description on invoice: required, typed or picked from the master list. Until it is touched, the wording
  // that fits the billing type is suggested (as the server used to default it), when it is in the list.
  const { data: descriptions } = useBilling("/descriptions?active=true");
  const suggested = (() => {
    const want = terms.billing_type === "ONE_TIME" ? "{period}" : Number(terms.frequency_months) > 1 ? "{from_month}" : "{month}";
    return (descriptions || []).find((d) => d.text.includes(want))?.text || "";
  })();
  const description = (terms.description_template ?? suggested).trim();

  // Load the customer's billing profile, or start a new one from the customer's details.
  useEffect(() => {
    if (!companyId) return undefined;
    let live = true;
    billingGet(`/profiles/${encodeURIComponent(companyId)}`)
      .catch((err) => (err instanceof ApiError && err.status === 404 ? null : Promise.reject(err)))
      .then((p) => {
        if (!live) return;
        setProfileSaved(Boolean(p));
        setProfile(p
          ? { billing_name: p.billing_name || "", gst_number: p.gst_number || "", billing_address: p.billing_address || "", state_code: p.state_code || "29", payment_terms_days: p.payment_terms_days ?? 30 }
          : { billing_name: customer?.display_name || customer?.name || "", gst_number: customer?.gst_number || "", billing_address: "", state_code: "29", payment_terms_days: 30 });
      })
      .catch((err) => live && setMsg({ error: err.message }));
    return () => {
      live = false;
    };
    // customer is looked up from companyId; reloading on its identity alone would refetch needlessly
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  function chooseCustomer(id) {
    setCompanyId(id);
    setProfile(null);
    setProfileSaved(false);
    setPoId("");
    setAddingPo(false);
    setPo(emptyPo);
    setMsg({});
  }

  // Step 1 shows the billing fields from the start: empty and locked until a customer is chosen.
  const shown = profile || { billing_name: "", gst_number: "", billing_address: "", state_code: "29", payment_terms_days: 30 };
  const locked = !customer?.category || !profile;

  // ---- step checks and Next --------------------------------------------------------------------
  function problems() {
    if (step === 1) {
      if (!companyId) return "Choose the customer.";
      if (!customer?.category) return "This customer's type (Corporate / Individual / RWA) is not set. Set it on the customer in Companies first.";
      if (!profile) return "Loading the billing details…";
      if (!profile.billing_name.trim()) return "Type the billing name.";
      if (!profile.billing_address.trim()) return "Type the billing address.";
      const g = profile.gst_number.trim();
      if (!residential && !g) return "Type the GSTIN (Commercial customers are billed with GST).";
      if (g && !GSTIN_RE.test(g)) return "GSTIN must be 15 characters, e.g. 29ABCDE1234F1Z5.";
      if (g && g.slice(0, 2) !== profile.state_code) return `The GSTIN starts with ${g.slice(0, 2)} but the state is ${profile.state_code}; they must match.`;
    }
    if (step === 2) {
      if (terms.billing_type !== "ONE_TIME" && !terms.frequency_months) return "Choose the billing frequency.";
      if (!terms.start_date) return "Choose the start date.";
      if (terms.end_date && terms.end_date < terms.start_date) return "The term end date cannot be before the term start date.";
      if (gstOn && !GST_RATES.includes(Number(terms.gst_rate))) return `GST rate must be one of ${GST_RATES.join(", ")} %.`;
      if (!description) return "Type or choose the description on invoice.";
    }
    if (step === 3) {
      if (addingPo) {
        if (!po.po_number.trim()) return "Type the PO number.";
        if (!po.po_date) return "Choose the PO date.";
        if (po.kind === "ADVANCE" && po.po_amount === "") return "An advance PO needs its amount.";
      } else if (!poId) return "Choose a purchase order, or add a new one.";
    }
    if (step === 4) {
      const filled = lines.filter((l) => kinds[l.kind] && (l.item_name || l.rate !== ""));
      if (!filled.length) return "Add at least one service or chemical with its amount.";
      if (kinds.SERVICE && !termite) {
        if (!planServices.length) return "This customer has no Service Plan yet. The Service Coordinator sets the services in Service Plans; or untick Services.";
        const noRate = lines.find((l) => l.kind === "SERVICE" && (l.rate === "" || Number(l.rate) < 0));
        if (noRate) return `Type the rate per service for ${noRate.item_name}.`;
      }
      const badQty = filled.find((l) => l.kind === "CHEMICAL" && !(Number(l.qty) > 0));
      if (badQty) return `Type the quantity for ${badQty.item_name || "the chemical"}.`;
      for (const kind of termite ? ["SERVICE", "CHEMICAL"] : ["CHEMICAL"]) {
        const own = filled.filter((l) => l.kind === kind);
        const word = kind === "SERVICE" ? "Service" : "Chemical";
        const bad = own.findIndex((l) => !l.item_name.trim() || l.rate === "" || Number(l.rate) < 0 || (termite && kind === "SERVICE" && !(Number(l.area) > 0)));
        if (bad >= 0) return `${word} ${bad + 1}: ${kind === "SERVICE" ? "choose the service" : "type the chemical"} and the ${termite && kind === "SERVICE" ? "rate and the area" : "amount"}.`;
        const names = own.map((l) => l.item_name.trim().toLowerCase());
        if (new Set(names).size !== names.length) return `The same ${word.toLowerCase()} is listed twice.`;
      }
    }
    return "";
  }

  async function goNext() {
    const problem = problems();
    if (problem) {
      setMsg({ error: problem });
      return;
    }
    setMsg({});
    setBusy(true);
    try {
      if (step === 1) {
        // Saved now: the customer can be invoiced from here on, whatever happens next.
        await billingPut(`/profiles/${encodeURIComponent(companyId)}`, {
          billing_name: profile.billing_name.trim(), billing_address: profile.billing_address.trim(), state_code: profile.state_code,
          payment_terms_days: Number(profile.payment_terms_days) || 0, is_active: true, gst_number: profile.gst_number.trim().toUpperCase(),
        });
        setProfileSaved(true);
      }
      if (step === 3 && addingPo) {
        const created = await billingPost("/pos", {
          company_id: companyId, contract_id: null, po_number: po.po_number.trim(), po_date: po.po_date,
          valid_from: po.valid_from || null, expiry_date: po.open ? null : po.expiry_date || null,
          po_amount: po.po_amount === "" ? null : po.po_amount, kind: po.kind, remarks: po.remarks || null,
        });
        setPoId(created.id);
        setAddingPo(false);
        reloadPos();
      }
      setStep(steps[at + 1].n);
    } catch (err) {
      setMsg({ error: err.message, errors: err.errors });
    } finally {
      setBusy(false);
    }
  }

  function goBack() {
    setMsg({});
    if (at > 0) setStep(steps[at - 1].n);
  }

  // ---- create ---------------------------------------------------------------------------------
  const filledLines = lines.filter((l) => kinds[l.kind] && l.item_name && l.rate !== "");
  const oneSite = sites.length === 1 ? sites[0].site_id : null;

  async function create() {
    setBusy(true);
    setMsg({});
    try {
      const body = {
        company_id: companyId,
        billing_type: terms.billing_type,
        frequency_months: terms.billing_type === "ONE_TIME" ? null : Number(terms.frequency_months) || 1,
        bill_timing: terms.bill_timing,
        start_date: terms.start_date,
        end_date: terms.end_date || null,
        invoice_grouping: "PER_CUSTOMER",
        site_id: null,
        po_required: needsPo,
        gst_applicable: gstOn,
        gst_rate: gstOn ? Number(terms.gst_rate) : 18,
        ...(needsPo ? { po_ids: poId ? [poId] : [] } : {}),
        shortfall_billing: terms.shortfall_billing,
        description_template: description,
        notes: terms.notes || null,
        lines: filledLines.map((l) => {
          const common = { site_id: oneSite, item_kind: l.kind, invoice_group: (l.group || "").trim() || null };
          if (l.kind === "CHEMICAL") {
            // a typed chemical: a fixed amount each period, not part of the service plan
            return { ...common, item_name: l.item_name.trim(), sac_code: null, pricing_basis: "PER_UNIT", unit: "Nos", rate: l.rate, default_qty: Number(l.qty), plan_service_type: null, plan_sub_service: null };
          }
          return termite
            ? { ...common, item_name: l.item_name, sac_code: "998531", pricing_basis: "PER_UNIT", unit: SQM, rate: l.rate, default_qty: l.area }
            : {
              // rate per service x services: the invoice bills the services completed that month
              // (typed by the Service Coordinator); the plan's number per month is the default quantity
              ...common, item_name: l.item_name, sac_code: "998531", pricing_basis: "PER_SERVICE", unit: "Service", rate: l.rate, default_qty: Number(l.planQty ?? l.qty) || null,
              plan_service_type: null, plan_sub_service: l.item_name,
            };
        }),
      };
      const created = await billingPost("/contracts", body);

      const planNote = termite ? "" : "Services and how many per month come from the customer's Service Plan; each invoice bills the services completed that month.";
      setDone({ id: created.id, code: created.contract_code, planNote });
    } catch (err) {
      setMsg({ error: err.message, errors: err.errors });
    } finally {
      setBusy(false);
    }
  }

  // ---- screens --------------------------------------------------------------------------------
  if (done) {
    return (
      <div className="ac-page nc-page">
        <div className="ac-card nc-done">
          <div className="nc-done-mark">✓</div>
          <h2>Contract {done.code} created</h2>
          {next && <p>First invoice {dmy(next.start)} to {dmy(next.end)}, in the <b>Bill Run for {monthLabel(next.billMonth)}</b>.</p>}
          {done.planNote && <p className="ac-sub">{done.planNote}</p>}
          <div className="ac-actions" style={{ justifyContent: "center" }}>
            <button type="button" className="ac-btn" onClick={() => navigate("/billing/contracts")}>All contracts</button>
            <button type="button" className="ac-btn ac-btn-primary" onClick={() => navigate(`/billing/contracts/${done.id}`, { replace: true })}>Open contract</button>
          </div>
        </div>
      </div>
    );
  }

  const total = filledLines.reduce((t, l) => t + lineTotal(l, termite), 0);
  // Invoice line summaries: ticked lines get one summary; each summary prints as one invoice line.
  const picked = filledLines.filter((l) => l.picked);
  const pickedTotal = picked.reduce((t, l) => t + lineTotal(l, termite), 0);
  const groups = [...filledLines.reduce((m, l) => {
    const g = (l.group || "").trim();
    if (g) m.set(g, [...(m.get(g) || []), l]);
    return m;
  }, new Map())];
  function applyGroup() {
    const text = groupText.replace(/\s+/g, " ").trim();
    if (!text || !picked.length) return;
    const keys = new Set(picked.map((l) => l.key));
    setLines((ls) => ls.map((l) => (keys.has(l.key) ? { ...l, group: text, picked: false } : l)));
    setGroupText("");
  }
  const removeGroup = (name) => setLines((ls) => ls.map((l) => ((l.group || "").trim() === name ? { ...l, group: "" } : l)));

  return (
    <div className="ac-page nc-page">
      <div className="ac-head">
        <div>
          <div className="ac-crumb"><button type="button" onClick={() => navigate("/billing/contracts")}>Contracts</button> / New</div>
          <h1 className="ac-title">New Contract</h1>
        </div>
      </div>

      <ol className="nc-steps">
        {steps.map((s, i) => (
          <li key={s.n} className={i < at ? "done" : i === at ? "on" : ""}>
            <span>{i < at ? "✓" : i + 1}</span>{s.title}
          </li>
        ))}
      </ol>

      <div className="ac-card nc-card">
        {step === 1 && (
          <>
            <h3 className="nc-title">Customer and billing details</h3>
            <Field label="Customer" required>
              <select className="ac-select" value={companyId} onChange={(e) => chooseCustomer(e.target.value)}>
                <option value="">Choose a customer…</option>
                {(customers || []).map((c) => <option key={c.company_id} value={c.company_id}>{c.name}{!c.category ? " (customer type not set)" : ""}</option>)}
              </select>
            </Field>
            {customer && !customer.category && (
              <div className="ac-info error" style={{ marginTop: 10 }}>⚠ This customer&apos;s type (Corporate / Individual / RWA) is not set, so it cannot be billed yet. Set it on the customer in Companies, then come back.</div>
            )}
            {/* The billing fields show from the start; they open for typing once a customer is chosen. */}
            {customer?.category ? (
              <div className="nc-chip-row">
                <span className={`ac-badge ${residential ? "b-purple" : "b-blue"}`}>{CATEGORY_LABEL[customer.category]}</span>
                <span className="ac-sub">{residential ? "Billed without GST" : "Billed with GST"} · {!profile ? "Loading the billing details…" : profileSaved ? "Billing details found; check and continue" : "No billing details yet; fill them in"}</span>
              </div>
            ) : (
              <div className="nc-chip-row"><span className="ac-sub">{customer ? "Set the customer type first; the billing details open after that." : "Choose the customer; its billing details are filled in below."}</span></div>
            )}
            <div className="bl-grid g2" style={{ marginTop: 6 }}>
              <Field label="Billing name" required>
                <input className="ac-input" disabled={locked} value={shown.billing_name} maxLength={255} onChange={(e) => setProfile({ ...shown, billing_name: e.target.value })} />
              </Field>
              {!residential ? (
                <Field label="GSTIN" required hint={customer?.gst_number && shown.gst_number === customer.gst_number ? "From the customer record; the state follows its first 2 digits" : "15 characters; the state follows its first 2 digits"}>
                  <input className="ac-input" disabled={locked} value={shown.gst_number} maxLength={15} placeholder="e.g. 29ABCDE1234F1Z5" style={{ textTransform: "uppercase" }}
                    onChange={(e) => {
                      const g = e.target.value.replace(/\s+/g, "").toUpperCase();
                      const code = g.slice(0, 2);
                      setProfile({ ...shown, gst_number: g, ...(STATES.some(([c]) => c === code) ? { state_code: code } : {}) });
                    }} />
                </Field>
              ) : <div />}
              <Field label="Billing address" required className="bl-span2">
                <textarea className="ac-textarea" rows={3} disabled={locked} value={shown.billing_address} maxLength={1000} placeholder="As printed under Bill To" onChange={(e) => setProfile({ ...shown, billing_address: e.target.value })} />
              </Field>
              <Field label="State (GST)" required hint={shown.state_code === "29" ? "Karnataka: CGST + SGST" : "Outside Karnataka: IGST"}>
                <select className="ac-select" disabled={locked} value={shown.state_code} onChange={(e) => setProfile({ ...shown, state_code: e.target.value })}>
                  {STATES.map(([code, name]) => <option key={code} value={code}>{code} – {name}</option>)}
                </select>
              </Field>
              <Field label="Payment terms (days)">
                <input type="number" min="0" max="365" className="ac-input" disabled={locked} value={shown.payment_terms_days} onChange={(e) => setProfile({ ...shown, payment_terms_days: e.target.value })} />
              </Field>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h3 className="nc-title">Contract terms</h3>
            <Field label="Billing type" required>
              <div className="ac-pills">
                {TYPES.map(([v, l]) => (
                  <button key={v} type="button" className={`ac-pill ${terms.billing_type === v ? "active" : ""}`}
                    onClick={() => {
                      setT({ billing_type: v, frequency_months: v === "ONE_TIME" ? null : terms.frequency_months || 1, po_required: PO_TYPES.includes(v) ? true : terms.po_required });
                      if (lines.every((l) => l.rate === "")) setLines([newLine(v === "TERMITE")]);
                    }}>{l}</button>
                ))}
              </div>
            </Field>
            <div className="bl-grid g2" style={{ marginTop: 12 }}>
              <Field label="Billing frequency" required>
                <FrequencySelect value={terms.frequency_months} oneTime={terms.billing_type === "ONE_TIME"} onChange={(v) => setT({ frequency_months: v })} />
              </Field>
              <Field label="Bill date" required>
                <select className="ac-select" value={terms.bill_timing} onChange={(e) => setT({ bill_timing: e.target.value })}>
                  <option value="ADVANCE">Start of the month</option>
                  <option value="ARREARS">End of the month</option>
                </select>
              </Field>
              <Field label="Term start date" required><input type="date" className="ac-input" value={terms.start_date} onChange={(e) => setT({ start_date: e.target.value })} /></Field>
              <Field label="Term end date" hint="Leave empty if it runs until ended"><input type="date" className="ac-input" value={terms.end_date} onChange={(e) => setT({ end_date: e.target.value })} /></Field>
              <Field label="GST" hint={residential ? "Residential customer: never charged GST" : gstOn ? gstHint(terms.gst_rate, profile?.state_code) : "Invoices go out without GST"}>
                <div className="nc-gst">
                  <select className="ac-select" value={gstOn ? "YES" : "NO"} disabled={residential} onChange={(e) => setT({ gst_applicable: e.target.value === "YES" })}>
                    <option value="YES">Apply GST</option>
                    <option value="NO">No GST</option>
                  </select>
                  {gstOn && (
                    <span className="nc-rate">
                      <input type="number" min="5" max="28" step="1" className="ac-input" value={terms.gst_rate} onChange={(e) => setT({ gst_rate: e.target.value })} aria-label="GST rate in percent" />
                      <b>%</b>
                    </span>
                  )}
                </div>
              </Field>
              <Field label="Bill structure" hint={terms.shortfall_billing === "FULL" ? "The full amount every period, even if a service is missed" : "Billed for the services actually done (amount ÷ planned × done)"}>
                <select className="ac-select" value={terms.shortfall_billing} onChange={(e) => setT({ shortfall_billing: e.target.value })}>
                  <option value="FULL">Fixed amount</option>
                  <option value="PRO_RATA">Service based</option>
                </select>
              </Field>
              <Field label="Purchase order">
                <label className="bl-toggle">
                  <input type="checkbox" checked={needsPo} disabled={PO_TYPES.includes(terms.billing_type)} onChange={(e) => setT({ po_required: e.target.checked })} />
                  {PO_TYPES.includes(terms.billing_type) ? "Always needed for this type" : "This customer needs a PO on its invoices"}
                </label>
              </Field>
              <Field label="Description on invoice" required hint={description ? `On the invoice: “${descriptionPreview(description, next)}”` : "Type it, or choose a saved one. {month}, {period}, {from_month}, {to_month} are filled in. A new wording is saved for next time."}>
                <DescriptionPicker value={terms.description_template ?? suggested} onChange={(text) => setT({ description_template: text })} />
              </Field>
              <Field label="Notes" className="bl-span2"><input className="ac-input" value={terms.notes} maxLength={1000} onChange={(e) => setT({ notes: e.target.value })} /></Field>
            </div>
            {next && (
              <div className="ac-info" style={{ marginTop: 12 }}>
                <span>ⓘ First invoice: <b>{dmy(next.start)} to {dmy(next.end)}</b>, in the <b>Bill Run for {monthLabel(next.billMonth)}</b>.</span>
              </div>
            )}
          </>
        )}

        {step === 3 && (
          <>
            {/* Title with + Add PO at the top right (Cancel while a new PO is being typed). */}
            <div className="nc-title-row">
              <h3 className="nc-title">Purchase order</h3>
              {addingPo ? (
                <button type="button" className="ac-btn" onClick={cancelNewPo}>✕ Cancel new PO</button>
              ) : (
                <button type="button" className="ac-btn ac-btn-primary" onClick={startNewPo}>+ Add PO</button>
              )}
            </div>
            {/* The customer's purchase orders: picking one fills in its details below. No PO yet: + Add PO. */}
            {!addingPo && (
              <div className="nc-po-pick">
                <Field label="Existing purchase order" hint={poData && !poRows.length ? "This customer has no purchase order yet. Use + Add PO to add one." : ""}>
                  <select className="ac-select" value={poId} disabled={!poRows.length} onChange={(e) => choosePo(e.target.value)}>
                    <option value="">{!poData ? "Loading…" : poRows.length ? "Choose a PO…" : "No purchase orders yet"}</option>
                    {poRows.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.po_number} · {p.is_open_po ? "Open PO" : p.expiry_date ? `till ${dmy(p.expiry_date)}` : `from ${dmy(p.po_date)}`}{p.kind === "ADVANCE" ? " · Advance" : ""}{p.po_amount !== null ? ` · ₹${amount(p.po_amount)}` : ""}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            )}

            {/* Shown all the time: the chosen PO's details (read-only), or a new PO while + Add PO is open. */}
            <div className="nc-po-state">{poId ? "Details of the chosen PO (change them in Purchase Orders)" : addingPo ? "New purchase order" : "Purchase order details (choose a PO above, or + Add PO)"}</div>
            <div className="bl-grid g2">
              <Field label="PO number" required><input className="ac-input" value={po.po_number} disabled={!addingPo} maxLength={100} onChange={(e) => setP({ po_number: e.target.value })} /></Field>
              <Field label="PO date" required><input type="date" className="ac-input" value={po.po_date} disabled={!addingPo} onChange={(e) => setP({ po_date: e.target.value })} /></Field>
              <Field label="Valid from"><input type="date" className="ac-input" value={po.valid_from} disabled={!addingPo} onChange={(e) => setP({ valid_from: e.target.value })} /></Field>
              <Field label="Expiry date">
                <input type="date" className="ac-input" value={po.open ? "" : po.expiry_date} disabled={!addingPo || po.open} onChange={(e) => setP({ expiry_date: e.target.value })} />
                <label className="bl-toggle" style={{ paddingTop: 4 }}><input type="checkbox" checked={po.open} disabled={!addingPo} onChange={(e) => setP({ open: e.target.checked })} /> Open PO (no end date)</label>
              </Field>
              <Field label="PO amount (₹, incl. GST)" required={po.kind === "ADVANCE"} hint={addingPo && po.kind !== "ADVANCE" ? "Leave empty for no limit" : ""}>
                <input type="number" min="0" step="0.01" className="ac-input" value={po.po_amount} disabled={!addingPo} onChange={(e) => setP({ po_amount: e.target.value })} />
              </Field>
              <Field label="Type">
                <select className="ac-select" value={po.kind} disabled={!addingPo} onChange={(e) => setP({ kind: e.target.value })}>
                  <option value="STANDARD">Standard</option>
                  <option value="ADVANCE">Advance (paid before the work)</option>
                </select>
              </Field>
              <Field label="Remarks" className="bl-span2"><input className="ac-input" value={po.remarks} disabled={!addingPo} maxLength={1000} onChange={(e) => setP({ remarks: e.target.value })} /></Field>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <h3 className="nc-title">Services and prices</h3>
            <p className="ac-sub" style={{ margin: "-6px 0 14px" }}>
              {termite ? "Rate per sq. m and the treated area; amount = rate × area" : "Amount = quantity × rate"}
              {residential || terms.gst_applicable === false ? ", no GST." : ", excluding GST (added on the invoice)."}
              {!termite && " Services and how many per month come from the customer's Service Plan; the invoice bills the services completed each month."}
            </p>
            {/* What is billed: services from the service list, chemicals (typed), or both. */}
            <div className="nc-kinds" role="group" aria-label="What is billed">
              {[["SERVICE", "Services"], ["CHEMICAL", "Chemicals"]].map(([k, label]) => (
                <label key={k} className={`nc-kind ${kinds[k] ? "on" : ""}`}>
                  <input type="checkbox" checked={kinds[k]} onChange={() => toggleKind(k)} /> {label}
                </label>
              ))}
            </div>

            {kinds.SERVICE && (
              <section className="nc-sec">
                <div className="nc-sec-title">Services</div>
                {!termite ? (
                  <>
                    {planLoading && <div className="ac-sub">Loading the Service Plan…</div>}
                    {!planLoading && !planServices.length && (
                      <div className="bl-msg err">This customer has no Service Plan yet. The Service Coordinator sets the services and how many per month in Service Plans; they then appear here for their rate.</div>
                    )}
                    {planServices.length > 0 && (
                      <div className="ac-sub" style={{ fontSize: 12, marginBottom: 6 }}>
                        Amount = completed × rate. Completed is what the Service Coordinator entered for {monthLabel(doneMonth)}; each invoice uses the completed number of its own month.
                      </div>
                    )}
                    {planServices.length > 0 && (
                      <div className="nc-lines priced svc">
                        <div className="nc-line nc-head">
                          <span>Service (from the Service Plan)</span>
                          <span className="nc-num">Per month (plan)</span>
                          <span className="nc-num">Completed ({monthLabel(doneMonth).split(" ")[0]})</span>
                          <span className="nc-num">Rate per service (₹)</span>
                          <span className="nc-num">Amount (₹)</span>
                        </div>
                        {lines.filter((l) => l.kind === "SERVICE").map((l) => (
                          <div key={l.key} className="nc-line-wrap">
                            <div className="nc-line">
                              <div className="nc-pickcell">
                                <input type="checkbox" className="bl-cb" checked={l.picked} disabled={l.rate === ""} onChange={(e) => setLine(l.key, { picked: e.target.checked })} aria-label="Tick for an invoice line summary" />
                                <span className="nc-svc-name">{l.item_name}</span>
                              </div>
                              <span className="nc-num nc-plan">{l.planQty ?? l.qty}</span>
                              <span className="nc-num nc-qty" title={l.completed === null || l.completed === undefined ? "Not entered yet in Service Plans; the plan's number is used until then" : ""}>
                                {l.completed === null || l.completed === undefined ? <span className="bl-warn" style={{ display: "inline" }}>Not entered</span> : l.completed}
                              </span>
                              <input type="number" min="0" step="0.01" className="ac-input" value={l.rate} placeholder="0.00" onChange={(e) => setLine(l.key, { rate: e.target.value })} aria-label={`Rate per service for ${l.item_name}`} />
                              <span className="nc-num nc-amt">{l.rate === "" ? "—" : amount(lineTotal(l, termite))}</span>
                            </div>
                            {l.group && <div className="nc-in-group">In invoice line “{l.group}”</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                <>
                <div className={`nc-lines ${termite ? "termite" : ""}`}>
                  <div className="nc-line nc-head">
                    <span>Service</span>
                    {termite ? <><span>Rate / sq. m (₹)</span><span>Area (sq. m)</span></> : <span>Amount (₹)</span>}
                    {canPlan && !termite && <span>Per month</span>}
                    <span />
                  </div>
                  {lines.filter((l) => l.kind === "SERVICE").map((l) => (
                    <div key={l.key} className="nc-line-wrap">
                      <div className="nc-line">
                        <div className="nc-pickcell">
                          <input type="checkbox" className="bl-cb" checked={l.picked} disabled={!l.item_name || l.rate === ""} onChange={(e) => setLine(l.key, { picked: e.target.checked })} aria-label="Tick for an invoice line summary" />
                          <select className="ac-select" value={l.item_name} onChange={(e) => setLine(l.key, { item_name: e.target.value })} aria-label="Service">
                            <option value="">Choose the service…</option>
                            {serviceGroups.map(([label, names]) => (
                              <optgroup key={label} label={label}>{names.map((n) => <option key={n} value={n}>{n}</option>)}</optgroup>
                            ))}
                            {l.item_name && !serviceGroups.some(([, names]) => names.includes(l.item_name)) && <option value={l.item_name}>{l.item_name}</option>}
                          </select>
                        </div>
                        <input type="number" min="0" step="0.01" className="ac-input" value={l.rate} placeholder="0.00" onChange={(e) => setLine(l.key, { rate: e.target.value })} aria-label={termite ? "Rate per square metre" : "Amount"} />
                        {termite && <input type="number" min="0" step="0.01" className="ac-input" value={l.area} placeholder="sq. m" onChange={(e) => setLine(l.key, { area: e.target.value })} aria-label="Area in square metres" />}
                        {canPlan && !termite && (
                          <div className="bl-stp sp-stp">
                            <button type="button" onClick={() => setLine(l.key, { visits: Math.max(1, (Number(l.visits) || 1) - 1) })} aria-label="Fewer per month">−</button>
                            <input type="number" min="1" max="31" value={l.visits} onChange={(e) => setLine(l.key, { visits: e.target.value })} aria-label="Per month" />
                            <button type="button" onClick={() => setLine(l.key, { visits: Math.min(31, (Number(l.visits) || 0) + 1) })} aria-label="More per month">+</button>
                          </div>
                        )}
                        <button type="button" className="bl-x" disabled={lines.filter((x) => x.kind === "SERVICE").length === 1 && !kinds.CHEMICAL} onClick={() => setLines(lines.filter((x) => x.key !== l.key))} aria-label="Remove service">✕</button>
                      </div>
                      {l.group && <div className="nc-in-group">In invoice line “{l.group}”</div>}
                    </div>
                  ))}
                </div>
                <button type="button" className="sp-add" style={{ marginTop: 8 }} onClick={() => setLines([...lines, newLine(termite, "SERVICE")])}>+ Add service</button>
                </>
                )}
              </section>
            )}

            {kinds.CHEMICAL && (
              <section className="nc-sec">
                <div className="nc-sec-title">Chemicals</div>
                <datalist id="nc-chemicals">{(chemicals || []).map((c) => <option key={c} value={c} />)}</datalist>
                <div className="nc-lines priced">
                  <div className="nc-line nc-head">
                    <span>Chemical</span>
                    <span className="nc-num">Qty</span>
                    <span className="nc-num">Rate (₹)</span>
                    <span className="nc-num">Amount (₹)</span>
                    <span />
                  </div>
                  {lines.filter((l) => l.kind === "CHEMICAL").map((l) => (
                    <div key={l.key} className="nc-line-wrap">
                      <div className="nc-line">
                        <div className="nc-pickcell">
                          <input type="checkbox" className="bl-cb" checked={l.picked} disabled={!l.item_name.trim() || l.rate === ""} onChange={(e) => setLine(l.key, { picked: e.target.checked })} aria-label="Tick for an invoice line summary" />
                          <input className="ac-input" list="nc-chemicals" value={l.item_name} maxLength={255} placeholder="Type or choose the chemical" onChange={(e) => setLine(l.key, { item_name: e.target.value })} aria-label="Chemical" />
                        </div>
                        <input type="number" min="0" step="0.001" className="ac-input" value={l.qty} placeholder="Qty" onChange={(e) => setLine(l.key, { qty: e.target.value })} aria-label="Chemical quantity" />
                        <input type="number" min="0" step="0.01" className="ac-input" value={l.rate} placeholder="0.00" onChange={(e) => setLine(l.key, { rate: e.target.value })} aria-label="Chemical rate" />
                        <span className="nc-num nc-amt">{l.rate === "" ? "—" : amount(lineTotal(l, termite))}</span>
                        <button type="button" className="bl-x" disabled={lines.filter((x) => x.kind === "CHEMICAL").length === 1 && !kinds.SERVICE} onClick={() => setLines(lines.filter((x) => x.key !== l.key))} aria-label="Remove chemical">✕</button>
                      </div>
                      {l.group && <div className="nc-in-group">In invoice line “{l.group}”</div>}
                    </div>
                  ))}
                </div>
                <button type="button" className="sp-add" style={{ marginTop: 8 }} onClick={() => setLines([...lines, newLine(false, "CHEMICAL")])}>+ Add chemical</button>
                <div className="ac-sub" style={{ fontSize: 12, marginTop: 6 }}>A new chemical is saved for other customers too. Each period bills quantity × rate.</div>
              </section>
            )}

            <div className="nc-total">Total per period: <b>₹{amount(total)}</b>{gstOn ? ` + GST ${terms.gst_rate}%` : ""}</div>

            {/* Invoice line summaries: ticked lines print as ONE invoice line (summary + their total).
                Lines not in a summary print one by one. */}
            {filledLines.length > 1 && (
              <div className="nc-summary">
                <div className="nc-sec-title" style={{ margin: 0 }}>Invoice line summaries (optional)</div>
                {picked.length ? (
                  <div className="nc-summary-row">
                    <input className="ac-input" value={groupText} maxLength={255} autoFocus placeholder={`Summary for the ${picked.length} ticked, e.g. Pest control services`} onChange={(e) => setGroupText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && applyGroup()} aria-label="Invoice line summary" />
                    <span className="nc-summary-amt">₹{amount(pickedTotal)}</span>
                    <button type="button" className="ac-btn ac-btn-primary" disabled={!groupText.trim()} onClick={applyGroup}>Add summary</button>
                  </div>
                ) : (
                  <div className="ac-sub" style={{ fontSize: 12.5 }}>Tick the services or chemicals to print as one invoice line, then type their summary. Lines not ticked print one by one.</div>
                )}
                {picked.length > 0 && <div className="ac-sub" style={{ fontSize: 12 }}>Ticked: {picked.map((l) => l.item_name).join(", ")}</div>}
                {groups.length > 0 && (
                  <ul className="nc-groups">
                    {groups.map(([name, ls]) => (
                      <li key={name}>
                        <div className="nc-group-main">
                          <b>{name}</b>
                          <span className="ac-sub">{ls.map((l) => l.item_name).join(", ")}</span>
                        </div>
                        <span className="nc-summary-amt">₹{amount(ls.reduce((t, l) => t + lineTotal(l, termite), 0))}</span>
                        <button type="button" className="ac-btn sm" onClick={() => removeGroup(name)}>Remove</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}

        {step === 5 && (
          <>
            <h3 className="nc-title">Review</h3>
            <dl className="nc-review">
              <dt>Customer</dt><dd>{customer?.name} <span className="ac-sub">({CATEGORY_LABEL[customer?.category]})</span></dd>
              <dt>Bill To</dt><dd>{profile?.billing_name}{profile?.gst_number ? ` · GSTIN ${profile.gst_number}` : ""}</dd>
              <dt>Contract</dt>
              <dd>{TYPES.find(([v]) => v === terms.billing_type)?.[1]}{terms.billing_type !== "ONE_TIME" ? `, every ${terms.frequency_months} month${terms.frequency_months > 1 ? "s" : ""}` : ""}, billed at the {terms.bill_timing === "ADVANCE" ? "start" : "end"} of the month, from {dmy(terms.start_date)}{terms.end_date ? ` to ${dmy(terms.end_date)}` : ""}</dd>
              <dt>GST</dt><dd>{gstOn ? `${terms.gst_rate}% GST` : "No GST"}</dd>
              <dt>Description</dt><dd>{descriptionPreview(description, next)}</dd>
              {needsPo && <><dt>Purchase order</dt><dd>{poRows.find((p) => p.id === poId)?.po_number || (poId ? "Chosen" : "—")}</dd></>}
              <dt>Services</dt>
              <dd>{filledLines.map((l) => (
                <div key={l.key}>{l.item_name}: {termite && l.kind === "SERVICE" ? `${l.area} sq. m` : `${l.qty}${l.kind === "SERVICE" ? " / month" : ""}`} × ₹{amount(Number(l.rate))} = ₹{amount(lineTotal(l, termite))}</div>
              ))}</dd>
              {next && <><dt>First invoice</dt><dd>{dmy(next.start)} to {dmy(next.end)}, Bill Run for {monthLabel(next.billMonth)}</dd></>}
            </dl>
            <ul className="nc-check">
              <li className="ok">Customer type set</li>
              <li className="ok">Billing details saved</li>
              {needsPo && <li className={poId ? "ok" : "bad"}>Purchase order {poId ? "chosen" : "missing"}</li>}
              <li className={filledLines.length ? "ok" : "bad"}>{filledLines.length} service{filledLines.length === 1 ? "" : "s"} priced</li>
              {!termite && kinds.SERVICE && <li className="info">Services per month: from the Service Plan (set by the Service Coordinator)</li>}
            </ul>
          </>
        )}

        <Msg {...msg} />
        <div className="nc-foot">
          {at > 0 ? <button type="button" className="ac-btn" disabled={busy} onClick={goBack}>← Back</button> : <button type="button" className="ac-btn" onClick={() => navigate("/billing/contracts")}>Cancel</button>}
          {step === 5 ? (
            <button type="button" className="ac-btn ac-btn-primary" disabled={busy} onClick={create}>{busy ? "Creating…" : "Create contract"}</button>
          ) : (
            <button type="button" className="ac-btn ac-btn-primary" disabled={busy || (step === 1 && (!customer?.category || !profile))} onClick={goNext}>
              {busy ? "Saving…" : step === 1 ? "Save and continue →" : step === 3 && addingPo ? "Save PO and continue →" : "Next →"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Service names: pest control and deep cleaning (the booking lists), then the others used on jobs or quotations. */
function groupsFor(options) {
  const seen = new Set();
  const take = (names) => names.filter((n) => {
    const k = String(n || "").trim().toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const others = [
    ...(options?.services || []).map((s) => s.sub_service),
    ...(options?.all_services || []),
    ...(options?.catalog || []).map((c) => c.name),
  ];
  return [
    ["Pest control", take(pestServices)],
    ["Deep cleaning", take(deepCleaningServices)],
    ["Other", take(others).sort((a, b) => a.localeCompare(b))],
  ].filter(([, names]) => names.length);
}

/** The description as it will read on the first invoice ({month} -> November 2026, ...). */
function descriptionPreview(text, period) {
  if (!period) return text;
  const values = {
    "{month}": monthLabel(period.start),
    "{period}": period.start === period.end ? dmy(period.start) : `${dmy(period.start)} to ${dmy(period.end)}`,
    "{from_month}": monthLabel(period.start),
    "{to_month}": monthLabel(period.end),
  };
  return String(text).replace(/\{(month|period|from_month|to_month)\}/g, (m) => values[m]);
}

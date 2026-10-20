// The quotation builder: makes a customer quotation for a lead from the quotation master
// (services with their treatment rows, the price chart and the standard clauses), shows it
// as a draft PDF, and saves it. Saving numbers it (QT-...), stores the PDF on the lead and
// moves the lead to Quotation Sent - the same outcome as uploading a PDF.
//
// The server draws the PDF and checks everything again (utils/crmQuotationDocument.js).

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { FiCheck, FiChevronDown, FiChevronUp, FiDownload, FiEye, FiFileText, FiPlus, FiSend, FiTrash2, FiX } from "react-icons/fi";
import { money } from "./format";
import { generateQuotation, getActiveQuoteMaster, previewQuotation } from "./leadsApi";
import { useToast } from "./hooks";
import { frequencyNames, frequencyOptions, sortPlans } from "./quoteOptions";
import { Alert, Button, Empty, Field, Modal, Note, SkeletonRows } from "./ui";

const ROW_KEYS = ["defense_area", "material_used", "treatment_area", "frequency"];
const BLANK_ROW = { defense_area: "", material_used: "", treatment_area: "", frequency: "" };

/** "A", "A and B", "A, B and C". */
function joinNames(names) {
  if (names.length <= 1) return names[0] || "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
const defaultSubject = (names, customer) =>
  `Proposal, recommendation and treatment method for ${joinNames(names) || "pest control"} at your ${customer ? `${customer} ` : ""}premises.`;

/** One small section of the form with a number, a title and a line under it. */
function Step({ no, title, sub, children, action }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, paddingBottom: 8, marginBottom: 14, borderBottom: "1px solid var(--lm-line)" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15 }}>
            <span style={{ color: "var(--lm-primary)", marginRight: 8 }}>{no}</span>
            {title}
          </h3>
          {!!sub && <p className="lm-hint" style={{ margin: "2px 0 0" }}>{sub}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

/**
 * The draft PDF over the whole screen, inside the page (no pop-up to block). Rendered inside
 * .lm-root, where the Lead Management button styles live.
 */
function PreviewOverlay({ url, fileName, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 3000, background: "rgba(15,23,42,.72)", display: "flex", flexDirection: "column" }} role="dialog" aria-modal="true" aria-label="Quotation preview">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 16px", background: "#fff" }}>
        <strong>Preview - draft, not saved</strong>
        <span style={{ display: "flex", gap: 8 }}>
          <a className="lm-btn ghost sm" href={url} download={fileName} style={{ textDecoration: "none" }}>
            <FiDownload /> Download
          </a>
          <Button size="sm" icon={<FiX />} onClick={onClose}>
            Close Preview
          </Button>
        </span>
      </div>
      <iframe title="Quotation preview" src={url} style={{ flex: 1, border: 0, width: "100%", background: "#525659" }} />
    </div>,
    document.querySelector(".lm-root") || document.body,
  );
}

/** A picked service: its plan, price and treatment rows (copied from the master, edited here only). */
function ServicePick({ service, pick, plans, frequencies, packageMode, onChange, onRemove }) {
  // Every active plan can be picked; one with no price in the chart for this service needs a price typed in.
  const priced = new Set(service.prices.map((x) => x.plan_id));
  const setRow = (i, key, value) => onChange({ rows: pick.rows.map((r, j) => (j === i ? { ...r, [key]: value } : r)) });

  // Picking a plan sets the price from the chart and every row's frequency to the plan's name
  // (e.g. Weekly Once); both can still be changed afterwards.
  function choosePlan(planId) {
    const price = service.prices.find((x) => x.plan_id === planId)?.price;
    const frequency = plans.find((p) => p.id === planId)?.name || "";
    onChange({
      planId,
      // No price for this plan in the chart: start at 0 (not the previous plan's price) for the salesperson to fill in.
      price: price !== undefined ? String(price) : "0",
      ...(frequency ? { rows: pick.rows.map((r) => ({ ...r, frequency })) } : {}),
    });
  }

  const plan = plans.find((p) => p.id === pick.planId);
  return (
    <div style={{ border: "1px solid var(--lm-border)", borderRadius: 14, padding: 14, marginBottom: 12, background: "#fff" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 200px" }}>
          <div className="lm-label">Service</div>
          <strong style={{ fontSize: 15 }}>{service.name}</strong>
          <div className="lm-hint">{pick.rows.length} treatment row{pick.rows.length === 1 ? "" : "s"}</div>
        </div>
        {!packageMode && (
          <>
            <label className="lm-field" style={{ flex: "1 1 220px" }}>
              <span className="lm-label">Plan <i>*</i></span>
              <select className="lm-select" style={{ width: "100%", height: 44 }} value={pick.planId} onChange={(e) => choosePlan(e.target.value)}>
                <option value="">Select plan</option>
                {sortPlans(plans).map((p) => (
                  <option key={p.id} value={p.id}>{priced.has(p.id) ? p.name : `${p.name} (no price set)`}</option>
                ))}
              </select>
            </label>
            <label className="lm-field" style={{ flex: "0 1 170px" }}>
              <span className="lm-label">Price (Rs.) {plan ? { MONTHLY: "/ month", YEARLY: "/ year", ONE_TIME: "one-time" }[plan.billing] : ""} <i>*</i></span>
              <input
                className={`lm-input${plan && !priced.has(plan.id) ? " bad" : ""}`}
                inputMode="decimal"
                value={pick.price}
                onChange={(e) => onChange({ price: e.target.value.replace(/[^\d.]/g, "") })}
                placeholder="0"
              />
            </label>
          </>
        )}
        <span style={{ display: "flex", gap: 6 }}>
          <Button variant="ghost" icon={pick.open ? <FiChevronUp /> : <FiChevronDown />} onClick={() => onChange({ open: !pick.open })}>
            {pick.open ? "Hide rows" : "Edit rows"}
          </Button>
          <Button variant="ghost" icon={<FiTrash2 />} onClick={onRemove} aria-label={`Remove ${service.name}`} />
        </span>
      </div>
      {/* Shown under the whole row so the fields above stay aligned. */}
      {!packageMode && plan && !priced.has(plan.id) && (
        <div style={{ marginTop: 10 }}>
          <Note tone="warn">
            No price in the master for <b>{plan.name}</b>. Enter the price, or set it once in Quotation Master &rarr; Price Chart.
          </Note>
        </div>
      )}

      {pick.open && (
        <div style={{ marginTop: 14 }}>
          <div className="lm-table-wrap">
            <table className="lm-table">
              <thead>
                <tr>
                  <th>Defense Area</th>
                  <th>Material Used</th>
                  <th>Location / Treatment Area</th>
                  <th style={{ width: 140 }}>Frequency</th>
                  <th aria-label="Remove" style={{ width: 50 }} />
                </tr>
              </thead>
              <tbody>
                {pick.rows.map((r, i) => (
                  <tr key={i} style={{ cursor: "default", animation: "none" }}>
                    {ROW_KEYS.map((k) => (
                      <td key={k}>
                        {k === "frequency" ? (
                          <select className="lm-select" style={{ width: "100%", height: 38 }} value={r.frequency} onChange={(e) => setRow(i, "frequency", e.target.value)} aria-label={`${service.name} row ${i + 1} frequency`}>
                            <option value="">Select</option>
                            {frequencyOptions(frequencies, r.frequency).map((f) => (
                              <option key={f} value={f}>{f}</option>
                            ))}
                          </select>
                        ) : (
                          <input className="lm-input" style={{ height: 38 }} value={r[k]} onChange={(e) => setRow(i, k, e.target.value)} maxLength={k === "treatment_area" ? 255 : k === "material_used" ? 160 : 120} aria-label={`${service.name} row ${i + 1} ${k.replace("_", " ")}`} />
                        )}
                      </td>
                    ))}
                    <td>
                      <Button size="sm" variant="ghost" icon={<FiTrash2 />} disabled={pick.rows.length === 1} onClick={() => onChange({ rows: pick.rows.filter((_, j) => j !== i) })} aria-label="Remove row" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 8 }}>
            <Button size="sm" variant="ghost" icon={<FiPlus />} onClick={() => onChange({ rows: [...pick.rows, { ...BLANK_ROW, frequency: plan?.name || "" }] })}>Add Row</Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Standard clauses (locked ones always included, optional ones tickable) plus lines typed for this customer only. */
function ClausePicker({ title, clauses, checked, onToggle, extra, onExtra }) {
  const [draft, setDraft] = useState("");
  function add() {
    const t = draft.trim();
    if (t.length < 3) return;
    onExtra([...extra, t]);
    setDraft("");
  }
  return (
    <div style={{ marginBottom: 18 }}>
      <div className="lm-label" style={{ marginBottom: 8 }}>{title}</div>
      <div style={{ display: "grid", gap: 6 }}>
        {/* "Always included" lines are not listed - they always go on the quotation PDF. */}
        {clauses
          .filter((c) => !c.is_default)
          .map((c) => (
            <label key={c.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
              <input type="checkbox" checked={checked.has(c.id)} onChange={() => onToggle(c.id)} style={{ marginTop: 3 }} />
              <span>{c.text}</span>
            </label>
          ))}
        {extra.map((t, i) => (
          <div key={`x${i}`} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <input type="checkbox" checked readOnly style={{ marginTop: 3 }} aria-label="Added for this quotation" />
            <span style={{ flex: 1 }}>{t} <span className="lm-hint">(this quotation only)</span></span>
            <Button size="sm" variant="ghost" icon={<FiTrash2 />} onClick={() => onExtra(extra.filter((_, j) => j !== i))} aria-label="Remove line" />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <input className="lm-input" value={draft} maxLength={500} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Add a line for this customer only..." aria-label={`Add to ${title}`} />
        <Button variant="ghost" icon={<FiPlus />} onClick={add} disabled={draft.trim().length < 3}>Add</Button>
      </div>
    </div>
  );
}

// A service as it starts on the quotation: its treatment rows from the master, on the cheapest
// monthly plan the price chart offers (else the first priced plan), every row on that plan.
function startPick(service, plans, perService) {
  const priced = plans.filter((p) => service.prices.some((x) => x.plan_id === p.id));
  const first = priced.find((p) => p.billing === "MONTHLY") || priced[0];
  const price = first ? service.prices.find((x) => x.plan_id === first.id)?.price : undefined;
  const frequency = perService ? first?.name || "" : "";
  return {
    planId: first?.id || "",
    price: price !== undefined ? String(price) : "",
    rows: service.treatments.length
      ? service.treatments.map((t) => ({ defense_area: t.defense_area, material_used: t.material_used, treatment_area: t.treatment_area, frequency: frequency || t.frequency }))
      : [{ ...BLANK_ROW, frequency }],
    open: false,
  };
}

export default function QuotationBuilder({ lead, onClose }) {
  // The services the customer asked for on the lead (Quotation Master ids) - ticked to start with.
  const [leadServices] = useState(() => lead.services || []);
  const toast = useToast();
  const [master, setMaster] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [customer, setCustomer] = useState({ name: lead.company || lead.contact || "", address: lead.address || "", attention: lead.contact || "", phone: lead.phone || "" });
  const [picks, setPicks] = useState({}); // serviceId -> { planId, price, rows, open }
  const [order, setOrder] = useState([]); // serviceIds in the order picked
  const [subject, setSubject] = useState("");
  const [subjectEdited, setSubjectEdited] = useState(false);
  const [revised, setRevised] = useState(false);
  const [validDays, setValidDays] = useState("30");
  const [contractMonths, setContractMonths] = useState("12");
  const [discount, setDiscount] = useState(""); // special discount in rupees, off the main total
  const [mode, setMode] = useState("PER_SERVICE");
  const [pkg, setPkg] = useState({ amount: "", billing: "MONTHLY", planLabel: "", description: "" });
  const [checked, setChecked] = useState(new Set());
  const [extraValue, setExtraValue] = useState([]);
  const [extraTerms, setExtraTerms] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(""); // "preview" | "send"
  const [previewUrl, setPreviewUrl] = useState("");
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let alive = true;
    getActiveQuoteMaster()
      .then((m) => {
        if (!alive) return;
        setMaster(m);
        const asked = leadServices.map((id) => m.services.find((s) => s.id === id)).filter(Boolean);
        if (asked.length) {
          setPicks(Object.fromEntries(asked.map((s) => [s.id, startPick(s, m.plans, true)])));
          setOrder(asked.map((s) => s.id));
        }
      })
      .catch((err) => alive && setLoadError(err.message || "Could not load the quotation master."));
    return () => {
      alive = false;
    };
  }, [leadServices]);
  useEffect(() => () => previewUrl && URL.revokeObjectURL(previewUrl), [previewUrl]);

  const serviceById = useMemo(() => new Map((master?.services || []).map((s) => [s.id, s])), [master]);
  const pickedNames = order.map((id) => serviceById.get(id)?.name).filter(Boolean);
  const shownSubject = subjectEdited ? subject : defaultSubject(pickedNames, customer.name.trim());

  const totals = useMemo(() => {
    if (mode === "PACKAGE") {
      const a = Number(pkg.amount) || 0;
      return { monthly: pkg.billing === "MONTHLY" ? a : 0, yearly: pkg.billing === "YEARLY" ? a : 0, oneTime: pkg.billing === "ONE_TIME" ? a : 0 };
    }
    let monthly = 0;
    let yearly = 0;
    let oneTime = 0;
    for (const id of order) {
      const p = picks[id];
      const plan = master?.plans.find((x) => x.id === p.planId);
      const v = Number(p.price) || 0;
      if (plan?.billing === "ONE_TIME") oneTime += v;
      else if (plan?.billing === "YEARLY") yearly += v;
      else monthly += v;
    }
    return { monthly, yearly, oneTime };
  }, [mode, pkg, order, picks, master]);

  // The discount comes off the main total: monthly if there is one, else the AMC, else one-time
  // (the same rule the server uses).
  const mainBilling = totals.monthly > 0 ? "MONTHLY" : totals.yearly > 0 ? "YEARLY" : "ONE_TIME";
  const mainTotal = { MONTHLY: totals.monthly, YEARLY: totals.yearly, ONE_TIME: totals.oneTime }[mainBilling];
  const discountValue = Number(discount) || 0;
  const finalTotal = Math.max(0, mainTotal - discountValue);
  const PER_TEXT = { MONTHLY: "/ month", YEARLY: "/ year (AMC)", ONE_TIME: "one-time" };

  function toggleService(service) {
    if (picks[service.id]) {
      removeService(service.id);
      return;
    }
    setPicks((all) => ({ ...all, [service.id]: startPick(service, master.plans, mode === "PER_SERVICE") }));
    setOrder((o) => [...o, service.id]);
  }
  function removeService(id) {
    setPicks((all) => {
      const next = { ...all };
      delete next[id];
      return next;
    });
    setOrder((o) => o.filter((x) => x !== id));
  }
  const updatePick = (id, patch) => setPicks((all) => ({ ...all, [id]: { ...all[id], ...patch } }));
  const toggleClause = (id) =>
    setChecked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /** The request body, or a message saying what is missing. */
  function build() {
    if (customer.name.trim().length < 2) return { problem: "Enter the customer name." };
    if (!order.length) return { problem: "Pick at least one service." };
    const services = [];
    for (const id of order) {
      const s = serviceById.get(id);
      const p = picks[id];
      const rows = p.rows.filter((r) => ROW_KEYS.some((k) => r[k].trim()));
      if (!rows.length) return { problem: `${s.name}: add at least one treatment row.` };
      if (rows.some((r) => ROW_KEYS.some((k) => !r[k].trim()))) return { problem: `${s.name}: a treatment row is not complete. Open "Edit rows" and fill every column or remove the row.` };
      const plan = master.plans.find((x) => x.id === p.planId);
      if (mode === "PER_SERVICE") {
        if (!plan) return { problem: `${s.name}: select a plan.` };
        if (p.price === "" || !(Number(p.price) >= 0)) return { problem: `${s.name}: enter the price.` };
      }
      services.push({
        name: s.name,
        plan: plan?.name || "",
        billing: plan?.billing || "MONTHLY",
        price: mode === "PER_SERVICE" ? Number(p.price) : null,
        rows: rows.map((r) => Object.fromEntries(ROW_KEYS.map((k) => [k, r[k].trim()]))),
      });
    }
    if (mode === "PACKAGE" && !(Number(pkg.amount) > 0)) return { problem: "Enter the package amount." };
    if (totals.monthly + totals.yearly + totals.oneTime <= 0) return { problem: "The total must be more than zero." };
    if (discountValue > 0 && discountValue >= mainTotal) return { problem: `The discount must be less than the total (${money(mainTotal)} ${PER_TEXT[mainBilling]}).` };
    if (shownSubject.trim().length < 5) return { problem: "Enter the subject." };
    const pickedClauses = (kind) => master.clauses.filter((c) => c.kind === kind && (c.is_default || checked.has(c.id))).map((c) => c.text);
    return {
      content: {
        customer: { name: customer.name.trim(), address: customer.address.trim(), attention: customer.attention.trim(), phone: customer.phone.trim() },
        subject: shownSubject.trim(),
        revised,
        validDays: Number(validDays) || 30,
        contractMonths: Number(contractMonths) || 12,
        discount: discountValue,
        services,
        pricing: mode === "PACKAGE"
          ? { mode, amount: Number(pkg.amount), billing: pkg.billing, planLabel: pkg.planLabel.trim(), description: pkg.description.trim() }
          : { mode },
        valueAdded: [...pickedClauses("VALUE_ADDED"), ...extraValue],
        terms: [...pickedClauses("TERMS"), ...extraTerms],
      },
    };
  }

  async function preview() {
    const { content, problem } = build();
    if (problem) return setError(problem);
    setError("");
    setBusy("preview");
    try {
      const url = await previewQuotation(lead.id, content);
      setPreviewUrl(url);
    } catch (err) {
      setError(err.message || "Could not make the preview.");
    } finally {
      setBusy("");
    }
  }

  function askToSend() {
    const { problem } = build();
    if (problem) return setError(problem);
    setError("");
    setConfirming(true);
  }

  async function send(closeConfirm) {
    const { content } = build();
    setBusy("send");
    try {
      const q = await generateQuotation(lead.id, content);
      toast(`${q.number} created. Open it from the Quotations tab.`);
      closeConfirm();
      onClose();
    } catch (err) {
      setError(err.message || "Could not save the quotation.");
      setBusy("");
      closeConfirm();
    }
  }

  const footer = (
    <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 18, flexWrap: "wrap" }}>
        {mainTotal > 0 &&
          (discountValue > 0 ? (
            <span style={{ display: "inline-flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <span className="muted" style={{ textDecoration: "line-through" }}>{money(mainTotal)}</span>
              <span style={{ color: "#15803d", fontWeight: 600 }}>- {money(discountValue)} discount</span>
              <strong style={{ fontSize: 16 }}>
                {money(finalTotal)} {PER_TEXT[mainBilling]}
              </strong>
            </span>
          ) : (
            <strong style={{ fontSize: 16 }}>
              {money(mainTotal)} {PER_TEXT[mainBilling]}
            </strong>
          ))}
        {/* the other totals (no discount on them) */}
        {mainBilling !== "YEARLY" && totals.yearly > 0 && <strong>{money(totals.yearly)} / year (AMC)</strong>}
        {mainBilling !== "ONE_TIME" && totals.oneTime > 0 && <strong>{money(totals.oneTime)} one-time</strong>}
        {mainTotal === 0 && <span className="lm-hint">Pick services to see the total</span>}
      </div>
      <span style={{ display: "flex", gap: 10 }}>
        <Button variant="ghost" icon={<FiEye />} busy={busy === "preview"} disabled={!!busy || !master} onClick={preview}>Preview PDF</Button>
        <Button icon={<FiSend />} disabled={!!busy || !master} onClick={askToSend}>Save &amp; Send</Button>
      </span>
    </div>
  );

  return (
    <Modal wide title="Create Quotation" sub={`${lead.company || lead.contact}${lead.number && lead.number !== "-" ? ` - ${lead.number}` : ""}`} onClose={onClose} footer={footer}>
      {loadError ? (
        <Empty title="Could not load the quotation master" text={loadError} icon={<FiFileText />} />
      ) : !master ? (
        <SkeletonRows rows={6} />
      ) : (
        <>
          <Step no="1" title="Customer" sub="Filled in from the lead. Change it if the quotation should go to a different name or address.">
            <div className="lm-form">
              <Field label="Customer / company name" required>
                <input className="lm-input" value={customer.name} maxLength={150} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} />
              </Field>
              <Field label="Contact person (Attn)">
                <input className="lm-input" value={customer.attention} maxLength={100} onChange={(e) => setCustomer({ ...customer, attention: e.target.value })} />
              </Field>
              <Field label="Address" wide>
                <textarea className="lm-textarea" style={{ minHeight: 70 }} value={customer.address} maxLength={400} onChange={(e) => setCustomer({ ...customer, address: e.target.value })} />
              </Field>
              <Field label="Phone">
                <input className="lm-input" value={customer.phone} maxLength={30} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} />
              </Field>
            </div>
          </Step>

          <Step no="2" title="Services" sub="Tick what the customer wants. Each service brings its standard treatment rows and price from the master.">
            {master.services.length === 0 ? (
              <Note tone="warn">No active services in the Quotation Master yet. Ask the sales manager to add them.</Note>
            ) : (
              <>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                  {master.services.map((s) => {
                    const on = !!picks[s.id];
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => toggleService(s)}
                        className={`lm-btn ${on ? "primary" : "ghost"}`}
                        aria-pressed={on}
                        style={{ borderRadius: 999 }}
                      >
                        {on ? <FiCheck /> : <FiPlus />} {s.name}
                      </button>
                    );
                  })}
                </div>
                {order.map((id) => (
                  <ServicePick
                    key={id}
                    service={serviceById.get(id)}
                    pick={picks[id]}
                    plans={master.plans}
                    frequencies={frequencyNames(master)}
                    packageMode={mode === "PACKAGE"}
                    onChange={(patch) => updatePick(id, patch)}
                    onRemove={() => removeService(id)}
                  />
                ))}
              </>
            )}
          </Step>

          <Step no="3" title="Price">
            <div className="lm-choice" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))", marginBottom: 14 }}>
              {[
                { key: "PER_SERVICE", label: "Price per service", hint: "Each service shows its own price; the total adds up." },
                { key: "PACKAGE", label: "One package price", hint: "One amount for all the services together." },
              ].map((o) => (
                <label key={o.key} className={`lm-radio tone-info${mode === o.key ? " on" : ""}`}>
                  <input type="radio" name="pricing" checked={mode === o.key} onChange={() => setMode(o.key)} />
                  <span className="lm-radio-mark" />
                  <span>
                    <strong>{o.label}</strong>
                    <div className="lm-hint">{o.hint}</div>
                  </span>
                </label>
              ))}
            </div>
            {mode === "PACKAGE" && (
              <div className="lm-form">
                <Field label="Package amount (Rs.)" required>
                  <input className="lm-input" inputMode="decimal" value={pkg.amount} onChange={(e) => setPkg({ ...pkg, amount: e.target.value.replace(/[^\d.]/g, "") })} placeholder="e.g. 158000" />
                </Field>
                <Field label="Billing">
                  <select className="lm-select" value={pkg.billing} onChange={(e) => setPkg({ ...pkg, billing: e.target.value })}>
                    <option value="MONTHLY">Per month</option>
                    <option value="YEARLY">Per year (AMC)</option>
                    <option value="ONE_TIME">One-time</option>
                  </select>
                </Field>
                <Field label="Plan shown on the quotation" hint="Optional, e.g. AMC, daily on-site team">
                  <input className="lm-input" value={pkg.planLabel} maxLength={80} onChange={(e) => setPkg({ ...pkg, planLabel: e.target.value })} />
                </Field>
                <Field label="Description" hint="Optional. Default: Pest management services 1 to N as per scope above">
                  <input className="lm-input" value={pkg.description} maxLength={200} onChange={(e) => setPkg({ ...pkg, description: e.target.value })} />
                </Field>
              </div>
            )}
            <Note tone="info">GST is shown as &quot;As applicable&quot; on the quotation.</Note>
          </Step>

          <Step no="4" title="Proposal details">
            <div className="lm-form">
              <Field label="Subject" wide hint={subjectEdited ? "" : "Written for you from the services picked. Edit it if you like."}>
                <textarea
                  className="lm-textarea"
                  style={{ minHeight: 64 }}
                  value={shownSubject}
                  maxLength={300}
                  onChange={(e) => {
                    setSubjectEdited(true);
                    setSubject(e.target.value);
                  }}
                />
              </Field>
              <Field label="Valid for (days)">
                <input className="lm-input" inputMode="numeric" value={validDays} onChange={(e) => setValidDays(e.target.value.replace(/\D/g, "").slice(0, 3))} />
              </Field>
              <Field label="Contract period (months)">
                <input className="lm-input" inputMode="numeric" value={contractMonths} onChange={(e) => setContractMonths(e.target.value.replace(/\D/g, "").slice(0, 2))} />
              </Field>
              <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                <input type="checkbox" checked={revised} onChange={(e) => setRevised(e.target.checked)} />
                <span>This is a revised proposal</span>
              </label>
            </div>
          </Step>

          <Step no="5" title="Discount" sub="Optional. A special discount in rupees, taken off the total. It shows on the quotation as a special discount with the final amount.">
            <div className="lm-form">
              <Field label={`Special discount (Rs.)${mainTotal > 0 ? ` - off the ${{ MONTHLY: "monthly", YEARLY: "yearly (AMC)", ONE_TIME: "one-time" }[mainBilling]} total` : ""}`}>
                <input className="lm-input" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value.replace(/[^\d.]/g, ""))} placeholder="e.g. 5000" />
              </Field>
              <div style={{ alignSelf: "end" }}>
                {mainTotal > 0 && (
                  <div style={{ border: "1px solid var(--lm-border)", borderRadius: 12, padding: "12px 14px", background: "#f8fafc", display: "grid", gap: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <span className="muted">Subtotal</span>
                      <span className="muted" style={{ textDecoration: discountValue > 0 ? "line-through" : "none" }}>
                        {money(mainTotal)} {PER_TEXT[mainBilling]}
                      </span>
                    </div>
                    {discountValue > 0 && (
                      // the discount on its own coloured bar, so it is what the eye lands on
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "8px 12px",
                          borderRadius: 10,
                          color: "#fff",
                          background: discountValue >= mainTotal ? "var(--lm-danger)" : "#16a34a",
                        }}
                      >
                        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>SPECIAL DISCOUNT</span>
                        <strong style={{ fontSize: 16 }}>- {money(discountValue)}</strong>
                      </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderTop: "1px solid var(--lm-border)", paddingTop: 8 }}>
                      <strong>Final amount</strong>
                      <strong style={{ fontSize: 18 }}>
                        {money(finalTotal)} <span style={{ fontSize: 13, fontWeight: 500 }}>{PER_TEXT[mainBilling]}</span>
                      </strong>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Step>

          <Step no="6" title="Value added services and terms" sub="The standard terms (taxes, payment, repellent machine, prevention suggestions ...) are added to every quotation automatically. Tick any optional lines that apply, and add lines for this customer only.">
            <ClausePicker title="Value Added Services" clauses={master.clauses.filter((c) => c.kind === "VALUE_ADDED")} checked={checked} onToggle={toggleClause} extra={extraValue} onExtra={setExtraValue} />
            <ClausePicker title="Terms & Conditions" clauses={master.clauses.filter((c) => c.kind === "TERMS")} checked={checked} onToggle={toggleClause} extra={extraTerms} onExtra={setExtraTerms} />
          </Step>

          {!!error && <Note tone="danger">{error}</Note>}
        </>
      )}

      {previewUrl && (
        <PreviewOverlay
          url={previewUrl}
          fileName={`Quotation-${(customer.name.trim() || "Customer").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "")}.pdf`}
          onClose={() => {
            URL.revokeObjectURL(previewUrl);
            setPreviewUrl("");
          }}
        />
      )}
      {confirming && (
        <Alert
          icon={<FiSend />}
          title="Save and send this quotation?"
          onClose={() => setConfirming(false)}
          actions={(close) => (
            <>
              <Button variant="ghost" onClick={close} disabled={busy === "send"}>Back</Button>
              <Button icon={<FiSend />} busy={busy === "send"} onClick={() => send(close)}>Save &amp; Send</Button>
            </>
          )}
        >
          It gets a quotation number, the PDF is saved on the lead, and the lead moves to <b>Quotation Sent</b>. You can then open the PDF from the Quotations tab and share it with the customer.
        </Alert>
      )}
    </Modal>
  );
}

// The quotation master (crm_quote_*): what a commercial quotation is built from.
//   Services     - each with its standard treatment rows (Defense Area / Material Used /
//                  Location-Treatment Area / Frequency), copied into a quotation and edited there.
//   Price Chart  - a price per service and plan; an empty cell = plan not offered for that service.
//   Plans        - one-time, monthly (services per month) or AMC (yearly, services per year).
//                  A plan's name (Daily, Weekly Once, ...) is also a treatment row's Frequency.
//   Clauses      - value-added services and terms & conditions; "default" ones start ticked.
// Kept by the sales manager (and admin). Nothing is deleted - it is switched off instead,
// because quotations already sent keep their own copy.

import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { FiArrowDown, FiArrowUp, FiCheck, FiEdit2, FiFileText, FiLayers, FiList, FiPlus, FiSave, FiTrash2 } from "react-icons/fi";
import { LEADS_HOME } from "./access";
import { money } from "./format";
import {
  addQuoteClause, addQuotePlan, addQuoteService, getQuoteMaster, saveQuotePrices, saveQuoteTreatments,
  updateQuoteClause, updateQuotePlan, updateQuoteService,
} from "./leadsApi";
import { useToast } from "./hooks";
import { frequencyNames, frequencyOptions } from "./quoteOptions";
import { Alert, Badge, Button, Card, Empty, Field, Modal, Note, SkeletonRows, Tabs } from "./ui";
import { useViewer } from "./viewer";

const BILLING_LABEL = { ONE_TIME: "One-time", MONTHLY: "Monthly", YEARLY: "AMC (Yearly)" };
const PER_LABEL = { ONE_TIME: "one-time", MONTHLY: "per month", YEARLY: "per year" };
const CLAUSE_KINDS = [
  { kind: "VALUE_ADDED", title: "Value Added Services", sub: "Shown under \"Value Added Services\" on the quotation." },
  { kind: "TERMS", title: "Terms & Conditions", sub: "Shown under \"Terms and Conditions\" on the quotation." },
];
const BLANK_ROW = { defense_area: "", material_used: "", treatment_area: "", frequency: "" };

// visits_per_month is the services in one billing period: a month, or a year for AMC.
const planLabel = (p) =>
  p.billing === "ONE_TIME" ? "One-time" : p.visits_per_month ? `${p.visits_per_month} service${p.visits_per_month > 1 ? "s" : ""} / ${p.billing === "YEARLY" ? "year" : "month"}` : BILLING_LABEL[p.billing];

function ActiveBadge({ active }) {
  return <Badge tone={active ? "success" : "neutral"}>{active ? "Active" : "Inactive"}</Badge>;
}

/* ------------------------------------------------------------ services */

/** Add or edit a service and its treatment rows. `service` null = a new one. */
function ServiceForm({ service, frequencies, onClose, onSaved }) {
  const toast = useToast();
  const [name, setName] = useState(service?.name || "");
  const [description, setDescription] = useState(service?.description || "");
  const [rows, setRows] = useState(() => (service?.treatments?.length ? service.treatments.map((t) => ({ ...t })) : [{ ...BLANK_ROW }]));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const setCell = (i, key, value) => setRows((list) => list.map((r, j) => (j === i ? { ...r, [key]: value } : r)));
  const move = (i, by) =>
    setRows((list) => {
      const next = [...list];
      [next[i], next[i + by]] = [next[i + by], next[i]];
      return next;
    });

  async function save(close) {
    if (busy) return;
    if (name.trim().length < 2) return setError("Enter the service name.");
    // A fully empty row is just dropped; a half-filled one has to be finished.
    const columns = Object.keys(BLANK_ROW);
    const kept = rows.filter((r) => columns.some((k) => r[k]?.trim()));
    const incomplete = rows.findIndex((r) => columns.some((k) => r[k]?.trim()) && columns.some((k) => !r[k]?.trim()));
    if (incomplete >= 0) return setError(`Treatment row ${incomplete + 1} is not complete - fill every column or clear the row.`);
    if (!kept.length) return setError("Add at least one treatment row.");

    setBusy(true);
    setError("");
    try {
      const body = { name: name.trim(), description: description.trim() || null };
      const saved = service ? await updateQuoteService(service.id, body) : await addQuoteService(body);
      await saveQuoteTreatments(saved.id, kept.map((r) => ({
        defense_area: r.defense_area.trim(), material_used: r.material_used.trim(), treatment_area: r.treatment_area.trim(), frequency: r.frequency.trim(),
      })));
      toast(service ? `"${body.name}" saved` : `"${body.name}" added`);
      onSaved();
      close();
    } catch (err) {
      setError(err.message || "Could not save the service.");
      setBusy(false);
    }
  }

  return (
    <Modal
      wide
      title={service ? `Edit ${service.name}` : "Add a Service"}
      sub="The treatment rows are filled in automatically when this service is picked on a quotation. They can still be changed on each quotation."
      onClose={onClose}
      footer={(close) => (
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button busy={busy} icon={<FiSave />} onClick={() => save(close)}>{service ? "Save Service" : "Add Service"}</Button>
        </div>
      )}
    >
      <div className="lm-form">
        <Field label="Service name" required>
          <input className="lm-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. Termite Control" autoFocus />
        </Field>
        <Field label="Short description" hint="Optional. For your team - not printed on the quotation.">
          <input className="lm-input" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} placeholder="e.g. Pre and post construction anti-termite treatment" />
        </Field>
      </div>

      <h3 style={{ margin: "24px 0 4px", fontSize: 15 }}>Treatment rows</h3>
      <p className="lm-hint" style={{ margin: "0 0 12px" }}>One row per line of the quotation&apos;s scope table, in the order shown here.</p>
      <div className="lm-table-wrap">
        <table className="lm-table">
          <thead>
            <tr>
              <th style={{ width: 36 }}>#</th>
              <th>Defense Area</th>
              <th>Material Used</th>
              <th>Location / Treatment Area</th>
              <th style={{ width: 150 }}>Frequency</th>
              <th aria-label="Row actions" style={{ width: 120 }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ cursor: "default", animation: "none" }}>
                <td className="muted">{i + 1}</td>
                <td><input className="lm-input" value={r.defense_area} maxLength={120} onChange={(e) => setCell(i, "defense_area", e.target.value)} placeholder="First Line of Defense" aria-label={`Row ${i + 1} defense area`} /></td>
                <td><input className="lm-input" value={r.material_used} maxLength={160} onChange={(e) => setCell(i, "material_used", e.target.value)} placeholder="Residual Spray" aria-label={`Row ${i + 1} material used`} /></td>
                <td><input className="lm-input" value={r.treatment_area} maxLength={255} onChange={(e) => setCell(i, "treatment_area", e.target.value)} placeholder="Entire internal premises" aria-label={`Row ${i + 1} treatment area`} /></td>
                <td>
                  <select className="lm-select" style={{ width: "100%", height: 44 }} value={r.frequency} onChange={(e) => setCell(i, "frequency", e.target.value)} aria-label={`Row ${i + 1} frequency`}>
                    <option value="">Select</option>
                    {frequencyOptions(frequencies, r.frequency).map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <span style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                    <Button size="sm" variant="ghost" icon={<FiArrowUp />} disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up" />
                    <Button size="sm" variant="ghost" icon={<FiArrowDown />} disabled={i === rows.length - 1} onClick={() => move(i, 1)} aria-label="Move down" />
                    <Button size="sm" variant="ghost" icon={<FiTrash2 />} disabled={rows.length === 1} onClick={() => setRows((list) => list.filter((_, j) => j !== i))} aria-label="Remove row" />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 12 }}>
        <Button size="sm" variant="ghost" icon={<FiPlus />} onClick={() => setRows((list) => [...list, { ...BLANK_ROW }])}>Add Row</Button>
      </div>
      {!!error && <div style={{ marginTop: 16 }}><Note tone="danger">{error}</Note></div>}
    </Modal>
  );
}

function ServicesTab({ master, reload }) {
  const toast = useToast();
  const [editing, setEditing] = useState(undefined); // undefined = closed, null = new, object = that service
  const [busyId, setBusyId] = useState(null);
  const services = master.services;

  async function patch(service, body, done) {
    setBusyId(service.id);
    try {
      await updateQuoteService(service.id, body);
      toast(done);
      reload();
    } catch (err) {
      toast(err.message || "Could not update the service.", true);
    } finally {
      setBusyId(null);
    }
  }

  // Swap places with the neighbour by exchanging sort orders.
  async function move(i, by) {
    const a = services[i];
    const b = services[i + by];
    setBusyId(a.id);
    try {
      const aOrder = a.sort_order === b.sort_order ? b.sort_order + by : b.sort_order;
      await updateQuoteService(a.id, { sort_order: Math.max(0, aOrder) });
      await updateQuoteService(b.id, { sort_order: a.sort_order });
      reload();
    } catch (err) {
      toast(err.message || "Could not reorder.", true);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <Card
        title="Services"
        sub={`${services.filter((s) => s.is_active).length} active of ${services.length}`}
        action={<Button icon={<FiPlus />} onClick={() => setEditing(null)}>Add Service</Button>}
        index={1}
        flush
        className="lm-detail"
      >
        <div style={{ height: 14 }} />
        {services.length === 0 ? (
          <Empty title="No services yet" text="Add the first one." icon={<FiLayers />} />
        ) : (
          <div className="lm-table-wrap">
            <table className="lm-table">
              <thead>
                <tr>
                  <th style={{ width: 70 }}>Order</th>
                  <th>Service</th>
                  <th>Standard treatment</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {services.map((s, i) => (
                  <tr key={s.id} style={{ "--i": i, cursor: "default", opacity: s.is_active ? 1 : 0.6 }}>
                    <td>
                      <span style={{ display: "flex", gap: 2 }}>
                        <Button size="sm" variant="ghost" icon={<FiArrowUp />} disabled={i === 0 || !!busyId} onClick={() => move(i, -1)} aria-label={`Move ${s.name} up`} />
                        <Button size="sm" variant="ghost" icon={<FiArrowDown />} disabled={i === services.length - 1 || !!busyId} onClick={() => move(i, 1)} aria-label={`Move ${s.name} down`} />
                      </span>
                    </td>
                    <td>
                      <strong>{s.name}</strong>
                      {!!s.description && <div className="lm-hint">{s.description}</div>}
                    </td>
                    <td className="muted" style={{ maxWidth: 380 }}>
                      {s.treatments.length === 0
                        ? "No rows"
                        : `${s.treatments.length} row${s.treatments.length > 1 ? "s" : ""}: ${[...new Set(s.treatments.map((t) => t.material_used))].join(", ")}`}
                    </td>
                    <td><ActiveBadge active={s.is_active} /></td>
                    <td>
                      <span style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <Button size="sm" variant="ghost" icon={<FiEdit2 />} onClick={() => setEditing(s)}>Edit</Button>
                        <Button
                          size="sm"
                          variant={s.is_active ? "danger" : "ghost"}
                          busy={busyId === s.id}
                          onClick={() => patch(s, { is_active: !s.is_active }, s.is_active ? `"${s.name}" switched off` : `"${s.name}" switched on`)}
                        >
                          {s.is_active ? "Deactivate" : "Activate"}
                        </Button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {editing !== undefined && <ServiceForm service={editing} frequencies={frequencyNames(master)} onClose={() => setEditing(undefined)} onSaved={reload} />}
    </>
  );
}

/* ------------------------------------------------------------ price chart */

const cellKey = (serviceId, planId) => `${serviceId}:${planId}`;

function PriceChart({ master, reload }) {
  const toast = useToast();
  const plans = master.plans.filter((p) => p.is_active);
  const services = master.services;
  const saved = useMemo(() => {
    const map = {};
    for (const s of services) for (const p of s.prices) map[cellKey(s.id, p.plan_id)] = String(p.price);
    return map;
  }, [services]);
  const [cells, setCells] = useState(saved);
  const [busy, setBusy] = useState(false);
  useEffect(() => setCells(saved), [saved]);

  const changed = Object.keys({ ...saved, ...cells }).filter((k) => (saved[k] ?? "") !== (cells[k] ?? "").trim());
  const invalid = changed.some((k) => {
    const v = (cells[k] ?? "").trim();
    return v !== "" && !(Number(v) >= 0);
  });

  async function save() {
    if (busy || !changed.length) return;
    if (invalid) return toast("Prices must be numbers (or empty).", true);
    setBusy(true);
    try {
      await saveQuotePrices(changed.map((k) => {
        const [service_id, plan_id] = k.split(":");
        const v = (cells[k] ?? "").trim();
        return { service_id, plan_id, price: v === "" ? null : Number(v) };
      }));
      toast(`${changed.length} price${changed.length > 1 ? "s" : ""} saved`);
      reload();
    } catch (err) {
      toast(err.message || "Could not save the prices.", true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card
        title="Price Chart"
        sub="Rs. per service. One-time = a single charge; Monthly = per month; AMC = per year."
        action={
          <span style={{ display: "flex", gap: 8 }}>
            {!!changed.length && <Button variant="ghost" onClick={() => setCells(saved)}>Discard</Button>}
            <Button icon={<FiSave />} busy={busy} disabled={!changed.length} onClick={save}>
              {changed.length ? `Save ${changed.length} change${changed.length > 1 ? "s" : ""}` : "Saved"}
            </Button>
          </span>
        }
        index={1}
        flush
        className="lm-detail"
      >
        <div style={{ height: 14 }} />
        {!plans.length || !services.length ? (
          <Empty title="Nothing to price yet" text="Add at least one active service and one active plan first." icon={<FiList />} />
        ) : (
          <div className="lm-table-wrap">
            <table className="lm-table">
              <thead>
                <tr>
                  <th>Service</th>
                  {plans.map((p) => (
                    <th key={p.id} style={{ minWidth: 140 }}>
                      {p.name}
                      <div style={{ fontWeight: 500, textTransform: "none", letterSpacing: 0 }}>{PER_LABEL[p.billing] || ""}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {services.map((s, i) => (
                  <tr key={s.id} style={{ "--i": i, cursor: "default", opacity: s.is_active ? 1 : 0.6 }}>
                    <td>
                      <strong>{s.name}</strong>
                      {!s.is_active && <div className="lm-hint">Inactive</div>}
                    </td>
                    {plans.map((p) => {
                      const k = cellKey(s.id, p.id);
                      const v = cells[k] ?? "";
                      const dirty = (saved[k] ?? "") !== v.trim();
                      return (
                        <td key={p.id}>
                          <input
                            className={`lm-input${v.trim() !== "" && !(Number(v) >= 0) ? " bad" : ""}`}
                            style={{ height: 38, textAlign: "right", background: dirty ? "#fffbea" : undefined }}
                            inputMode="decimal"
                            value={v}
                            placeholder="Not offered"
                            onChange={(e) => setCells((c) => ({ ...c, [k]: e.target.value }))}
                            aria-label={`${s.name} - ${p.name} price`}
                          />
                          {!dirty && v !== "" && <div className="lm-hint" style={{ textAlign: "right" }}>{money(v)}</div>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Note tone="info">
        These are the starting prices on a new quotation. The salesperson can still change the amount on each quotation. Leave a cell empty if that plan is not offered for the service.
      </Note>
    </>
  );
}

/* ------------------------------------------------------------ plans */

function PlanForm({ plan, onClose, onSaved }) {
  const toast = useToast();
  const [name, setName] = useState(plan?.name || "");
  const [billing, setBilling] = useState(plan?.billing || "MONTHLY");
  const [visits, setVisits] = useState(plan?.visits_per_month ? String(plan.visits_per_month) : "");
  const [busy, setBusy] = useState(false);

  async function save(close) {
    if (busy) return;
    if (name.trim().length < 2) return toast("Enter the plan name.", true);
    const n = Number(visits);
    const max = billing === "YEARLY" ? 365 : 31;
    if (billing !== "ONE_TIME" && visits !== "" && !(Number.isInteger(n) && n >= 1 && n <= max)) return toast(`Services per ${billing === "YEARLY" ? "year" : "month"} must be 1 to ${max}.`, true);
    setBusy(true);
    try {
      // A new plan goes to the end of the list; the order is set with the arrows on the Plans tab.
      const body = { name: name.trim(), billing, visits_per_month: billing !== "ONE_TIME" && visits !== "" ? n : null };
      if (plan) await updateQuotePlan(plan.id, body);
      else await addQuotePlan(body);
      toast(plan ? `"${body.name}" saved` : `"${body.name}" added`);
      onSaved();
      close();
    } catch (err) {
      toast(err.message || "Could not save the plan.", true);
      setBusy(false);
    }
  }

  return (
    <Alert
      icon={<FiList />}
      title={plan ? "Edit Plan" : "Add a Plan"}
      onClose={onClose}
      actions={(close) => (
        <>
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button busy={busy} icon={<FiCheck />} onClick={() => save(close)}>{plan ? "Save" : "Add Plan"}</Button>
        </>
      )}
    >
      <div style={{ display: "grid", gap: 12, textAlign: "left" }}>
        <Field label="Plan name" required>
          <input className="lm-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="e.g. Monthly - Weekly, AMC - 6 Services / Year" autoFocus />
        </Field>
        <Field label="Billing">
          <select className="lm-select" value={billing} onChange={(e) => setBilling(e.target.value)}>
            <option value="MONTHLY">Monthly (charged per month)</option>
            <option value="YEARLY">AMC (charged per year)</option>
            <option value="ONE_TIME">One-time</option>
          </select>
        </Field>
        {billing !== "ONE_TIME" && (
          <Field label={billing === "YEARLY" ? "Services per year" : "Services per month"} hint="Optional.">
            <input className="lm-input" inputMode="numeric" value={visits} onChange={(e) => setVisits(e.target.value.replace(/\D/g, ""))} placeholder={billing === "YEARLY" ? "e.g. 4" : "e.g. 2"} />
          </Field>
        )}
      </div>
    </Alert>
  );
}

function PlansTab({ master, reload }) {
  const toast = useToast();
  const [editing, setEditing] = useState(undefined);
  const [busyId, setBusyId] = useState(null);

  async function toggle(plan) {
    setBusyId(plan.id);
    try {
      await updateQuotePlan(plan.id, { is_active: !plan.is_active });
      toast(plan.is_active ? `"${plan.name}" switched off` : `"${plan.name}" switched on`);
      reload();
    } catch (err) {
      toast(err.message || "Could not update the plan.", true);
    } finally {
      setBusyId(null);
    }
  }

  // Move a plan up or down: the list is renumbered 10, 20, 30... in its new order, which also
  // sorts out plans that shared a sort order. Only the plans whose number changes are saved.
  async function move(i, by) {
    const list = [...master.plans];
    [list[i], list[i + by]] = [list[i + by], list[i]];
    setBusyId(master.plans[i].id);
    try {
      for (const [k, p] of list.entries()) {
        const next = (k + 1) * 10;
        if (p.sort_order !== next) await updateQuotePlan(p.id, { sort_order: next });
      }
      reload();
    } catch (err) {
      toast(err.message || "Could not reorder.", true);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <Card
        title="Plans"
        sub="How often the service is done and how it is charged. Each plan is a column in the price chart, and its name is a choice in the Frequency of treatment rows."
        action={<Button icon={<FiPlus />} onClick={() => setEditing(null)}>Add Plan</Button>}
        index={1}
        flush
        className="lm-detail"
      >
        <div style={{ height: 14 }} />
        {master.plans.length === 0 ? (
          <Empty title="No plans yet" text="Add the first one." icon={<FiList />} />
        ) : (
          <div className="lm-table-wrap">
            <table className="lm-table">
              <thead>
                <tr>
                  <th style={{ width: 120 }}>Order</th>
                  <th>Plan</th>
                  <th>Billing</th>
                  <th>Frequency</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {master.plans.map((p, i) => (
                  <tr key={p.id} style={{ "--i": i, cursor: "default", opacity: p.is_active ? 1 : 0.6 }}>
                    <td>
                      <span style={{ display: "flex", gap: 2, alignItems: "center" }}>
                        <Button size="sm" variant="ghost" icon={<FiArrowUp />} disabled={i === 0 || !!busyId} onClick={() => move(i, -1)} aria-label={`Move ${p.name} up`} />
                        <Button size="sm" variant="ghost" icon={<FiArrowDown />} disabled={i === master.plans.length - 1 || !!busyId} onClick={() => move(i, 1)} aria-label={`Move ${p.name} down`} />
                      </span>
                    </td>
                    <td><strong>{p.name}</strong></td>
                    <td>{BILLING_LABEL[p.billing] || p.billing}</td>
                    <td className="muted">{planLabel(p)}</td>
                    <td><ActiveBadge active={p.is_active} /></td>
                    <td>
                      <span style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <Button size="sm" variant="ghost" icon={<FiEdit2 />} onClick={() => setEditing(p)}>Edit</Button>
                        <Button size="sm" variant={p.is_active ? "danger" : "ghost"} busy={busyId === p.id} onClick={() => toggle(p)}>
                          {p.is_active ? "Deactivate" : "Activate"}
                        </Button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {editing !== undefined && <PlanForm plan={editing} onClose={() => setEditing(undefined)} onSaved={reload} />}
    </>
  );
}

/* ------------------------------------------------------------ clauses */

function ClauseForm({ clause, kind, onClose, onSaved }) {
  const toast = useToast();
  const [text, setText] = useState(clause?.text || "");
  const [isDefault, setIsDefault] = useState(clause ? clause.is_default : false);
  const [busy, setBusy] = useState(false);
  const label = CLAUSE_KINDS.find((k) => k.kind === kind)?.title;

  async function save(close) {
    if (busy) return;
    if (text.trim().length < 3) return toast("Enter the clause text.", true);
    setBusy(true);
    try {
      if (clause) await updateQuoteClause(clause.id, { text: text.trim(), is_default: isDefault });
      else await addQuoteClause({ kind, text: text.trim(), is_default: isDefault });
      toast(clause ? "Clause saved" : "Clause added");
      onSaved();
      close();
    } catch (err) {
      toast(err.message || "Could not save the clause.", true);
      setBusy(false);
    }
  }

  return (
    <Alert
      icon={<FiFileText />}
      title={clause ? `Edit - ${label}` : `Add to ${label}`}
      onClose={onClose}
      actions={(close) => (
        <>
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button busy={busy} icon={<FiCheck />} onClick={() => save(close)}>{clause ? "Save" : "Add"}</Button>
        </>
      )}
    >
      <div style={{ display: "grid", gap: 12, textAlign: "left" }}>
        <textarea className="lm-textarea" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder="e.g. All taxes extra as applicable." autoFocus aria-label="Clause text" />
        <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
          <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
          <span>Always include on every quotation (salespeople cannot remove it)</span>
        </label>
      </div>
    </Alert>
  );
}

function ClausesTab({ master, reload }) {
  const toast = useToast();
  const [editing, setEditing] = useState(null); // { kind, clause|null }
  const [busyId, setBusyId] = useState(null);

  async function patch(clause, body, done) {
    setBusyId(clause.id);
    try {
      await updateQuoteClause(clause.id, body);
      toast(done);
      reload();
    } catch (err) {
      toast(err.message || "Could not update the clause.", true);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      {CLAUSE_KINDS.map((group, gi) => {
        const list = master.clauses.filter((c) => c.kind === group.kind);
        return (
          <Card
            key={group.kind}
            title={group.title}
            sub={group.sub}
            action={<Button icon={<FiPlus />} onClick={() => setEditing({ kind: group.kind, clause: null })}>Add</Button>}
            index={gi + 1}
            flush
            className="lm-detail"
          >
            <div style={{ height: 14 }} />
            {list.length === 0 ? (
              <Empty title="Nothing here yet" text="Add the first line." icon={<FiFileText />} />
            ) : (
              <div className="lm-table-wrap">
                <table className="lm-table">
                  <thead>
                    <tr>
                      <th>Text</th>
                      <th>On new quotations</th>
                      <th>Status</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((c, i) => (
                      <tr key={c.id} style={{ "--i": i, cursor: "default", opacity: c.is_active ? 1 : 0.6 }}>
                        <td style={{ maxWidth: 520 }}>{c.text}</td>
                        <td>
                          <Badge tone={c.is_default ? "info" : "neutral"}>{c.is_default ? "Always included" : "Optional"}</Badge>
                        </td>
                        <td><ActiveBadge active={c.is_active} /></td>
                        <td>
                          <span style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                            <Button size="sm" variant="ghost" icon={<FiEdit2 />} onClick={() => setEditing({ kind: group.kind, clause: c })}>Edit</Button>
                            <Button
                              size="sm"
                              variant={c.is_active ? "danger" : "ghost"}
                              busy={busyId === c.id}
                              onClick={() => patch(c, { is_active: !c.is_active }, c.is_active ? "Clause switched off" : "Clause switched on")}
                            >
                              {c.is_active ? "Deactivate" : "Activate"}
                            </Button>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        );
      })}
      <Note tone="info">
        &quot;Always included&quot; lines go on every quotation and cannot be removed by the salesperson; &quot;Optional&quot; ones can be ticked when they apply. Lines written for one customer only are added on that quotation, not here.
      </Note>
      {editing && <ClauseForm clause={editing.clause} kind={editing.kind} onClose={() => setEditing(null)} onSaved={reload} />}
    </>
  );
}

/* ------------------------------------------------------------ page */

export default function QuoteMaster() {
  const { persona } = useViewer();
  const [master, setMaster] = useState(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0); // bumped after every change, to read the master again
  const [tab, setTab] = useState("services");

  useEffect(() => {
    let alive = true;
    getQuoteMaster()
      .then((data) => alive && (setMaster(data), setError("")))
      .catch((err) => alive && setError(err.message || "Could not load the quotation master."));
    return () => {
      alive = false;
    };
  }, [version]);

  if (persona !== "sales_manager") return <Navigate to={LEADS_HOME} replace />;

  const reload = () => setVersion((v) => v + 1);
  const tabs = [
    { key: "services", label: "Services", count: master?.services.length },
    { key: "prices", label: "Price Chart" },
    { key: "plans", label: "Plans", count: master?.plans.length },
    { key: "clauses", label: "Clauses", count: master?.clauses.length },
  ];

  return (
    <>
      <div className="lm-head">
        <div>
          <h1>Quotation Master</h1>
          <p>The services, prices and standard wording every commercial quotation is built from.</p>
        </div>
      </div>

      <Card index={0} flush>
        <Tabs tabs={tabs} value={tab} onChange={setTab} />
      </Card>

      {error ? (
        <Card index={1}>
          <Empty title="Could not load the quotation master" text={error} icon={<FiLayers />} action={<Button onClick={reload}>Try again</Button>} />
        </Card>
      ) : !master ? (
        <Card index={1}>
          <SkeletonRows rows={6} />
        </Card>
      ) : tab === "services" ? (
        <ServicesTab master={master} reload={reload} />
      ) : tab === "prices" ? (
        <PriceChart master={master} reload={reload} />
      ) : tab === "plans" ? (
        <PlansTab master={master} reload={reload} />
      ) : (
        <ClausesTab master={master} reload={reload} />
      )}
    </>
  );
}

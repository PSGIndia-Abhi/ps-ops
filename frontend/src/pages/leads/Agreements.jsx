// Service agreements for a converted lead (customer), sales managers only: the lead's Agreements
// tab - the FINAL agreement (the one uploaded signed copy, replaceable) and every agreement made
// (only the newest is active; older ones are Cancelled) - and the form to make one (pre-filled from
// the customer and the latest quotation, or from an agreement to edit / duplicate). The PDF is
// BestServe's standard agreement with Annexure-1.

import { useEffect, useMemo, useRef, useState } from "react";
import { FiCheckCircle, FiCopy, FiEdit2, FiEye, FiFileText, FiPlus, FiSave, FiTrash2, FiUpload } from "react-icons/fi";
import { money } from "./format";
import { useToast } from "./hooks";
import {
  MANAGER_ROLES,
  createAgreement,
  fetchAgreementPdf,
  getAgreementContent,
  getAgreementPrefill,
  listAgreements,
  previewAgreement,
  uploadFinalAgreement,
  useLeadData,
} from "./leadsApi";
import { PreviewOverlay } from "./QuotationBuilder";
import { Badge, Button, Empty, Field, Modal, Note, SkeletonRows } from "./ui";

const fmtDate = (iso) => (iso ? new Date(`${String(iso).slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "-");
const ROW_KEYS = ["defense_area", "material_used", "treatment_area", "frequency"];
const BLANK_ROW = { defense_area: "", material_used: "", treatment_area: "", frequency: "" };
// The word used for the customer in the agreement text ("...the Apartment has agreed...").
const INDUSTRY_WORDS = ["Apartment", "Hospital", "Restaurant", "QSR", "IT", "Builder", "Company", "Society", "Association"];
// "sales_manager" -> "Sales Manager": a person's role as a starting designation (still editable).
const roleTitle = (role) => {
  const t = String(role || "").replace(/_/g, " ").trim();
  return t === t.toLowerCase() ? t.replace(/\b\w/g, (ch) => ch.toUpperCase()) : t;
};

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

// ---------------------------------------------------------------------------
// The tab
// ---------------------------------------------------------------------------

export function AgreementsTab({ lead, refreshKey }) {
  const toast = useToast();
  const [data, setData] = useState(null); // { canManage, agreements, final }
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [building, setBuilding] = useState(null); // { from?, mode: "new" | "edit" | "duplicate" }
  const [opening, setOpening] = useState(null); // `${id}:pdf|signed`
  const [viewing, setViewing] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef(null);

  useEffect(() => {
    let alive = true;
    listAgreements(lead.id)
      .then((d) => alive && (setData(d), setError("")))
      .catch((err) => alive && setError(err.message || "Could not load agreements."));
    return () => {
      alive = false;
    };
  }, [lead.id, refreshKey, reload]);

  async function open(id, signed, fileName) {
    setOpening(`${id}:${signed ? "signed" : "pdf"}`);
    try {
      const url = await fetchAgreementPdf(lead.id, id, signed);
      setViewing({ url, fileName });
    } catch (err) {
      toast(err.message || "Could not open the agreement.", true);
    } finally {
      setOpening(null);
    }
  }

  function pickFinal() {
    fileInput.current.value = "";
    fileInput.current.click();
  }
  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") return toast("Choose the signed agreement as a PDF file.", true);
    if (file.size > 15 * 1024 * 1024) return toast("The file is too large (max 15 MB).", true);
    setUploading(true);
    try {
      await uploadFinalAgreement(lead.id, file);
      toast(data?.final ? "Final agreement replaced." : "Final agreement uploaded.");
      setReload((n) => n + 1);
    } catch (err) {
      toast(err.message || "Could not upload the signed agreement.", true);
    } finally {
      setUploading(false);
    }
  }

  const canManage = !!data?.canManage;
  const active = data?.agreements.find((a) => a.status !== "CANCELLED") || null;
  const final = data?.final || null;
  const add = canManage && (
    <Button icon={<FiFileText />} onClick={() => setBuilding({ mode: "new" })}>
      Create Agreement
    </Button>
  );

  let body;
  if (error) body = <Empty title="Could not load agreements" text={error} icon={<FiFileText />} />;
  else if (!data) body = <Empty title="Loading agreements..." icon={<FiFileText />} />;
  else if (data.agreements.length === 0) {
    body = <Empty title="No agreements yet" text="Make the service agreement from the customer's details and quotation." icon={<FiFileText />} action={add} />;
  } else {
    body = (
      <>
        {/* The final agreement: the one uploaded signed copy */}
        <div className="lm-hint" style={{ fontWeight: 700, letterSpacing: ".06em", fontSize: 11.5, marginBottom: 8 }}>FINAL AGREEMENT</div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            flexWrap: "wrap",
            padding: "14px 16px",
            marginBottom: 24,
            borderRadius: 14,
            border: `1.5px solid ${final ? "var(--lm-success)" : "var(--lm-border)"}`,
            background: final ? "var(--lm-success-soft)" : "var(--lm-bg)",
          }}
        >
          <span
            style={{
              display: "grid",
              placeItems: "center",
              width: 42,
              height: 42,
              borderRadius: 12,
              flex: "none",
              color: "#fff",
              background: final ? "linear-gradient(135deg, #22c55e, #15803d)" : "var(--lm-soft)",
            }}
          >
            <FiCheckCircle size={20} />
          </span>
          <div style={{ flex: 1, minWidth: 220 }}>
            {final ? (
              <>
                <strong style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  {final.fileName} <Badge tone="success">Latest</Badge>
                </strong>
                <div className="muted" style={{ fontSize: 12.5 }}>
                  Signed copy of {final.number} · uploaded {fmtDate(final.uploadedAt)}
                  {final.uploadedBy ? ` by ${final.uploadedBy}` : ""}
                </div>
              </>
            ) : (
              <>
                <strong>No signed agreement yet</strong>
                <div className="muted" style={{ fontSize: 12.5 }}>Upload the signed copy once the customer signs - it becomes the final agreement.</div>
              </>
            )}
          </div>
          <span style={{ display: "inline-flex", gap: 8 }}>
            {final && (
              <Button size="sm" variant="ghost" icon={<FiFileText />} busy={opening === `${final.agreementId}:signed`} onClick={() => open(final.agreementId, true, final.fileName)}>
                View
              </Button>
            )}
            {canManage && (
              <Button size="sm" variant={final ? "ghost" : "primary"} icon={<FiUpload />} busy={uploading} disabled={!active} onClick={pickFinal}>
                {final ? "Replace" : "Upload Signed Copy"}
              </Button>
            )}
          </span>
        </div>

        {/* Every agreement made - only the newest is active */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
          <span className="lm-hint" style={{ fontWeight: 700, letterSpacing: ".06em", fontSize: 11.5 }}>
            AGREEMENTS · {data.agreements.length}
          </span>
          {add}
        </div>
        <div className="lm-table-wrap" style={{ margin: "0 -20px -20px" }}>
          <table className="lm-table">
            <thead>
              <tr>
                <th>Agreement</th>
                <th>Term</th>
                <th>Charges</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {data.agreements.map((a, i) => {
                const cancelled = a.status === "CANCELLED";
                return (
                  <tr key={a.id} style={{ "--i": i, cursor: "default", opacity: cancelled ? 0.6 : 1 }}>
                    <td>
                      <strong style={cancelled ? { textDecoration: "line-through" } : undefined}>{a.fileName}</strong>
                      <div className="muted" style={{ fontSize: 12.5 }}>
                        {a.number}
                        {a.createdBy ? ` · by ${a.createdBy}` : ""}
                      </div>
                    </td>
                    <td className="muted">
                      {fmtDate(a.termStart)} – {fmtDate(a.termEnd)}
                    </td>
                    <td className="num">{money(a.monthly)} / month</td>
                    <td>{cancelled ? <Badge tone="neutral">Cancelled</Badge> : <Badge tone="info">Active</Badge>}</td>
                    <td style={{ textAlign: "right" }}>
                      <span style={{ display: "inline-flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                        <Button size="sm" variant="ghost" icon={<FiFileText />} busy={opening === `${a.id}:pdf`} onClick={() => open(a.id, false, a.fileName)}>
                          View PDF
                        </Button>
                        {canManage && !cancelled && !a.hasSigned && (
                          <Button size="sm" variant="ghost" icon={<FiEdit2 />} onClick={() => setBuilding({ from: a, mode: "edit" })}>
                            Edit
                          </Button>
                        )}
                        {canManage && (
                          <Button size="sm" variant="ghost" icon={<FiCopy />} onClick={() => setBuilding({ from: a, mode: "duplicate" })}>
                            Duplicate
                          </Button>
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>
    );
  }

  return (
    <>
      {body}
      <input ref={fileInput} type="file" accept="application/pdf" hidden onChange={onFile} />
      {building && (
        <AgreementBuilder
          lead={lead}
          from={building.from}
          mode={building.mode}
          replaces={active}
          onClose={() => setBuilding(null)}
          onSaved={() => {
            setBuilding(null);
            setReload((n) => n + 1);
          }}
        />
      )}
      {viewing && (
        <PreviewOverlay
          url={viewing.url}
          fileName={viewing.fileName}
          title={viewing.fileName}
          onClose={() => {
            URL.revokeObjectURL(viewing.url);
            setViewing(null);
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// The form
// ---------------------------------------------------------------------------

/**
 * `from` + `mode` "edit" | "duplicate": the form starts from that agreement's details instead of the
 * customer and quotation. Either way the new agreement becomes the active one and `replaces` (the
 * current active one) is marked Cancelled.
 */
function AgreementBuilder({ lead, from, mode = "new", replaces, onClose, onSaved }) {
  const toast = useToast();
  const { people } = useLeadData();
  const [loadError, setLoadError] = useState("");
  const [quotation, setQuotation] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(""); // "preview" | "save"
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    let alive = true;
    const load = from ? getAgreementContent(lead.id, from.id).then((content) => ({ content, quotation: null })) : getAgreementPrefill(lead.id);
    load
      .then((d) => {
        if (!alive) return;
        const c = d.content;
        setQuotation(d.quotation);
        setForm({
          ...c,
          monthlyCharge: c.monthlyCharge ? String(c.monthlyCharge) : "",
          months: String(c.months || 12),
          // The yearly amount follows monthly x months until someone types their own.
          total: c.total ? String(c.total) : "",
          totalEdited: !!c.total && Math.abs(c.total - (Number(c.monthlyCharge) || 0) * (Number(c.months) || 0)) > 0.005,
          customerSignatory: c.customerSignatory || { name: "", designation: "", date: c.signingDate || "" },
          services: c.services.length ? c.services : [{ name: "", rows: [{ ...BLANK_ROW }] }],
        });
      })
      .catch((err) => alive && setLoadError(err.message || "Could not load the customer's details."));
    return () => {
      alive = false;
    };
  }, [lead.id, from]);

  const heading = mode === "edit" ? "Edit Agreement" : mode === "duplicate" ? "Duplicate Agreement" : "Create Agreement";

  // Who may sign for BestServe: the lead managers (MD, PA, sales managers).
  const signatories = useMemo(() => (people || []).filter((p) => MANAGER_ROLES.includes(p.role)), [people]);

  if (loadError || !form) {
    return (
      <Modal wide title={heading} sub={lead.company} onClose={onClose}>
        {loadError ? <Empty title="Could not open the agreement form" text={loadError} icon={<FiFileText />} /> : <SkeletonRows rows={6} />}
      </Modal>
    );
  }

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setCustomer = (patch) => setForm((f) => ({ ...f, customer: { ...f.customer, ...patch } }));
  const setSignatory = (patch) => setForm((f) => ({ ...f, signatory: { ...f.signatory, ...patch } }));
  const setTheirSignatory = (patch) => setForm((f) => ({ ...f, customerSignatory: { ...f.customerSignatory, ...patch } }));
  const setService = (i, patch) => setForm((f) => ({ ...f, services: f.services.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  const setRow = (si, ri, key, value) => setService(si, { rows: form.services[si].rows.map((r, j) => (j === ri ? { ...r, [key]: value } : r)) });

  const monthly = Number(form.monthlyCharge) || 0;
  const months = Number(form.months) || 0;
  const autoTotal = Math.round(monthly * months * 100) / 100;
  const total = form.totalEdited ? Number(form.total) || 0 : autoTotal;
  // the dropdowns also offer the value already filled in, when it is not one of the choices
  const industryChoices = INDUSTRY_WORDS.includes(form.customer.industryWord) || !form.customer.industryWord ? INDUSTRY_WORDS : [form.customer.industryWord, ...INDUSTRY_WORDS];
  const signatoryChoices = signatories.some((p) => p.name === form.signatory.name) || !form.signatory.name
    ? signatories
    : [{ id: "current", name: form.signatory.name }, ...signatories];

  const body = () => {
    const { totalEdited: _edited, ...rest } = form;
    return { ...rest, monthlyCharge: monthly, months, total };
  };

  async function doPreview() {
    setBusy("preview");
    setError("");
    try {
      const url = await previewAgreement(lead.id, body());
      setPreview(url);
    } catch (err) {
      setError(err.message || "Could not make the preview.");
    } finally {
      setBusy("");
    }
  }

  async function save() {
    setBusy("save");
    setError("");
    try {
      const a = await createAgreement(lead.id, body());
      toast(`Agreement ${a.number} saved. Upload the signed copy once it is signed.`);
      onSaved();
    } catch (err) {
      setError(err.message || "Could not save the agreement.");
      setBusy("");
    }
  }

  const footer = (
    <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
      <div>
        {total > 0 ? (
          <strong style={{ fontSize: 16 }}>
            {money(monthly)} / month · {months} months · {money(total)}
          </strong>
        ) : (
          <span className="lm-hint">Enter the monthly charge and months</span>
        )}
      </div>
      <span style={{ display: "flex", gap: 10 }}>
        <Button variant="ghost" icon={<FiEye />} busy={busy === "preview"} disabled={!!busy} onClick={doPreview}>
          Preview PDF
        </Button>
        <Button icon={<FiSave />} busy={busy === "save"} disabled={!!busy} onClick={save}>
          Save Agreement
        </Button>
      </span>
    </div>
  );

  return (
    <Modal wide title={heading} sub={`${lead.company}${lead.number && lead.number !== "-" ? ` - ${lead.number}` : ""}`} onClose={onClose} footer={footer}>
      {!!error && (
        <div style={{ marginBottom: 18 }}>
          <Note tone="warn">{error}</Note>
        </div>
      )}
      <div style={{ marginBottom: 18 }}>
        <Note tone="info">
          {from ? (
            <>
              Filled in from <b>{from.number}</b>. Saving makes a new agreement with a new number
              {replaces ? (
                <>
                  {" "}
                  - <b>{replaces.number}</b> is then marked Cancelled
                </>
              ) : null}
              .
            </>
          ) : quotation ? (
            <>
              Filled in from the customer and quotation <b>{quotation.number}</b>. Check every field - it prints exactly as written here.
              {replaces ? (
                <>
                  {" "}
                  Saving marks <b>{replaces.number}</b> Cancelled.
                </>
              ) : null}
            </>
          ) : (
            <>No quotation with saved details was found, so add the services for Annexure-1 below.</>
          )}
        </Note>
      </div>

      <Step no="1" title="Parties" sub="The customer as named in the agreement, and who signs for BestServe.">
        <div className="lm-form">
          <Field label="Customer name (as in the agreement)" required>
            <input className="lm-input" value={form.customer.name} maxLength={150} onChange={(e) => setCustomer({ name: e.target.value })} />
          </Field>
          <Field label="Short name used in the text" required hint='e.g. PROMONT - "the PROMONT shall pay..."'>
            <input className="lm-input" value={form.customer.shortName} maxLength={40} onChange={(e) => setCustomer({ shortName: e.target.value })} />
          </Field>
          <Field label="Industry type (word used in the text)" required hint='e.g. "the Apartment has agreed to accept..."'>
            <select className="lm-select" value={form.customer.industryWord} onChange={(e) => setCustomer({ industryWord: e.target.value })}>
              <option value="">Select</option>
              {industryChoices.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Represented by" required hint="e.g. Committee Members, or the person's name and designation">
            <input className="lm-input" value={form.customer.representative} maxLength={120} onChange={(e) => setCustomer({ representative: e.target.value })} />
          </Field>
          <Field label="Customer address" required wide>
            <textarea className="lm-textarea" style={{ minHeight: 64 }} value={form.customer.address} maxLength={400} onChange={(e) => setCustomer({ address: e.target.value })} />
          </Field>
          <Field label="Signs for BestServe" required>
            <select
              className="lm-select"
              value={form.signatory.name}
              onChange={(e) => {
                const who = signatories.find((p) => p.name === e.target.value);
                setSignatory({ name: e.target.value, ...(who ? { designation: roleTitle(who.role) } : {}) });
              }}
            >
              <option value="">Select</option>
              {signatoryChoices.map((p) => (
                <option key={p.id} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Designation" required hint="e.g. Sales Director, Managing Director">
            <input className="lm-input" value={form.signatory.designation} maxLength={80} onChange={(e) => setSignatory({ designation: e.target.value })} />
          </Field>
          <Field label="Signs for the customer" hint="Printed on the customer's side - leave empty to fill by hand">
            <input className="lm-input" value={form.customerSignatory.name} maxLength={80} onChange={(e) => setTheirSignatory({ name: e.target.value })} />
          </Field>
          <Field label="Customer's designation">
            <input className="lm-input" value={form.customerSignatory.designation} maxLength={80} onChange={(e) => setTheirSignatory({ designation: e.target.value })} />
          </Field>
          <Field label="Customer's signing date">
            <input className="lm-input" type="date" value={form.customerSignatory.date} onChange={(e) => setTheirSignatory({ date: e.target.value })} />
          </Field>
        </div>
      </Step>

      <Step no="2" title="Term & charges">
        <div className="lm-form">
          <Field label="Term starts" required>
            <input className="lm-input" type="date" value={form.termStart} onChange={(e) => set({ termStart: e.target.value })} />
          </Field>
          <Field label="Term ends" required>
            <input className="lm-input" type="date" value={form.termEnd} min={form.termStart || undefined} onChange={(e) => set({ termEnd: e.target.value })} />
          </Field>
          <Field label="Monthly charge (Rs.)" required hint="Taxes are extra, as the agreement says">
            <input className="lm-input" inputMode="decimal" value={form.monthlyCharge} onChange={(e) => set({ monthlyCharge: e.target.value.replace(/[^\d.]/g, "") })} placeholder="e.g. 30000" />
          </Field>
          <Field label="Number of months" required>
            <input className="lm-input" inputMode="numeric" value={form.months} onChange={(e) => set({ months: e.target.value.replace(/\D/g, "").slice(0, 2) })} />
          </Field>
          <Field
            label="Yearly amount (Rs.)"
            required
            hint={
              form.totalEdited && total !== autoTotal ? (
                <>
                  Changed from {money(autoTotal)} -{" "}
                  <button type="button" className="lm-link" onClick={() => set({ totalEdited: false })}>
                    use monthly × months
                  </button>
                </>
              ) : (
                "Monthly charge × months - change it if the agreed amount is different"
              )
            }
          >
            <input
              className="lm-input"
              inputMode="decimal"
              value={form.totalEdited ? form.total : autoTotal ? String(autoTotal) : ""}
              onChange={(e) => set({ total: e.target.value.replace(/[^\d.]/g, ""), totalEdited: true })}
            />
          </Field>
          <Field label="Signing date" required hint="Printed beside BestServe's signature">
            <input className="lm-input" type="date" value={form.signingDate} onChange={(e) => set({ signingDate: e.target.value })} />
          </Field>
        </div>
      </Step>

      <Step no="3" title="Scope" sub="Clauses 3 and 4 of the agreement.">
        <div className="lm-form">
          <Field label="Pests covered (clause 3.1)" required wide hint="e.g. Mosquitoes, Rodent, Cockroaches, Flies, Ants">
            <input className="lm-input" value={form.pestsCovered} maxLength={300} onChange={(e) => set({ pestsCovered: e.target.value })} />
          </Field>
          <Field label="Service frequency (clause 3.2)" required wide hint="e.g. Weekly Once Rodent, Weekly Twice Mosquitoes, Ants, Cockroaches & Flies Management Services">
            <textarea className="lm-textarea" style={{ minHeight: 60 }} value={form.frequencySummary} maxLength={400} onChange={(e) => set({ frequencySummary: e.target.value })} />
          </Field>
          <Field label="Services in the charges clause (clause 4.1)" required wide hint="e.g. General Disinfestation Services and Rodent Control Service">
            <input className="lm-input" value={form.servicesPhrase} maxLength={200} onChange={(e) => set({ servicesPhrase: e.target.value })} />
          </Field>
        </div>
      </Step>

      <Step
        no="4"
        title="Annexure-1 - services"
        sub="The table at the end of the agreement. Rows with the same frequency next to each other print as one merged cell."
        action={
          <Button size="sm" variant="ghost" icon={<FiPlus />} onClick={() => set({ services: [...form.services, { name: "", rows: [{ ...BLANK_ROW }] }] })}>
            Add Service
          </Button>
        }
      >
        {form.services.map((s, si) => (
          <div key={si} style={{ border: "1px solid var(--lm-border)", borderRadius: 14, padding: 14, marginBottom: 14, background: "#fbfcfe" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end", marginBottom: 12 }}>
              <label className="lm-field" style={{ flex: 1 }}>
                <span className="lm-label">
                  {si + 1}. Service recommended <i>*</i>
                </span>
                <input className="lm-input" value={s.name} maxLength={80} onChange={(e) => setService(si, { name: e.target.value })} placeholder="e.g. Rat Control / Monitoring" />
              </label>
              <Button variant="ghost" icon={<FiTrash2 />} disabled={form.services.length === 1} onClick={() => set({ services: form.services.filter((_, j) => j !== si) })} aria-label={`Remove service ${si + 1}`} />
            </div>
            <div className="lm-table-wrap">
              <table className="lm-table">
                <thead>
                  <tr>
                    <th>Defense Area</th>
                    <th>Material Used</th>
                    <th>Location / Treatment Area</th>
                    <th style={{ width: 170 }}>Frequency</th>
                    <th aria-label="Remove" style={{ width: 50 }} />
                  </tr>
                </thead>
                <tbody>
                  {s.rows.map((r, ri) => (
                    <tr key={ri} style={{ cursor: "default", animation: "none" }}>
                      {ROW_KEYS.map((k) => (
                        <td key={k}>
                          <input
                            className="lm-input"
                            style={{ height: 38 }}
                            value={r[k]}
                            maxLength={k === "treatment_area" ? 255 : k === "material_used" ? 160 : k === "frequency" ? 80 : 120}
                            onChange={(e) => setRow(si, ri, k, e.target.value)}
                            aria-label={`Service ${si + 1} row ${ri + 1} ${k.replace("_", " ")}`}
                          />
                        </td>
                      ))}
                      <td>
                        <Button size="sm" variant="ghost" icon={<FiTrash2 />} disabled={s.rows.length === 1} onClick={() => setService(si, { rows: s.rows.filter((_, j) => j !== ri) })} aria-label="Remove row" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: 8 }}>
              <Button size="sm" variant="ghost" icon={<FiPlus />} onClick={() => setService(si, { rows: [...s.rows, { ...BLANK_ROW, frequency: s.rows[s.rows.length - 1]?.frequency || "" }] })}>
                Add Row
              </Button>
            </div>
          </div>
        ))}
      </Step>

      {preview && (
        <PreviewOverlay
          url={preview}
          fileName={`${(form.customer.name || "Customer").replace(/[^A-Za-z0-9]+/g, "_")}_AGREEMENT_DRAFT.pdf`}
          title="Agreement preview - not saved"
          onClose={() => {
            URL.revokeObjectURL(preview);
            setPreview(null);
          }}
        />
      )}
    </Modal>
  );
}

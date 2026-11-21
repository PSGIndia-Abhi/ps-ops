import { useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { FiPaperclip, FiUploadCloud, FiX } from "react-icons/fi";
import { EmptyRow } from "../accountant/ui";
import { billingPost, billingPut, billingUpload, openPdf, qs, useBilling } from "./billingApi";
import { amount, dmy, rupees, rupeesShort } from "./format";
import { Field, Kpi, Modal, Msg, StatusBadge } from "./ui";
import useDebounced from "./useDebounced";

// Purchase Orders: standard POs, Open POs (no expiry) and advance POs (Termite: an advance the
// customer paid, adjusted against each invoice). Expiry is tracked here and alerted daily.

const FILTERS = [
  ["all", "All"],
  ["expiring", "Expiring soon"],
  ["expired", "Expired"],
  ["open", "Open PO"],
  ["advance", "Advance"],
];

function filterParams(f) {
  return {
    expiring: { expiring_in_days: 30, status: "ACTIVE" },
    expired: { expired: true, status: "ACTIVE" },
    open: { open_po: true },
    advance: { kind: "ADVANCE" },
  }[f] || {};
}

export default function PurchaseOrders() {
  const { me } = useOutletContext();
  const navigate = useNavigate();
  const canEdit = me.can("MANAGE_BILLING_MASTERS");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const q = useDebounced(search);
  const { data, error, loading, reload } = useBilling(`/pos${qs({ ...filterParams(filter), q })}`);
  const [editing, setEditing] = useState(null); // {} = new, po = edit
  const [openId, setOpenId] = useState(null);
  const [notice, setNotice] = useState("");
  const s = data?.summary;
  const rows = data?.rows || [];

  return (
    <div className="ac-page">
      <div className="ac-head">
        <div>
          <div className="ac-crumb"><button type="button" onClick={() => navigate("/billing/masters")}>← Masters</button> / Purchase Orders</div>
          <h1 className="ac-title">Purchase Orders</h1>
          <p className="ac-sub">Customer POs, expiry tracking and Termite advances.</p>
        </div>
        {canEdit && <div className="ac-actions"><button type="button" className="ac-btn ac-btn-primary" onClick={() => setEditing({})}>+ Add PO</button></div>}
      </div>

      {notice && <Msg error={notice} />}
      <div className="ac-kpis bl-kpis-4">
        <Kpi color="blue" label="Active POs" value={s?.active ?? "—"} note={s ? `incl. ${s.open_po} Open POs` : ""} onClick={() => setFilter("all")} active={filter === "all"} />
        <Kpi color="orange" label="Expiring in 30 days" value={s?.expiring_30_days ?? "—"} note="renewal needed" onClick={() => setFilter("expiring")} active={filter === "expiring"} />
        <Kpi color="red" label="Expired" value={s?.expired ?? "—"} note="billing blocked" onClick={() => setFilter("expired")} active={filter === "expired"} />
        <Kpi color="green" label="Advance remaining" value={s ? rupeesShort(s.advance_remaining) : "—"} note="on Termite advance POs" onClick={() => setFilter("advance")} active={filter === "advance"} />
      </div>

      <div className="ac-card">
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, gap: 10, flexWrap: "wrap" }}>
          <div className="ac-pills">
            {FILTERS.map(([v, l]) => <button key={v} type="button" className={`ac-pill ${filter === v ? "active" : ""}`} onClick={() => setFilter(v)}>{l}</button>)}
          </div>
          <input className="ac-input" style={{ maxWidth: 300 }} placeholder="Search PO number or customer…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Msg error={error} />
        <div className="ac-table-wrap">
          <table className="ac-table ac-stack">
            <thead>
              <tr><th>PO number</th><th>Customer</th><th>PO date</th><th>Expiry</th><th>Type</th><th className="ac-num">PO amount (₹)</th><th className="ac-num">Invoiced / adjusted (₹)</th><th>Balance</th><th>Status</th></tr>
            </thead>
            <tbody>
              {loading || !rows.length ? (
                <EmptyRow cols={9} loading={loading} text="No purchase orders." />
              ) : (
                rows.map((p) => {
                  const pct = p.po_amount ? Math.max(0, Math.min(100, Math.round((p.balance * 100) / p.po_amount))) : 0;
                  return (
                    <tr key={p.id} className="bl-click" onClick={() => setOpenId(p.id)}>
                      <td><b>{p.po_number}</b>{p.contract_code && <div className="bl-sub">{p.contract_code}</div>}</td>
                      <td>{p.customer}</td>
                      <td>{dmy(p.po_date)}</td>
                      <td>{p.is_open_po ? <span className="ac-badge b-grey">Open PO</span> : dmy(p.expiry_date)}</td>
                      <td>{p.kind === "ADVANCE" ? <span className="ac-badge b-orange">Advance</span> : "Standard"}</td>
                      <td className="bl-num">{p.po_amount === null ? "—" : amount(p.po_amount)}</td>
                      <td className="bl-num">{amount(p.invoiced)}</td>
                      <td>
                        {p.balance === null ? <span className="ac-sub">No limit</span> : (
                          <>
                            <b>{rupees(p.balance)}</b>
                            <div className={`bl-bar ${p.balance <= 0 ? "red" : pct < 25 ? "amber" : ""}`} style={{ marginTop: 4 }}><i style={{ width: `${pct}%` }} /></div>
                          </>
                        )}
                      </td>
                      <td>
                        {p.display_status === "EXPIRING" ? <span className="ac-badge b-amber">Expires in {p.expires_in_days} day{p.expires_in_days === 1 ? "" : "s"}</span>
                          : p.kind === "ADVANCE" && p.po_amount && pct < 25 && p.display_status === "ACTIVE" ? <span className="ac-badge b-amber">Advance low</span>
                            : <StatusBadge value={p.display_status} />}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && <PoForm po={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={(id, warning) => { setEditing(null); setNotice(warning || ""); reload(); setOpenId(id); }} />}
      {openId && !editing && <PoDetail id={openId} canEdit={canEdit} onClose={() => setOpenId(null)} onEdit={(po) => setEditing(po)} onChanged={reload} />}
    </div>
  );
}

function PoForm({ po, onClose, onSaved }) {
  const { data: customers } = useBilling(po ? null : "/customers");
  const [form, setForm] = useState(po ? { ...po, expiry_date: po.expiry_date || "", valid_from: po.valid_from || "", po_amount: po.po_amount ?? "", remarks: po.remarks || "" } : { company_id: "", contract_id: "", po_number: "", po_date: "", valid_from: "", expiry_date: "", po_amount: "", kind: "STANDARD", remarks: "" });
  const [openPo, setOpenPo] = useState(po ? po.is_open_po : false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState(null);
  const set = (patch) => setForm({ ...form, ...patch });

  // The PO copy is checked here and uploaded right after the PO is saved (POST /pos/:id/file).
  function pickFile(e) {
    const picked = e.target.files?.[0] || null;
    e.target.value = "";
    if (!picked) return;
    if (!["application/pdf", "image/png", "image/jpeg"].includes(picked.type)) { setError("The PO copy must be a PDF, JPG or PNG"); return; }
    if (picked.size > 3 * 1024 * 1024) { setError("The PO copy is too large (max 3 MB)"); return; }
    setError("");
    setFile(picked);
  }

  async function save() {
    if (form.po_amount === "" || Number(form.po_amount) <= 0) {
      setError("Type the PO amount.");
      return;
    }
    setBusy(true);
    setError("");
    const body = {
      company_id: form.company_id, contract_id: form.contract_id || null, po_number: form.po_number, po_date: form.po_date,
      valid_from: form.valid_from || null, expiry_date: openPo ? null : form.expiry_date || null,
      po_amount: form.po_amount === "" ? null : form.po_amount, kind: form.kind, remarks: form.remarks || null,
      ...(po ? { status: form.status } : {}),
    };
    try {
      const r = po ? await billingPut(`/pos/${po.id}`, body) : await billingPost("/pos", body);
      const poId = r.id || po?.id;
      let warning = "";
      if (file) {
        try {
          const fd = new FormData();
          fd.append("file", file);
          await billingUpload(`/pos/${poId}/file`, fd);
        } catch (err) {
          warning = `PO saved, but the copy didn't upload (${err.message}). Upload it from the PO.`;
        }
      }
      onSaved(poId, warning);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} label="Purchase order">
      <div className="bl-m-head"><h3>{po ? `Edit PO ${po.po_number}` : "Add PO"}</h3><button type="button" className="bl-x" onClick={onClose} aria-label="Close">✕</button></div>
      <div className="bl-m-body">
        <div className="bl-grid g2">
          <Field label="Customer" required>
            {po ? <input className="ac-input" readOnly value={po.customer} /> : (
              <select className="ac-select" value={form.company_id} onChange={(e) => set({ company_id: e.target.value })}>
                <option value="">Choose a customer…</option>
                {(customers || []).map((c) => <option key={c.company_id} value={c.company_id}>{c.name}</option>)}
              </select>
            )}
          </Field>
          <Field label="PO number" required><input className="ac-input" value={form.po_number} maxLength={100} onChange={(e) => set({ po_number: e.target.value })} /></Field>
          <Field label="PO date" required><input type="date" className="ac-input" value={form.po_date || ""} onChange={(e) => set({ po_date: e.target.value })} /></Field>
          <Field label="Valid from"><input type="date" className="ac-input" value={form.valid_from || ""} onChange={(e) => set({ valid_from: e.target.value })} /></Field>
          <Field label="Expiry date">
            <input type="date" className="ac-input" value={openPo ? "" : form.expiry_date || ""} disabled={openPo} onChange={(e) => set({ expiry_date: e.target.value })} />
            <label className="bl-toggle" style={{ paddingTop: 4 }}><input type="checkbox" checked={openPo} onChange={(e) => setOpenPo(e.target.checked)} /> Open PO (no end date)</label>
          </Field>
          <Field label="PO amount (₹, incl. GST)" required>
            <input type="number" min="0" step="0.01" className="ac-input" value={form.po_amount} onChange={(e) => set({ po_amount: e.target.value })} />
          </Field>
          {po && (
            <Field label="Status">
              <select className="ac-select" value={form.status} onChange={(e) => set({ status: e.target.value })}>
                <option value="ACTIVE">Active</option>
                <option value="CLOSED">Closed</option>
              </select>
            </Field>
          )}
          <Field label="Remarks" className="bl-span2"><input className="ac-input" value={form.remarks} maxLength={1000} onChange={(e) => set({ remarks: e.target.value })} /></Field>
          <Field label="PO copy" className="bl-span2" hint={po?.file && !file ? `Current: ${po.file.name} - choose a file to replace it (the old copy is kept)` : "PDF, JPG or PNG, up to 3 MB (optional)"}>
            {file ? (
              <div className="pd-file"><FiPaperclip /><span>{file.name}</span><small>{Math.max(1, Math.round(file.size / 1024))} KB</small><button type="button" className="sos-rm" onClick={() => setFile(null)} aria-label="Remove file"><FiX /></button></div>
            ) : (
              <label className="pd-drop"><FiUploadCloud /><span>{po?.file ? "Replace the PO copy" : "Choose the PO copy"}</span><input type="file" accept="application/pdf,image/png,image/jpeg" onChange={pickFile} /></label>
            )}
          </Field>
        </div>
        <Msg error={error} />
      </div>
      <div className="bl-m-foot"><span /><div className="ac-actions"><button type="button" className="ac-btn" onClick={onClose}>Cancel</button><button type="button" className="ac-btn ac-btn-primary" disabled={busy || !form.company_id || !form.po_number || !form.po_date} onClick={save}>{busy ? (file ? "Saving and uploading…" : "Saving…") : "Save PO"}</button></div></div>
    </Modal>
  );
}

function PoDetail({ id, canEdit, onClose, onEdit, onChanged }) {
  const { data: po, error, reload } = useBilling(`/pos/${id}`);
  const { data: payments } = useBilling(po?.kind === "ADVANCE" && canEdit ? `/payments${qs({ company_id: po.company_id })}` : null);
  const [paymentId, setPaymentId] = useState("");
  const [msg, setMsg] = useState({});
  const [busy, setBusy] = useState(false);

  async function act(fn, ok) {
    setBusy(true);
    setMsg({});
    try {
      await fn();
      setMsg({ ok });
      reload();
      onChanged();
    } catch (err) {
      setMsg({ error: err.message });
    } finally {
      setBusy(false);
    }
  }
  const link = () => act(() => billingPost(`/pos/${id}/advances`, { payment_id: paymentId }), "Advance payment linked.");
  const upload = (file) => {
    const fd = new FormData();
    fd.append("file", file);
    act(() => billingUpload(`/pos/${id}/file`, fd), "PO copy uploaded.");
  };
  const candidates = (payments || []).filter((p) => !p.linked_po);

  return (
    <Modal onClose={onClose} label="Purchase order">
      <div className="bl-m-head">
        <div style={{ flex: 1 }}>
          <h3>PO {po?.po_number || ""}</h3>
          {po && <div className="ac-sub">{po.customer}{po.contract_code ? ` · ${po.contract_code}` : ""} · {po.is_open_po ? "Open PO" : `valid till ${dmy(po.expiry_date)}`} · {po.kind === "ADVANCE" ? "Advance" : "Standard"}</div>}
        </div>
        {po && canEdit && <button type="button" className="ac-btn sm" onClick={() => onEdit(po)}>Edit</button>}
        <button type="button" className="bl-x" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className="bl-m-body">
        <Msg error={error} />
        {po && (
          <>
            <div className="ac-stats">
              <div className="ac-stat blue"><div className="ac-stat-label">PO amount</div><div className="ac-stat-value">{po.po_amount === null ? "No limit" : rupees(po.po_amount)}</div></div>
              <div className="ac-stat orange"><div className="ac-stat-label">{po.kind === "ADVANCE" ? "Adjusted" : "Invoiced"}</div><div className="ac-stat-value">{rupees(po.invoiced)}</div></div>
              <div className="ac-stat green"><div className="ac-stat-label">Balance</div><div className="ac-stat-value">{po.balance === null ? "—" : rupees(po.balance)}</div></div>
              <div className="ac-stat"><div className="ac-stat-label">Status</div><div className="ac-stat-value" style={{ fontSize: 16 }}><StatusBadge value={po.display_status} /></div></div>
            </div>

            <div>
              <div className="bl-m-sec">Invoices on this PO</div>
              <table className="ac-table ac-stack">
                <thead><tr><th>Invoice</th><th>Date</th><th className="ac-num">Amount (₹)</th><th>Status</th></tr></thead>
                <tbody>
                  {!po.invoices.length ? <EmptyRow cols={4} text="No invoices yet" /> : po.invoices.map((i) => (
                    <tr key={i.id}><td>{i.invoice_number}</td><td>{dmy(i.date)}</td><td className="bl-num">{amount(i.amount)}</td><td><StatusBadge value={i.status} /></td></tr>
                  ))}
                </tbody>
              </table>
            </div>

            {po.kind === "ADVANCE" && (
              <div>
                <div className="bl-m-sec">Advance payments</div>
                <table className="ac-table ac-stack">
                  <thead><tr><th>Payment</th><th>Date</th><th className="ac-num">Received (₹)</th><th className="ac-num">Adjusted (₹)</th><th className="ac-num">Remaining (₹)</th></tr></thead>
                  <tbody>
                    {!po.advances.length ? <EmptyRow cols={5} text="No advance linked yet" /> : po.advances.map((a) => (
                      <tr key={a.payment_id}><td>{a.payment_number}</td><td>{dmy(a.date)}</td><td className="bl-num">{amount(a.received)}</td><td className="bl-num">{amount(a.adjusted)}</td><td className="bl-num"><b>{amount(a.remaining)}</b></td></tr>
                    ))}
                  </tbody>
                </table>
                {canEdit && (
                  <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <select className="ac-select" style={{ flex: 1, minWidth: 220 }} value={paymentId} onChange={(e) => setPaymentId(e.target.value)}>
                      <option value="">{candidates.length ? "Link a received payment…" : "No unlinked payments for this customer"}</option>
                      {candidates.map((p) => <option key={p.payment_id} value={p.payment_id}>{p.payment_number} · {dmy(p.payment_date)} · {rupees(p.received_amount)} (unallocated {rupees(p.unallocated)})</option>)}
                    </select>
                    <button type="button" className="ac-btn ac-btn-primary" disabled={!paymentId || busy} onClick={link}>Link advance</button>
                  </div>
                )}
              </div>
            )}

            <div>
              <div className="bl-m-sec">PO copy</div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                {po.file ? <button type="button" className="ac-btn sm" onClick={() => openPdf(`/pos/${id}/file`).catch((err) => setMsg({ error: err.message }))}>Open {po.file.name}</button> : <span className="ac-sub">No copy uploaded</span>}
                {canEdit && (
                  <label className="ac-btn sm" style={{ cursor: "pointer" }}>
                    {po.file ? "Replace" : "Upload"} (PDF, JPG, PNG – max 3 MB)
                    <input type="file" accept="application/pdf,image/png,image/jpeg" hidden onChange={(e) => e.target.files[0] && upload(e.target.files[0])} />
                  </label>
                )}
              </div>
            </div>
            {po.remarks && <div className="ac-sub">Remarks: {po.remarks}</div>}
            <Msg {...msg} />
          </>
        )}
      </div>
    </Modal>
  );
}

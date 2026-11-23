import { Fragment, useState } from "react";
import { Navigate, useNavigate, useOutletContext, useParams } from "react-router-dom";
import {
  FiArrowLeft, FiCheckCircle, FiClock, FiDownload, FiExternalLink, FiFileText, FiLink, FiMail, FiMapPin,
  FiMessageCircle, FiPaperclip, FiPlusCircle, FiPrinter, FiShare2, FiTrash2, FiXCircle,
} from "react-icons/fi";
import { billingDelete, downloadFile, openPdf, printPdf, useBilling } from "./billingApi";
import { amount, dmy, periodLabel, rupees } from "./format";
import { emailInvoice } from "./emailInvoice";
import CancelDialog from "./CancelDialog";
import PaymentDialog from "./PaymentDialog";
import { modeLabel } from "./payModes";
import { Modal, Msg, StatusBadge, TypeBadge } from "./ui";
import { BILLING_HOME } from "./access";
import { InvoiceSkeleton } from "./Skeletons";

// One issued invoice, everything an accountant needs: who it is for, what it bills, the tax, the
// money (paid / pending, payments recorded in Billing with TDS and proof), and every print and share.

const CHANNEL = {
  EMAIL: { icon: FiMail, label: "Email sent" },
  WHATSAPP: { icon: FiMessageCircle, label: "WhatsApp" },
  LINK: { icon: FiLink, label: "Link created" },
  PRINT: { icon: FiPrinter, label: "Printed" },
  OTHER: { icon: FiShare2, label: "Shared" },
};
const when = (v) => (v ? new Date(v).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

export default function InvoiceView() {
  const { id } = useParams();
  const { me } = useOutletContext();
  const navigate = useNavigate();
  const { data: inv, error, loading, reload } = useBilling(`/invoices/${id}`);
  const { data: shares, reload: reloadShares } = useBilling(inv && inv.status !== "DRAFT" ? `/invoices/${id}/shares` : null);
  const [printing, setPrinting] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [msg, setMsg] = useState({});
  const [busy, setBusy] = useState("");
  const [paying, setPaying] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [removeReason, setRemoveReason] = useState("");

  if (error) return <div className="ac-page"><Msg error={error} /></div>;
  if (loading || !inv) return <InvoiceSkeleton />;
  if (inv.status === "DRAFT") return <Navigate to={`${BILLING_HOME}/drafts/${id}`} replace />;

  const cancelled = inv.status === "CANCELLED";
  const col = inv.collection; // payments recorded in Billing
  const paidPct = col && col.total ? Math.min(100, Math.round((col.paid * 100) / col.total)) : 0;
  const paidSomething = Boolean(col && col.received + col.tds + (col.accounts || 0) > 0);
  const canRecord = !cancelled && me.can("ISSUE_INVOICE");

  async function removePayment() {
    setBusy("remove");
    setMsg({});
    try {
      await billingDelete(`/invoice-payments/${removing.id}`, { reason: removeReason });
      setRemoving(null);
      setRemoveReason("");
      setMsg({ ok: "Payment removed." });
      reload();
    } catch (err) {
      setMsg({ error: err.message });
    } finally {
      setBusy("");
    }
  }
  const tax = inv.tax_mode === "IGST"
    ? [[`IGST ${inv.gst_rate}%`, inv.igst]]
    : inv.tax_mode === "CGST_SGST" ? [[`CGST ${inv.gst_rate / 2}%`, inv.cgst], [`SGST ${inv.gst_rate / 2}%`, inv.sgst]] : [];

  async function download() {
    setBusy("download");
    setMsg({});
    try {
      await downloadFile(`/invoices/${id}/pdf`, `${String(inv.invoice_number).replace(/\//g, "-")}.pdf`);
    } catch (err) {
      setMsg({ error: err.message });
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="ac-page iv-page">
      <button type="button" className="bl-link iv-back" onClick={() => navigate(`${BILLING_HOME}/invoices`)}><FiArrowLeft /> Issued Invoices</button>

      <div className={`iv-hero ${cancelled ? "cancelled" : ""}`}>
        <div className="iv-hero-main">
          <span className="iv-hero-ic"><FiFileText /></span>
          <div>
            <div className="iv-hero-top">
              <h1>{inv.invoice_number}{inv.is_manual && <span className="ac-badge b-purple mi-tag">Manual invoice</span>}</h1>
              {cancelled ? <StatusBadge value="CANCELLED" /> : <StatusBadge value={col?.status || "PENDING"} />}
              <TypeBadge type={inv.contract.billing_type} frequency={inv.contract.frequency_months} unit={inv.contract.frequency_unit} />
            </div>
            <div className="iv-hero-sub">
              <b>{inv.customer.name}</b> · {dmy(inv.invoice_date)} · {periodLabel(inv.period_start, inv.period_end)} · {inv.contract.contract_code}
            </div>
          </div>
        </div>
        <div className="iv-hero-amt">
          <span>Invoice total</span>
          <b>{cancelled ? <s>{rupees(inv.total)}</s> : rupees(inv.total)}</b>
          {!cancelled && col && <span className="iv-due">{col.balance > 0 ? `${rupees(col.balance)} pending` : "Fully paid"}</span>}
        </div>
      </div>

      <div className="iv-toolbar">
        <button type="button" className="iv-tool" onClick={() => openPdf(`/invoices/${id}/pdf`).catch((e) => setMsg({ error: e.message }))}><FiExternalLink /> View PDF</button>
        <button type="button" className="iv-tool" disabled={busy === "download"} onClick={download}><FiDownload /> {busy === "download" ? "Downloading…" : "Download"}</button>
        {!cancelled && me.can("SHARE_INVOICE") && (
          <>
            <button type="button" className="iv-tool" disabled={printing} onClick={async () => {
              // straight to the print window, every copy set for this customer
              setPrinting(true);
              setMsg({});
              try { await printPdf(`/invoices/${id}/print?copies=${inv.print_copies || 1}`); } catch (err) { setMsg({ error: err.message }); } finally { setPrinting(false); reloadShares(); }
            }}><FiPrinter /> {printing ? "Opening…" : `Print${(inv.print_copies || 1) > 1 ? ` (${inv.print_copies} copies)` : ""}`}</button>
            <button type="button" className="iv-tool primary" disabled={emailing} onClick={async () => {
              setEmailing(true);
              setMsg({});
              try { setMsg({ ok: await emailInvoice(id) }); } catch (err) { setMsg({ error: err.message }); } finally { setEmailing(false); reloadShares(); }
            }}><FiMail /> {emailing ? "Sending…" : "Email"}</button>
          </>
        )}
        <span className="iv-tool-gap" />
        {!cancelled && me.can("CANCEL_INVOICE") && (
          <button type="button" className="iv-tool danger" disabled={paidSomething} title={paidSomething ? "A payment is recorded - remove it first to cancel" : undefined} onClick={() => setCancelling(true)}>
            <FiXCircle /> Cancel invoice
          </button>
        )}
      </div>
      <Msg {...msg} />
      {cancelled && (
        <div className="ac-info error" style={{ marginBottom: 14 }}><span><FiXCircle /> Cancelled {when(inv.cancelled_at)}{inv.cancel_reason ? ` - “${inv.cancel_reason}”` : ""}</span></div>
      )}

      <div className="iv-grid">
        <div className="iv-main">
          <section className="ac-card iv-card">
            <div className="iv-parties">
              <div>
                <div className="iv-label">Bill to</div>
                <b>{inv.bill_to.name}</b>
                <div className="iv-addr">{inv.bill_to.address}</div>
                {inv.bill_to.gst_number && <div className="iv-meta">GSTIN {inv.bill_to.gst_number}</div>}
                {inv.bill_to.state && <div className="iv-meta">State {inv.bill_to.state}</div>}
              </div>
              {/* a group based invoice bills the group: no Ship to */}
              {/* Service offered to: only when it is set on the customer's billing details */}
              {inv.contract?.contract_kind !== "GROUP" && inv.service_offered_to && (
                <div>
                  <div className="iv-label">{inv.service_offered_to ? "Service offered to" : "Ship to"}</div>
                  {inv.service_offered_to ? <div className="iv-addr" style={{ whiteSpace: "pre-line" }}><FiMapPin /> {inv.service_offered_to}</div> : inv.ship_to ? <><b>{inv.ship_to.name}</b><div className="iv-addr"><FiMapPin /> {inv.ship_to.address}</div></> : <span className="ac-sub">Same as Bill To</span>}
                </div>
              )}
              <div className="iv-facts">
                <div><span>Invoice date</span><b>{dmy(inv.invoice_date)}</b></div>
                <div><span>Period</span><b>{dmy(inv.period_start)} – {dmy(inv.period_end)}</b></div>
                <div><span>Place of supply</span><b>{inv.place_of_supply}</b></div>
                {inv.pos.length > 0 && <div><span>PO</span><b>{inv.pos.map((p) => p.po_number).join(", ")}</b></div>}
              </div>
            </div>
          </section>

          <section className="ac-card iv-card">
            <h3 className="ac-card-title">Items</h3>
            <div className="ac-table-wrap">
              <table className="ac-table ac-stack iv-items">
                <thead><tr><th>#</th><th>Item</th><th>SAC</th><th className="ac-num">Qty</th><th className="ac-num">Rate (₹)</th><th className="ac-num">Amount (₹)</th></tr></thead>
                <tbody>
                  {inv.lines.map((l, i) => (
                    <tr key={l.id}>
                      <td className="ac-sub">{i + 1}</td>
                      <td>
                        <b>{l.item_name}</b>
                        <div className="bl-sub">
                          {[l.site, l.services_planned !== null ? `${l.services_done} of ${l.services_planned} services done` : null, l.invoice_group ? `prints as “${l.invoice_group}”` : null].filter(Boolean).join(" · ")}
                        </div>
                      </td>
                      <td className="ac-sub">{l.sac_code || "—"}</td>
                      <td className="bl-num">{l.quantity} <span className="ac-sub">{String(l.unit || "").toLowerCase()}</span></td>
                      <td className="bl-num">{amount(l.rate)}</td>
                      <td className="bl-num"><b>{amount(l.amount)}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="iv-totals">
              <div className="iv-words">
                <div className="iv-label">Amount in words</div>
                <div>{inv.amount_in_words}</div>
                {inv.description && <><div className="iv-label" style={{ marginTop: 10 }}>Description</div><div>{inv.description}</div></>}
              </div>
              <dl className="iv-sum">
                <dt>Sub total</dt><dd>{amount(inv.subtotal)}</dd>
                {tax.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{amount(v)}</dd></Fragment>)}
                {inv.tax_mode === "NONE" && <><dt>GST</dt><dd>Not charged</dd></>}
                {Number(inv.round_off) !== 0 && <><dt>Round off</dt><dd>{amount(inv.round_off)}</dd></>}
                <dt className="iv-total">Total</dt><dd className="iv-total">{rupees(inv.total)}</dd>
                {inv.advance_adjusted > 0 && <><dt>From advance</dt><dd>− {amount(inv.advance_adjusted)}</dd></>}
              </dl>
            </div>
          </section>
        </div>

        <aside className="iv-side">
          <section className="ac-card iv-card iv-paycard">
            <div className="iv-paycard-head">
              <h3 className="ac-card-title" style={{ margin: 0 }}>Payment</h3>
              {canRecord && col && col.balance > 0 && (
                <button type="button" className="ac-btn sm iv-paybtn" onClick={() => setPaying(true)}><FiPlusCircle /> Record payment</button>
              )}
            </div>
            {!col ? <div className="ac-sub">—</div> : (
              <>
                <div className="iv-pay-head"><StatusBadge value={cancelled ? "CANCELLED" : col.status} label={!cancelled && col.status === "PARTIAL" ? "Partially paid" : undefined} /><span className="ac-sub">{paidPct}% received</span>{col.connected && <span className="iv-linked" title="Payments the Collection Executive records in the Accountant Panel show here, and payments recorded here show there">Linked to Accountant Panel</span>}</div>
                <div className="iv-paybar"><span style={{ width: `${paidPct}%` }} /></div>
                <dl className="iv-sum compact">
                  <dt>Invoice total</dt><dd>{rupees(col.total)}</dd>
                  {col.advance > 0 && <><dt>From advance</dt><dd className="ok">{rupees(col.advance)}</dd></>}
                  <dt>Received</dt><dd className="ok">{rupees(col.received)}</dd>
                  {col.accounts > 0 && <><dt>Recorded in Accountant Panel</dt><dd className="ok">{rupees(col.accounts)}</dd></>}
                  {col.tds > 0 && <><dt>TDS deducted</dt><dd className="ok">{rupees(col.tds)}</dd></>}
                  <dt>Balance</dt><dd className={col.balance > 0 ? "bad" : ""}><b>{rupees(col.balance)}</b></dd>
                </dl>
                {inv.payments.length > 0 ? (
                  <div className="iv-pays">
                    <div className="iv-label">Payments ({inv.payments.length})</div>
                    {inv.payments.map((p) => (
                      <div key={p.id} className="iv-payrow">
                        <span>
                          <b>{rupees(p.amount)}{p.tds_amount > 0 && <span className="iv-tds"> + TDS {rupees(p.tds_amount)}</span>}</b>
                          <span className="bl-sub">
                            {dmy(p.paid_on)} · {modeLabel(p)}
                            {p.reference_no ? ` · ${p.reference_no}` : ""}
                            {p.cheque_no ? ` · No. ${p.cheque_no}${p.cheque_date ? ` dt ${dmy(p.cheque_date)}` : ""}${p.bank_name ? `, ${p.bank_name}` : ""}` : ""}
                          </span>
                          {(p.received_in || p.remarks) && <span className="bl-sub">{[p.received_in && `Into ${p.received_in}`, p.remarks].filter(Boolean).join(" · ")}</span>}
                          <span className="bl-sub">by {p.created_by_name || "—"}</span>
                        </span>
                        <span className="iv-payacts">
                          {p.has_proof && <button type="button" className="sos-iconbtn" title={`Proof: ${p.proof_file_name}`} aria-label="Open proof" onClick={() => openPdf(`/invoice-payments/${p.id}/proof`).catch((e) => setMsg({ error: e.message }))}><FiPaperclip /></button>}
                          {canRecord && <button type="button" className="sos-iconbtn red" title="Remove (entered by mistake)" aria-label="Remove payment" onClick={() => { setRemoving(p); setRemoveReason(""); }}><FiTrash2 /></button>}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : !cancelled && <div className="ac-sub" style={{ fontSize: 12.5, marginTop: 8 }}>No payment recorded yet.</div>}
              </>
            )}
          </section>

          <section className="ac-card iv-card">
            <h3 className="ac-card-title">Activity</h3>
            <ol className="iv-timeline">
              {cancelled && <li className="bad"><span className="iv-tl-ic"><FiXCircle /></span><div><b>Cancelled</b><span>{when(inv.cancelled_at)}</span></div></li>}
              {(shares || []).map((s) => {
                const c = CHANNEL[s.channel] || CHANNEL.OTHER;
                const Icon = c.icon;
                return (
                  <li key={s.id} className={s.status === "FAILED" ? "bad" : ""}>
                    <span className="iv-tl-ic"><Icon /></span>
                    <div>
                      <b>{s.status === "FAILED" ? `${c.label} - failed` : c.label}{s.copies ? ` · ${s.copies} cop${s.copies === 1 ? "y" : "ies"}` : ""}</b>
                      <span>{s.to?.length ? `${s.to.join(", ")} · ` : ""}{s.by || "—"} · {when(s.at)}{s.link_opened ? ` · opened ${s.link_opened}×` : ""}</span>
                    </div>
                  </li>
                );
              })}
              <li className="ok"><span className="iv-tl-ic"><FiCheckCircle /></span><div><b>Issued</b><span>{inv.issued_by || "—"} · {when(inv.issued_at)}</span></div></li>
            </ol>
            {!shares?.length && <div className="ac-sub" style={{ fontSize: 12.5 }}><FiClock /> Not printed or shared yet.</div>}
          </section>
        </aside>
      </div>

      {paying && col && (
        <PaymentDialog
          invoice={{ id, invoice_number: inv.invoice_number, customer: inv.customer.name }}
          balance={col.balance}
          onClose={() => setPaying(false)}
          onSaved={() => { setPaying(false); setMsg({ ok: "Payment recorded." }); reload(); }}
        />
      )}
      {removing && (
        <Modal onClose={() => busy !== "remove" && setRemoving(null)} narrow label="Remove payment">
          <div className="bl-m-head"><div><h3>Remove this payment?</h3><div className="ac-sub">{rupees(removing.amount)}{removing.tds_amount > 0 ? ` + TDS ${rupees(removing.tds_amount)}` : ""} · {dmy(removing.paid_on)} · {modeLabel(removing)}</div></div><button type="button" className="bl-x" onClick={() => setRemoving(null)} aria-label="Close">✕</button></div>
          <div className="bl-m-body">
            <div className="ac-sub">Use this only for a payment entered by mistake. It is kept in the record with your reason.</div>
            <textarea className="ac-textarea" rows={3} autoFocus value={removeReason} maxLength={500} placeholder="Why is it being removed?" onChange={(e) => setRemoveReason(e.target.value)} />
          </div>
          <div className="bl-m-foot"><span /><div className="ac-actions"><button type="button" className="ac-btn" disabled={busy === "remove"} onClick={() => setRemoving(null)}>Cancel</button><button type="button" className="ac-btn danger-text" disabled={busy === "remove" || !removeReason.trim()} onClick={removePayment}>{busy === "remove" ? "Removing…" : "Remove payment"}</button></div></div>
        </Modal>
      )}
      {cancelling && (
        <CancelDialog
          invoice={{ id, invoice_number: inv.invoice_number, customer: inv.customer.name, total: inv.total }}
          onClose={() => setCancelling(false)}
          onDone={() => { setCancelling(false); reload(); reloadShares(); }}
        />
      )}
    </div>
  );
}

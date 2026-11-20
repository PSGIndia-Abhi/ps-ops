import { Fragment, useState } from "react";
import { Navigate, useNavigate, useOutletContext, useParams } from "react-router-dom";
import {
  FiArrowLeft, FiCheckCircle, FiClock, FiDownload, FiExternalLink, FiFileText, FiLink, FiMail, FiMapPin,
  FiMessageCircle, FiPrinter, FiSend, FiShare2, FiXCircle,
} from "react-icons/fi";
import { downloadFile, openPdf, useBilling } from "./billingApi";
import { amount, dmy, periodLabel, rupees } from "./format";
import ShareDialog from "./ShareDialog";
import CancelDialog from "./CancelDialog";
import { Msg, StatusBadge, TypeBadge } from "./ui";
import { BILLING_HOME } from "./access";

// One issued invoice, everything an accountant needs: who it is for, what it bills, the tax, the
// money (paid / pending / overdue, payments, TDS), and every print and share - with the actions.

const CHANNEL = {
  EMAIL: { icon: FiMail, label: "Emailed" },
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
  const [sharing, setSharing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [msg, setMsg] = useState({});
  const [busy, setBusy] = useState("");

  if (error) return <div className="ac-page"><Msg error={error} /></div>;
  if (loading || !inv) return <div className="ac-page"><div className="ac-card">Loading…</div></div>;
  if (inv.status === "DRAFT") return <Navigate to={`${BILLING_HOME}/drafts/${id}`} replace />;

  const cancelled = inv.status === "CANCELLED";
  const r = inv.receivable;
  const paidPct = r && r.amount ? Math.min(100, Math.round((r.paid * 100) / r.amount)) : 0;
  const overdue = r && r.status === "OVERDUE";
  const paidSomething = r && r.paid > 0 && !(inv.advance_adjusted > 0);
  const tax = inv.tax_mode === "IGST"
    ? [[`IGST ${inv.gst_rate}%`, inv.igst]]
    : inv.tax_mode === "CGST_SGST" ? [[`CGST ${inv.gst_rate / 2}%`, inv.cgst], [`SGST ${inv.gst_rate / 2}%`, inv.sgst]] : [];

  async function download() {
    setBusy("download");
    setMsg({});
    try {
      await downloadFile(`/invoices/${id}/pdf`, `Tax Invoice ${String(inv.invoice_number).replace(/\//g, "-")}.pdf`);
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
              <h1>{inv.invoice_number}</h1>
              {cancelled ? <StatusBadge value="CANCELLED" /> : <StatusBadge value={r?.status || "PENDING"} />}
              <TypeBadge type={inv.contract.billing_type} frequency={inv.contract.frequency_months} />
            </div>
            <div className="iv-hero-sub">
              <b>{inv.customer.name}</b> · {dmy(inv.invoice_date)} · {periodLabel(inv.period_start, inv.period_end)} · {inv.contract.contract_code}
            </div>
          </div>
        </div>
        <div className="iv-hero-amt">
          <span>Invoice total</span>
          <b>{cancelled ? <s>{rupees(inv.total)}</s> : rupees(inv.total)}</b>
          {!cancelled && r && <span className={overdue ? "iv-due bad" : "iv-due"}>{r.pending > 0 ? `${rupees(r.pending)} pending · due ${dmy(r.due_date)}` : "Fully paid"}</span>}
        </div>
      </div>

      <div className="iv-toolbar">
        <button type="button" className="iv-tool" onClick={() => openPdf(`/invoices/${id}/pdf`).catch((e) => setMsg({ error: e.message }))}><FiExternalLink /> View PDF</button>
        <button type="button" className="iv-tool" disabled={busy === "download"} onClick={download}><FiDownload /> {busy === "download" ? "Downloading…" : "Download"}</button>
        {!cancelled && me.can("SHARE_INVOICE") && (
          <>
            <button type="button" className="iv-tool" onClick={() => setSharing(true)}><FiPrinter /> Print</button>
            <button type="button" className="iv-tool primary" onClick={() => setSharing(true)}><FiSend /> Share / Email</button>
          </>
        )}
        <span className="iv-tool-gap" />
        {!cancelled && me.can("CANCEL_INVOICE") && (
          <button type="button" className="iv-tool danger" disabled={paidSomething} title={paidSomething ? "A payment has been received against this invoice" : undefined} onClick={() => setCancelling(true)}>
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
              <div>
                <div className="iv-label">Ship to</div>
                {inv.ship_to ? <><b>{inv.ship_to.name}</b><div className="iv-addr"><FiMapPin /> {inv.ship_to.address}</div></> : <span className="ac-sub">Same as Bill To</span>}
              </div>
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
          <section className="ac-card iv-card">
            <h3 className="ac-card-title">Payment</h3>
            {!r ? <div className="ac-sub">Not in the Accountant Panel.</div> : (
              <>
                <div className="iv-pay-head"><StatusBadge value={cancelled ? "CANCELLED" : r.status} /><span className="ac-sub">{paidPct}% received</span></div>
                <div className="iv-paybar"><span style={{ width: `${paidPct}%` }} /></div>
                <dl className="iv-sum compact">
                  <dt>Invoiced</dt><dd>{rupees(r.amount)}</dd>
                  <dt>Received</dt><dd className="ok">{rupees(r.paid)}</dd>
                  <dt>Pending</dt><dd className={overdue ? "bad" : ""}>{rupees(r.pending)}</dd>
                  <dt>Due</dt><dd className={overdue ? "bad" : ""}>{dmy(r.due_date)}{overdue ? " · overdue" : ""}</dd>
                </dl>
                {inv.payments.length > 0 && (
                  <div className="iv-pays">
                    <div className="iv-label">Payments</div>
                    {inv.payments.map((p) => (
                      <div key={`${p.payment_number}-${p.payment_date}`} className="iv-payrow">
                        <span><b>{p.payment_number}</b><span className="bl-sub">{dmy(p.payment_date)} · {p.payment_mode}{p.reference_number ? ` · ${p.reference_number}` : ""}</span></span>
                        <span className="bl-num"><b>{rupees(p.allocated_amount)}</b>{p.tds_amount > 0 && <span className="bl-sub">TDS {rupees(p.tds_amount)}</span>}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>

          {inv.tds && inv.tds.applicable && (
            <section className="ac-card iv-card">
              <h3 className="ac-card-title">TDS</h3>
              <dl className="iv-sum compact">
                <dt>Rate</dt><dd>{inv.tds.rate}% of {inv.tds.basis === "TAXABLE" ? "taxable value" : "invoice amount"}</dd>
                <dt>Expected</dt><dd>{rupees(inv.tds.expected)}</dd>
                <dt>Deducted</dt><dd>{rupees(inv.tds.deducted)}</dd>
                <dt>Pending</dt><dd>{rupees(inv.tds.pending)}</dd>
              </dl>
            </section>
          )}

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

      {sharing && <ShareDialog invoiceId={id} onClose={() => { setSharing(false); reloadShares(); }} />}
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

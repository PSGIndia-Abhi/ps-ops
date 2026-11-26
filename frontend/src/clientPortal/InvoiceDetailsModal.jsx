import { useEffect, useState } from "react";
import { FiChevronUp, FiDownload, FiEye, FiX } from "react-icons/fi";
import { formatDate, formatMoney } from "./portalUtils";

const INVOICE_STATUS = {
  PAID: { label: "Paid", className: "st-green" },
  PARTIAL: { label: "Partly paid", className: "st-amber" },
  PENDING: { label: "Pending", className: "st-amber" },
  OVERDUE: { label: "Overdue", className: "st-red" },
  CANCELLED: { label: "Cancelled", className: "st-slate" },
};

const MODE_LABELS = {
  CASH: "Cash",
  UPI: "UPI",
  BANK_TRANSFER: "Bank transfer",
  NEFT: "NEFT",
  CHEQUE: "Cheque",
  CARD: "Card",
  OTHER: "Other",
};

const modeLabel = (m) => MODE_LABELS[String(m || "").toUpperCase()] || m || "—";

// "Invoice details" for one invoice row on Documents > Invoices
// (amount, paid so far, balance due, who paid how, View / Download the PDF).
// variant "panel" = shown beside the invoice list on wide screens; "modal" = pop-up (default).
export default function InvoiceDetailsModal({ invoice, busy, onOpenFile, onClose, variant = "modal", closable = false }) {
  const [open, setOpen] = useState(true);
  const isPanel = variant === "panel";
  const st = INVOICE_STATUS[String(invoice.status || "").toUpperCase()] || { label: invoice.status || "—", className: "st-slate" };
  const payments = invoice.payments || [];
  const last = payments[payments.length - 1];
  const balance = Number(invoice.pending || 0);

  useEffect(() => {
    if (isPanel) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, isPanel]);

  const card = (
    <section
      className={`cp-inv ${isPanel ? "panel" : ""}`}
      role={isPanel ? "region" : "dialog"}
      aria-modal={isPanel ? undefined : "true"}
      aria-labelledby="cp-inv-title"
    >
      <header className="cp-inv-head">
        <div>
          <span className="cp-inv-eyebrow">Invoice</span>
          <h2 id="cp-inv-title">{invoice.invoice_number || invoice.title}</h2>
          <small>{invoice.site_name || "All outlets"} · Issued {formatDate(invoice.date)}</small>
        </div>
        <div className="cp-inv-head-right">
          <span className={`cp-status ${st.className}`}>{st.label}</span>
          {(!isPanel || closable) && <button type="button" className="cp-icon-btn" onClick={onClose} aria-label="Close invoice details"><FiX /></button>}
        </div>
      </header>

      <div className="cp-inv-sect">
        <h3>Bill details</h3>
        <button
          type="button" className="cp-inv-chev" onClick={() => setOpen((o) => !o)}
          aria-expanded={open} aria-label={open ? "Hide bill details" : "Show bill details"}
        >
          <FiChevronUp style={open ? undefined : { transform: "rotate(180deg)" }} />
        </button>
      </div>

      {open && (
        <div className="cp-inv-box">
          <div className="cp-inv-kv"><span>Invoice amount</span><strong>{formatMoney(invoice.amount)}</strong></div>
          {invoice.due_date && <div className="cp-inv-kv"><span>Due date</span><strong>{formatDate(invoice.due_date)}</strong></div>}
          <div className="cp-inv-kv"><span>Paid so far</span><strong className="cp-inv-green">−{formatMoney(invoice.paid)}</strong></div>
          <div className="cp-inv-dash" />
          <div className="cp-inv-kv total">
            <span>Balance due</span>
            <strong className={balance > 0 ? "cp-inv-red" : "cp-inv-green"}>{formatMoney(balance)}</strong>
          </div>

          <div className="cp-inv-paidby">
            <span>Paid by</span>
            {last ? (
              <strong>
                <i className="cp-inv-mode">{modeLabel(last.mode)}</i>
                {formatDate(last.date)}
                {payments.length > 1 ? ` · +${payments.length - 1} more` : ""}
              </strong>
            ) : (
              <strong className="cp-muted">No payment yet</strong>
            )}
          </div>

          {payments.length > 1 && (
            <ul className="cp-inv-payments">
              {payments.map((p, i) => (
                <li key={i}><span>{formatDate(p.date)} · {modeLabel(p.mode)}</span><strong>{formatMoney(p.amount)}</strong></li>
              ))}
            </ul>
          )}

          <div className="cp-inv-actions">
            <button type="button" className="cp-inv-btn" onClick={() => onOpenFile(false)} disabled={!!busy}>
              <FiEye /> {busy === "v" ? "Opening…" : "View invoice"}
            </button>
            <button type="button" className="cp-inv-btn primary" onClick={() => onOpenFile(true)} disabled={!!busy}>
              <FiDownload /> {busy === "d" ? "Downloading…" : "Download invoice"}
            </button>
          </div>
        </div>
      )}
      <p className="cp-inv-note">The PDF is an invoice summary from BestServe's records, not the GST tax invoice.</p>
    </section>
  );

  if (isPanel) return card;
  return (
    <div className="cp-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      {card}
    </div>
  );
}

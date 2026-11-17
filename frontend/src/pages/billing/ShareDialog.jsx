import { useState } from "react";
import { FiCopy, FiMail, FiMoreHorizontal, FiPrinter } from "react-icons/fi";
import { FaWhatsapp } from "react-icons/fa";
import { billingPost, openPdf, useBilling } from "./billingApi";
import { rupees } from "./format";
import { Modal, Msg } from "./ui";

// Print and share an issued invoice: print every copy (count set by the Service Coordinator in
// the service plan), download, or share a secure link through the user's mail app, WhatsApp,
// the clipboard or another app. Every print and share is recorded on the invoice.

export default function ShareDialog({ invoiceId, justIssued = false, onClose }) {
  const { data: opt, error: loadError } = useBilling(`/invoices/${invoiceId}/share-options`);
  const [msg, setMsg] = useState({});
  const [busy, setBusy] = useState(false);

  async function run(fn) {
    setBusy(true);
    setMsg({});
    try {
      await fn();
    } catch (err) {
      setMsg({ error: err.message, errors: err.errors });
    } finally {
      setBusy(false);
    }
  }

  // A fresh 30-day secure link (no login needed), recorded on the invoice.
  async function secureLink() {
    const r = await billingPost(`/invoices/${invoiceId}/share/link`, { expires_in_days: 30 });
    return r.link;
  }
  const logOpened = (note) => billingPost(`/invoices/${invoiceId}/share/log`, { channel: "OTHER", note });

  const print = () => run(() => openPdf(`/invoices/${invoiceId}/print?copies=${opt.print_copies}`));
  const download = () => run(() => openPdf(`/invoices/${invoiceId}/pdf`));

  // Opens the user's own mail app with the payment contacts, subject and message (with the link) filled in.
  const openEmail = () =>
    run(async () => {
      const url = await secureLink();
      const to = opt.default_email.to.join(",");
      const body = `${opt.default_email.message}\n\nView / download the invoice: ${url}`;
      window.location.href = `mailto:${to}?subject=${encodeURIComponent(opt.default_email.subject)}&body=${encodeURIComponent(body)}`;
      await logOpened("Opened in the mail app");
      setMsg({ ok: "Mail app opened with the invoice link." });
    });

  // Opens WhatsApp with the message ready; the user picks the chat there (no number needed).
  const openWhatsapp = () =>
    run(async () => {
      const tabRef = window.open("", "_blank"); // opened before the await so the popup is not blocked
      try {
        const url = await secureLink();
        const base = opt.default_whatsapp_text || `Invoice ${opt.invoice_number} for ${rupees(opt.total)}. View: {link}`;
        const text = base.includes("{link}") ? base.replace("{link}", url) : `${base} ${url}`;
        const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
        if (tabRef) tabRef.location.href = waUrl;
        else window.open(waUrl, "_blank");
        await logOpened("Opened in WhatsApp");
        setMsg({ ok: "WhatsApp opened - choose the chat to send it to." });
      } catch (err) {
        tabRef?.close();
        throw err;
      }
    });

  const copyLink = () =>
    run(async () => {
      const url = await secureLink();
      try {
        await navigator.clipboard.writeText(url);
        setMsg({ ok: "Secure link copied. It works for 30 days." });
      } catch {
        setMsg({ ok: `Could not copy automatically. Secure link (30 days): ${url}` });
      }
    });

  const shareOther = () =>
    run(async () => {
      const url = await secureLink();
      if (navigator.share) {
        await navigator.share({ title: `Invoice ${opt.invoice_number}`, text: `Invoice ${opt.invoice_number} for ${rupees(opt.total)}`, url });
        await logOpened("Shared from the device's share menu");
        setMsg({ ok: "Shared." });
      } else {
        setMsg({ ok: `This browser cannot open other apps. Paste this secure link (30 days) in any app: ${url}` });
      }
    });

  return (
    <Modal onClose={onClose} label="Share and print">
      <div className="bl-m-head">
        <div className="bl-m-ok">✓</div>
        <div style={{ flex: 1 }}>
          <h3>Invoice {opt?.invoice_number || ""} {justIssued ? "issued" : ""}</h3>
          <div className="ac-sub">{opt ? `${opt.customer} · ${rupees(opt.total)}${opt.due_date ? ` · due ${opt.due_date.split("-").reverse().join("-")}` : ""}` : "Loading…"}</div>
        </div>
        <button type="button" className="bl-x" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className="bl-m-body">
        <Msg error={loadError} />
        {opt && (
          <>
            <div>
              <div className="bl-m-sec">Print</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                <div>
                  {opt.copy_labels.map((label, i) => (
                    <div key={label} className="bl-copy"><i>{i + 1}</i>{label}</div>
                  ))}
                  <div className="ac-sub" style={{ fontSize: 12, marginTop: 4 }}>
                    {opt.print_copies} cop{opt.print_copies === 1 ? "y" : "ies"} for this customer, set by the Service Coordinator in the Service Plan
                  </div>
                </div>
                <div className="ac-actions">
                  <button type="button" className="ac-btn" disabled={busy} onClick={download}>Download PDF</button>
                  <button type="button" className="ac-btn ac-btn-primary" disabled={busy} onClick={print}>
                    <FiPrinter /> Print {opt.print_copies} cop{opt.print_copies === 1 ? "y" : "ies"}
                  </button>
                </div>
              </div>
            </div>

            <div>
              <div className="bl-m-sec">Share</div>
              <div className="bl-tiles">
                <button type="button" className="bl-tile" disabled={busy} onClick={openEmail}><span className="ic" style={{ background: "#2563eb" }}><FiMail /></span>Email</button>
                <button type="button" className="bl-tile" disabled={busy} onClick={openWhatsapp}><span className="ic" style={{ background: "#16a34a" }}><FaWhatsapp /></span>WhatsApp</button>
                <button type="button" className="bl-tile" disabled={busy} onClick={copyLink}><span className="ic" style={{ background: "#64748b" }}><FiCopy /></span>Copy link</button>
                <button type="button" className="bl-tile" disabled={busy} onClick={shareOther}><span className="ic" style={{ background: "#7c3aed" }}><FiMoreHorizontal /></span>More apps</button>
              </div>
            </div>

            <Msg {...msg} />
          </>
        )}
      </div>
      <div className="bl-m-foot">
        <span className="ac-sub" style={{ fontSize: 12 }}>Every share is logged on the invoice (who, when, to whom).</span>
        <div className="ac-actions">
          <button type="button" className="ac-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </Modal>
  );
}

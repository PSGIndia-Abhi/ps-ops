import { useState } from "react";
import { FiCopy, FiMail, FiMoreHorizontal, FiPrinter } from "react-icons/fi";
import { FaWhatsapp } from "react-icons/fa";
import { billingPost, openPdf, useBilling } from "./billingApi";
import { rupees } from "./format";
import { Modal, Msg } from "./ui";

// Print and share an issued invoice: print every copy (count set by the Service Coordinator in
// the service plan), download, email with the PDF, WhatsApp, copy a secure link, or another app.
// Every print and share is recorded on the invoice.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Recipients({ value, onChange, placeholder }) {
  const [text, setText] = useState("");
  const add = () => {
    const parts = text.split(/[,;\s]+/).map((t) => t.trim()).filter(Boolean);
    if (parts.length) onChange([...new Set([...value, ...parts])]);
    setText("");
  };
  return (
    <div className="bl-recip">
      {value.map((e) => (
        <span key={e} className="bl-rchip" style={EMAIL_RE.test(e) ? undefined : { background: "#fee2e2", color: "#b91c1c" }}>
          {e}
          <button type="button" onClick={() => onChange(value.filter((x) => x !== e))} aria-label={`Remove ${e}`}>✕</button>
        </span>
      ))}
      <input
        value={text}
        placeholder={value.length ? "" : placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (["Enter", ",", ";", "Tab"].includes(e.key) && text.trim()) {
            e.preventDefault();
            add();
          } else if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={add}
      />
    </div>
  );
}

export default function ShareDialog({ invoiceId, justIssued = false, onClose }) {
  const { data: opt, error: loadError } = useBilling(`/invoices/${invoiceId}/share-options`);
  const [tab, setTab] = useState("EMAIL");
  const [msg, setMsg] = useState({});
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState(null); // { to, cc, subject, message, attach }
  const [phone, setPhone] = useState(null);
  const [waText, setWaText] = useState(null);
  const [link, setLink] = useState("");

  const form = email || (opt ? { to: opt.default_email.to, cc: [], subject: opt.default_email.subject, message: opt.default_email.message, attach: "ORIGINAL" } : null);
  const waPhone = phone ?? opt?.contacts.find((c) => c.phone)?.phone ?? "";
  const waMessage = waText ?? opt?.default_whatsapp_text ?? "";
  const setForm = (patch) => setEmail({ ...form, ...patch });

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

  const print = () => run(() => openPdf(`/invoices/${invoiceId}/print?copies=${opt.print_copies}`));
  const download = () => run(() => openPdf(`/invoices/${invoiceId}/pdf`));
  const sendEmail = () =>
    run(async () => {
      const r = await billingPost(`/invoices/${invoiceId}/share/email`, form);
      setMsg({ ok: `Email sent to ${r.sent_to} address${r.sent_to === 1 ? "" : "es"}.` });
    });
  const sendWhatsapp = () =>
    run(async () => {
      const tabRef = window.open("", "_blank");
      try {
        const r = await billingPost(`/invoices/${invoiceId}/share/whatsapp`, { phone: waPhone, text: waMessage });
        if (tabRef) tabRef.location.href = r.wa_me_url;
        else window.open(r.wa_me_url, "_blank");
        setMsg({ ok: "WhatsApp opened with the message and a secure invoice link." });
      } catch (err) {
        tabRef?.close();
        throw err;
      }
    });
  const copyLink = () =>
    run(async () => {
      const r = await billingPost(`/invoices/${invoiceId}/share/link`, { expires_in_days: 30 });
      setLink(r.link);
      try {
        await navigator.clipboard.writeText(r.link);
        setMsg({ ok: "Secure link copied. It works for 30 days." });
      } catch {
        setMsg({ ok: "Secure link created (30 days). Copy it below." });
      }
    });
  const shareOther = () =>
    run(async () => {
      const r = await billingPost(`/invoices/${invoiceId}/share/link`, { expires_in_days: 30 });
      setLink(r.link);
      if (navigator.share) {
        await navigator.share({ title: `Invoice ${opt.invoice_number}`, text: `Invoice ${opt.invoice_number} for ${rupees(opt.total)}`, url: r.link });
        await billingPost(`/invoices/${invoiceId}/share/log`, { channel: "OTHER", note: "Shared from the device's share menu" });
        setMsg({ ok: "Shared." });
      } else {
        setMsg({ ok: "This browser cannot open other apps. Copy the secure link below and paste it in any app." });
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
                <button type="button" className={`bl-tile ${tab === "EMAIL" ? "on" : ""}`} onClick={() => setTab("EMAIL")}><span className="ic" style={{ background: "#2563eb" }}><FiMail /></span>Email</button>
                <button type="button" className={`bl-tile ${tab === "WHATSAPP" ? "on" : ""}`} onClick={() => setTab("WHATSAPP")}><span className="ic" style={{ background: "#16a34a" }}><FaWhatsapp /></span>WhatsApp</button>
                <button type="button" className="bl-tile" disabled={busy} onClick={copyLink}><span className="ic" style={{ background: "#64748b" }}><FiCopy /></span>Copy link</button>
                <button type="button" className="bl-tile" disabled={busy} onClick={shareOther}><span className="ic" style={{ background: "#7c3aed" }}><FiMoreHorizontal /></span>More apps</button>
              </div>
            </div>

            {link && (
              <div className="ac-field">
                <label>Secure link (no login needed, expires in 30 days)</label>
                <input className="ac-input" readOnly value={link} onFocus={(e) => e.target.select()} />
              </div>
            )}

            {tab === "EMAIL" && form && (
              <div className="bl-grid g2" style={{ gap: 12 }}>
                <div className="ac-field bl-span2">
                  <label>To <span className="bl-req">*</span></label>
                  <Recipients value={form.to} onChange={(to) => setForm({ to })} placeholder="Type an email and press Enter" />
                  {opt.contacts.filter((c) => c.email && !form.to.includes(c.email)).length > 0 && (
                    <div className="bl-chipbar">
                      {opt.contacts.filter((c) => c.email && !form.to.includes(c.email)).map((c) => (
                        <button key={c.contact_id} type="button" className="bl-chip" onClick={() => setForm({ to: [...form.to, c.email] })}>+ {c.name}</button>
                      ))}
                    </div>
                  )}
                  {!opt.contacts.some((c) => c.email) && <span className="ac-sub" style={{ fontSize: 12 }}>No email saved for this customer's payment contacts.</span>}
                </div>
                <div className="ac-field">
                  <label>CC</label>
                  <Recipients value={form.cc} onChange={(cc) => setForm({ cc })} placeholder="Optional" />
                </div>
                <div className="ac-field">
                  <label>Subject</label>
                  <input className="ac-input" value={form.subject} onChange={(e) => setForm({ subject: e.target.value })} />
                </div>
                <div className="ac-field bl-span2">
                  <label>Message</label>
                  <textarea className="ac-textarea" value={form.message} onChange={(e) => setForm({ message: e.target.value })} />
                </div>
                {opt.print_copies > 1 && <div className="ac-field bl-span2">
                  <label className="bl-toggle" style={{ paddingTop: 0 }}>
                    <input type="checkbox" checked={form.attach === "ALL_COPIES"} onChange={(e) => setForm({ attach: e.target.checked ? "ALL_COPIES" : "ORIGINAL" })} />
                    Attach all {opt.print_copies} copies (otherwise the Original only)
                  </label>
                </div>}
              </div>
            )}

            {tab === "WHATSAPP" && (
              <div className="bl-grid g2" style={{ gap: 12 }}>
                <div className="ac-field">
                  <label>Mobile number <span className="bl-req">*</span></label>
                  <input className="ac-input" inputMode="tel" value={waPhone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit mobile" />
                  <div className="bl-chipbar">
                    {opt.contacts.filter((c) => c.phone).map((c) => (
                      <button key={c.contact_id} type="button" className="bl-chip" onClick={() => setPhone(c.phone)}>{c.name}</button>
                    ))}
                  </div>
                </div>
                <div className="ac-field bl-span2">
                  <label>Message</label>
                  <textarea className="ac-textarea" value={waMessage} onChange={(e) => setWaText(e.target.value)} />
                  <span className="ac-sub" style={{ fontSize: 12 }}>{"{link}"} is replaced with a secure link to the invoice PDF.</span>
                </div>
              </div>
            )}
            <Msg {...msg} />
          </>
        )}
      </div>
      <div className="bl-m-foot">
        <span className="ac-sub" style={{ fontSize: 12 }}>Every share is logged on the invoice (who, when, to whom).</span>
        <div className="ac-actions">
          <button type="button" className="ac-btn" onClick={onClose}>Close</button>
          {tab === "EMAIL" && <button type="button" className="ac-btn ac-btn-primary" disabled={busy || !form?.to.length} onClick={sendEmail}>{busy ? "Sending…" : "Send email"}</button>}
          {tab === "WHATSAPP" && <button type="button" className="ac-btn green" disabled={busy || !waPhone} onClick={sendWhatsapp}>Open WhatsApp</button>}
        </div>
      </div>
    </Modal>
  );
}

// One-click email of an issued invoice.
//   Invoice email saved for the customer (the outlet's for a per-outlet invoice, else the customer's,
//   as for the automatic email): sent straight away from the server, original PDF attached, the
//   standard subject and message.
//   No invoice email saved: Gmail opens in a new browser tab with the subject and message filled in, a
//   secure link to the invoice PDF (a compose link cannot carry an attachment), and the customer's
//   payment contacts in To when there are any.
// Resolves to a message for the screen; throws a readable error.
import { billingGet, billingPost } from "./billingApi";

export async function emailInvoice(id) {
  const opt = await billingGet(`/invoices/${id}/share-options`);
  const to = opt.profile_emails || [];
  if (to.length) {
    const r = await billingPost(`/invoices/${id}/share/email`, { to, attach: "ORIGINAL" });
    const extra = r?.sos_files ? ` with ${r.sos_files} SOS attachment${r.sos_files === 1 ? "" : "s"}` : "";
    return `Invoice ${opt.invoice_number} sent by email${extra} to ${to.join(", ")}.`;
  }

  // The tab is opened right away (still within the click), so the browser does not block it.
  const tab = window.open("", "_blank");
  try {
    const { link } = await billingPost(`/invoices/${id}/share/link`, { expires_in_days: 30 });
    const mail = opt.default_email || {};
    const body = `${mail.message || ""}\n\nView / download the invoice: ${link}`;
    const gmail = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent((mail.to || []).join(","))}&su=${encodeURIComponent(mail.subject || `Invoice ${opt.invoice_number}`)}&body=${encodeURIComponent(body)}`;
    if (tab) tab.location.href = gmail;
    else window.open(gmail, "_blank");
  } catch (err) {
    tab?.close();
    throw err;
  }
  await billingPost(`/invoices/${id}/share/log`, { channel: "OTHER", note: "Opened in Gmail (no invoice email saved for the customer)" }).catch(() => {});
  return "No invoice email is saved for this customer, so Gmail opened in a new tab with the invoice link. Add the email on the contract (Bill To & delivery) to send it directly next time.";
}

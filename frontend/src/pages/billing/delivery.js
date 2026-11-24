// Invoice delivery (print copies, email) form helpers - used by InvoiceDelivery.jsx and New Contract.

/** The form from GET /customer-profiles/:companyId. */
export function deliveryFrom(data) {
  const s = data?.settings || {};
  return {
    print_copies: s.print_copies ?? 1, // 0 = not printed on issue
    invoice_emails: (s.invoice_emails || []).join(", "),
    auto_email: Boolean(s.auto_email),
    outlets: (data?.outlets || []).map((o) => ({ site_id: o.site_id, print_copies: o.print_copies ?? s.print_copies ?? 1, emails: (o.emails || []).join(", ") })),
  };
}

/** The body for PUT /customer-profiles/:companyId/settings. */
export function deliveryBody(form) {
  return {
    print_copies: Number(form.print_copies),
    invoice_emails: form.invoice_emails,
    auto_email: form.auto_email,
    // No "Bill by (late alert)" any more: lateness follows each contract's Bill date.
    // No per-outlet settings any more: every outlet follows the customer's copies and emails (saving
    // clears any outlet setting made earlier).
    outlets: form.outlets.map((o) => ({ site_id: o.site_id, print_copies: Number(form.print_copies), emails: "" })),
  };
}

/** A quick check before saving (the server checks again). Returns a message or "". */
export function deliveryProblem(form) {
  if (form.auto_email && !form.invoice_emails.trim() && !form.outlets.some((o) => o.emails.trim())) {
    return "Add at least one invoice email, or untick \"Email invoices automatically\".";
  }
  return "";
}

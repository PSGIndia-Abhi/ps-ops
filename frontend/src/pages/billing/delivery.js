// Invoice delivery (print copies, email) form helpers - used by InvoiceDelivery.jsx and New Contract.

/** The form from GET /customer-profiles/:companyId. */
export function deliveryFrom(data) {
  const s = data?.settings || {};
  return {
    print_copies: s.print_copies ?? 1, // 0 = not printed on issue
    // Emails: one email per part, each with its own To and CC (always at least one part)
    parts: (s.email_parts || []).length
      ? s.email_parts.map((x) => ({ to: (x.to || []).join(", "), cc: (x.cc || []).join(", ") }))
      : [{ to: "", cc: "" }],
    auto_email: Boolean(s.auto_email),
    bill_by_day: s.bill_by_day || "",
    outlets: (data?.outlets || []).map((o) => ({ site_id: o.site_id, print_copies: o.print_copies ?? s.print_copies ?? 1, emails: (o.emails || []).join(", ") })),
  };
}

/** The body for PUT /customer-profiles/:companyId/settings. */
export function deliveryBody(form) {
  return {
    print_copies: Number(form.print_copies),
    // one email per part (empty parts are dropped by the server)
    email_parts: (form.parts || []).map((x) => ({ to: x.to.trim(), cc: x.cc.trim() })).filter((x) => x.to || x.cc),
    auto_email: form.auto_email,
    bill_by_day: form.bill_by_day ? Number(form.bill_by_day) : null,
    // No per-outlet settings any more: every outlet follows the customer's copies and emails (saving
    // clears any outlet setting made earlier).
    outlets: form.outlets.map((o) => ({ site_id: o.site_id, print_copies: Number(form.print_copies), emails: "" })),
  };
}

/** A quick check before saving (the server checks again). Returns a message or "". */
export function deliveryProblem(form) {
  const parts = form.parts || [];
  const ccOnly = parts.findIndex((x) => !x.to.trim() && x.cc.trim());
  if (ccOnly >= 0) return `Email ${ccOnly + 1}: type the To address (CC alone cannot be sent), or remove it.`;
  if (form.auto_email && !parts.some((x) => x.to.trim()) && !form.outlets.some((o) => o.emails.trim())) {
    return "Add at least one invoice email, or untick \"Email invoices automatically\".";
  }
  return "";
}

// Readable names for audit entries, shared by the Admin "Audit Log" page and the
// "Change History" card on Invoice Details.

export const AUDIT_MODULES = [
  { value: "INVOICE", label: "Invoice" },
  { value: "PAYMENT", label: "Payment" },
  { value: "TDS", label: "TDS" },
  { value: "IMPORT", label: "Import" },
  { value: "CONTACT", label: "Contact" },
  { value: "EXPORT", label: "Export" },
];

export const AUDIT_ACTIONS = {
  INVOICE_CREATED: "Invoice created",
  INVOICE_EDITED: "Invoice edited",
  INVOICE_CANCELLED: "Invoice cancelled",
  INVOICES_IMPORTED: "Invoices imported",
  IMPORT_DELETED: "Upload removed",
  PAYMENT_RECORDED: "Payment recorded",
  PREVIOUS_TDS_RECORDED: "Previous TDS recorded",
  TDS_SETTING_CHANGED: "TDS setting changed",
  TDS_REMOVED: "TDS removed",
  CONTACT_ADDED: "Contact added",
  CONTACT_EDITED: "Contact edited",
  CONTACT_ARCHIVED: "Contact archived",
  CONTACT_RESTORED: "Contact restored",
  CSV_EXPORTED: "CSV exported",
  PDF_EXPORTED: "PDF exported",
};

// Existing badge colours (accountant.css .ac-badge.*) per module.
const MODULE_BADGE = {
  INVOICE: "pending",
  IMPORT: "pending",
  PAYMENT: "paid",
  TDS: "upcoming",
  CONTACT: "partial",
  EXPORT: "void",
};

const FIELD_LABELS = {
  invoice_date: "Invoice date",
  due_date: "Due date",
  invoice_amount: "Invoice amount",
  pending_amount: "Pending amount",
  status: "Status",
  remarks: "Remarks",
  tds_applicable: "TDS",
  tds_rate: "TDS rate",
  name: "Name",
  phone: "Phone",
  email: "Email",
  is_primary: "Primary",
};

const MONEY_FIELDS = new Set(["invoice_amount", "pending_amount"]);

export const actionLabel = (action) => AUDIT_ACTIONS[action] || String(action || "").replace(/_/g, " ").toLowerCase();
export const moduleLabel = (m) => AUDIT_MODULES.find((x) => x.value === m)?.label || m;
export const moduleBadge = (m, action) => (/CANCELLED|REMOVED/.test(action || "") ? "cancelled" : MODULE_BADGE[m] || "void");
export const fieldLabel = (f) => FIELD_LABELS[f] || String(f || "").replace(/_/g, " ");

function showDay(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
}

export function showValue(field, v) {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return field === "tds_applicable" ? (v ? "On" : "Off") : v ? "Yes" : "No";
  if (field === "tds_rate") return `${v}%`;
  if (MONEY_FIELDS.has(field)) return `₹${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  return showDay(v) || String(v);
}

// "11/11/2026 19:42"
export function showWhen(v) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

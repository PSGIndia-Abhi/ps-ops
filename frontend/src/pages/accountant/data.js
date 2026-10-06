import { useCallback, useEffect, useState } from "react";
import { apiFetch, safeJson } from "../../api";

// ---------------------------------------------------------------------------
// Small helpers. The server sends amounts as text ("50000.00") and dates as full
// timestamps, so every value is cleaned up here once.
// ---------------------------------------------------------------------------
export const num = (v) => Number(v) || 0;

const pad = (n) => String(n).padStart(2, "0");

// Any date value -> "YYYY-MM-DD" in the user's own time zone ("" when empty).
export function ymd(v) {
  if (!v) return "";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const todayYmd = () => ymd(new Date());

// "2026-09-01" -> "01/09/2026" for display.
export function showDate(v) {
  const s = ymd(v);
  return s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "";
}

const DAY = 24 * 60 * 60 * 1000;

// Days past the due date (negative = still to come). null when there is no date.
export function daysOverdue(due) {
  const s = ymd(due);
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  const start = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime();
  return Math.round((start - new Date(y, m - 1, d).getTime()) / DAY);
}

export async function getJson(url) {
  const res = await apiFetch(url);
  if (!res) throw new Error("You need to log in again");
  const data = await safeJson(res);
  if (!res.ok) throw new Error(data?.error || "Could not load data from the server");
  return data;
}

// ---------------------------------------------------------------------------
// Turning server rows into what the screens use.
// ---------------------------------------------------------------------------
function cleanInvoice(row) {
  return {
    id: row.id,
    invoice_number: row.invoice_number,
    customer_id: row.customer_id,
    customer_name: row.customer_name,
    customer_code: row.customer_code,
    site_name: row.site_name || "",
    invoice_date: ymd(row.invoice_date),
    due_date: ymd(row.due_date),
    invoice_amount: num(row.invoice_amount),
    paid_amount: num(row.paid_amount),
    pending_amount: num(row.pending_amount),
    status: row.display_status || row.status, // display_status marks late invoices OVERDUE
    last_payment_date: ymd(row.last_payment_date),
    remarks: row.remarks || "",
    file_name: row.invoice_file_name || "",
    // TDS snapshot taken when the invoice was created. Invoice status and TDS status are independent.
    tds_applicable: Boolean(row.tds_applicable),
    tds_rate: row.tds_rate == null ? null : num(row.tds_rate),
    expected_tds: num(row.expected_tds),
    deducted_tds: num(row.deducted_tds),
    pending_tds: num(row.pending_tds),
    tds_status: row.tds_status || "NOT_APPLICABLE",
  };
}

function cleanPayment(row) {
  return {
    id: row.id,
    payment_number: row.payment_number,
    payment_date: ymd(row.payment_date),
    updated_at: ymd(row.updated_at),
    customer_id: row.customer_id,
    customer_name: row.customer_name,
    received_amount: num(row.received_amount),
    tds_amount: num(row.tds_amount),
    allocated_amount: num(row.allocated_amount),
    payment_mode: row.payment_mode,
    reference_number: row.reference_number || "",
    remarks: row.remarks || "",
    status: row.status,
    created_by: row.created_by_name || "",
  };
}

// ---------------------------------------------------------------------------
// Payment follow-ups. They are ordinary Task Management tasks (/api/work-tasks)
// that point at a customer or an invoice through source_module + source_id;
// amounts are never stored on the task, they are always read from the invoices.
// ---------------------------------------------------------------------------
export const FOLLOWUP_TYPE = "Payment Follow-up";
export const FOLLOWUP_MODULE = { CUSTOMER: "PAYMENT_CUSTOMER", INVOICE: "PAYMENT_INVOICE" };
const ACTIVE_STATUSES = ["OPEN", "IN_PROGRESS", "PAUSED"];

// A follow-up's display status: Completed / Cancelled / Overdue / Today / Upcoming.
function followUpDisplayStatus(status, due) {
  if (status === "COMPLETED" || status === "CANCELLED") return status;
  if (!due) return "UPCOMING";
  const d = daysOverdue(due);
  if (d > 0) return "OVERDUE";
  return d === 0 ? "TODAY" : "UPCOMING";
}

// Turns a work task into the follow-up shape the screens use. `invoicesById` and
// `customerNames` come from the invoices already loaded, so names and invoice
// numbers need no extra request.
export function cleanFollowUp(row, invoicesById = new Map(), customerNames = new Map()) {
  const scope = row.source_module === FOLLOWUP_MODULE.INVOICE ? "INVOICE" : "CUSTOMER";
  const invoice = scope === "INVOICE" ? invoicesById.get(row.source_id) : null;
  const customerId = scope === "INVOICE" ? invoice?.customer_id || "" : row.source_id || "";
  const due = ymd(row.due_date);
  return {
    id: row.id,
    scope,
    customer_id: customerId,
    invoice_id: scope === "INVOICE" ? row.source_id || "" : "",
    invoice_number: invoice?.invoice_number || "",
    customer_name: invoice?.customer_name || customerNames.get(customerId) || "",
    site_name: invoice?.site_name || "",
    title: row.title,
    notes: row.description || "",
    priority: row.priority,
    status: row.status,
    active: ACTIVE_STATUSES.includes(row.status),
    display_status: followUpDisplayStatus(row.status, due),
    due_date: due,
    due_time: row.due_time ? String(row.due_time).slice(0, 5) : "",
    created_at: row.created_at || "",
    started_at: row.started_at || "",
    completed_at: row.completed_at || "",
    completion_note: row.completion_note || "",
    assigned_to: row.assigned_to,
    assigned_to_name: row.assigned_to_name || "",
    created_by_name: row.created_by_name || "",
  };
}

const isFollowUpRow = (row) =>
  row.source_module === FOLLOWUP_MODULE.CUSTOMER || row.source_module === FOLLOWUP_MODULE.INVOICE;

// Sorts follow-ups by when they are due (date, then time); undated last.
export const byDue = (a, b) =>
  `${a.due_date || "9999-99-99"} ${a.due_time || "99:99"}`.localeCompare(`${b.due_date || "9999-99-99"} ${b.due_time || "99:99"}`);

// One row per customer with an unpaid balance, worked out from the invoices.
export function groupByCustomer(invoices, payments = []) {
  const map = new Map();
  for (const inv of invoices) {
    if (inv.status === "CANCELLED") continue;
    let c = map.get(inv.customer_id);
    if (!c) {
      c = {
        id: inv.customer_id, name: inv.customer_name, code: inv.customer_code || "", phone: "",
        total_invoiced: 0, total_paid: 0, outstanding: 0, overdue_amount: 0, oldest_due: "",
        unpaid_count: 0, invoice_count: 0, overdue_count: 0, last_payment_date: "", invoices: [],
      };
      map.set(inv.customer_id, c);
    }
    c.invoice_count += 1;
    c.total_invoiced += inv.invoice_amount;
    c.total_paid += inv.paid_amount;
    if (inv.pending_amount > 0) {
      c.outstanding += inv.pending_amount;
      c.unpaid_count += 1;
      c.invoices.push({ id: inv.id, invoice_number: inv.invoice_number, due_date: inv.due_date, pending_amount: inv.pending_amount });
      if (inv.due_date && (!c.oldest_due || inv.due_date < c.oldest_due)) c.oldest_due = inv.due_date;
      if ((daysOverdue(inv.due_date) ?? -1) > 0) {
        c.overdue_amount += inv.pending_amount;
        c.overdue_count += 1;
      }
    }
  }
  for (const p of payments) {
    const c = map.get(p.customer_id);
    if (c && p.status !== "CANCELLED" && p.payment_date > c.last_payment_date) c.last_payment_date = p.payment_date;
  }
  return [...map.values()];
}

// ---------------------------------------------------------------------------
// The hook every accountant screen uses.
// ---------------------------------------------------------------------------
export function useAccountantData() {
  const [state, setState] = useState({ invoices: [], payments: [], followUps: [], loading: true, error: "" });

  const load = useCallback(async () => {
    try {
      const [rawInvoices, rawPayments, rawFollowUps] = await Promise.all([
        getJson("/api/invoices"),
        getJson("/api/payments"),
        getJson(`/api/work-tasks?task_type=${encodeURIComponent(FOLLOWUP_TYPE)}`),
      ]);
      const invoices = rawInvoices.map(cleanInvoice);
      const byId = new Map(invoices.map((i) => [i.id, i]));
      const names = new Map(invoices.map((i) => [i.customer_id, i.customer_name]));
      setState({
        invoices,
        payments: rawPayments.map(cleanPayment),
        followUps: rawFollowUps.filter(isFollowUpRow).map((t) => cleanFollowUp(t, byId, names)),
        loading: false,
        error: "",
      });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err.message || "Could not load data from the server" }));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, reload: load };
}

// ---------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------
export async function send(method, url, body) {
  const res = await apiFetch(url, { method, body: body ? JSON.stringify(body) : undefined });
  if (!res) throw new Error("You need to log in again");
  const data = await safeJson(res);
  if (!res.ok) throw new Error(data?.error || "The server could not save this. Please try again.");
  return data;
}

export const savePayment = (payment) => send("POST", "/api/payments", payment);
export const fetchPayment = (id) => getJson(`/api/payments/${id}`);
export const fetchInvoice = (id) => getJson(`/api/invoices/${id}`);
export const fetchTdsSettings = () => getJson("/api/invoices/tds-settings");
export const saveTdsSettings = (customerId, body) => send("PUT", `/api/invoices/tds-settings/${customerId}`, body);

// Splits a list into pages. Returns { pageRows, page, setPage, pageSize }.
export function usePaged(rows, pageSize = 10) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pages - 1);
  return { pageRows: rows.slice(current * pageSize, (current + 1) * pageSize), page: current, setPage, pageSize };
}

// The open follow-up for each customer and for each invoice (the soonest due when
// there is more than one). Returns { byCustomer: Map, byInvoice: Map }.
export function followUpIndex(followUps) {
  const byCustomer = new Map();
  const byInvoice = new Map();
  for (const f of [...followUps].filter((x) => x.active).sort(byDue)) {
    const map = f.scope === "INVOICE" ? byInvoice : byCustomer;
    const key = f.scope === "INVOICE" ? f.invoice_id : f.customer_id;
    if (key && !map.has(key)) map.set(key, f);
  }
  return { byCustomer, byInvoice };
}

// The follow-up that covers an invoice: its own, otherwise its customer's.
export const followUpForInvoice = (index, invoice) =>
  index.byInvoice.get(invoice.id) || index.byCustomer.get(invoice.customer_id) || null;

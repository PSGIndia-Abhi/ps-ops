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

async function getJson(url) {
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
  };
}

function cleanPayment(row) {
  return {
    id: row.id,
    payment_number: row.payment_number,
    payment_date: ymd(row.payment_date),
    customer_id: row.customer_id,
    customer_name: row.customer_name,
    received_amount: num(row.received_amount),
    allocated_amount: num(row.allocated_amount),
    payment_mode: row.payment_mode,
    reference_number: row.reference_number || "",
    remarks: row.remarks || "",
    status: row.status,
    created_by: row.created_by_name || "",
  };
}

// A task's display status: Completed / Overdue / Today / Upcoming.
function taskDisplayStatus(row) {
  if (row.status === "COMPLETED") return "COMPLETED";
  if (row.status === "CANCELLED") return "CANCELLED";
  const due = ymd(row.due_date);
  if (!due) return "UPCOMING";
  const d = daysOverdue(due);
  if (d > 0) return "OVERDUE";
  return d === 0 ? "TODAY" : "UPCOMING";
}

function cleanTask(row, invoicesById) {
  const invoice = row.reference_type === "INVOICE" ? invoicesById.get(row.reference_id) : null;
  return {
    id: row.id,
    reference_id: row.reference_id,
    title: row.title,
    notes: row.notes || "",
    task_type: row.task_type,
    priority: row.priority,
    status: row.status,
    display_status: taskDisplayStatus(row),
    due_date: ymd(row.due_date),
    due_time: row.due_time ? String(row.due_time).slice(0, 5) : "",
    completed_at: ymd(row.completed_at),
    assigned_to_name: row.assigned_to_name || "",
    invoice_number: invoice?.invoice_number || "",
    customer_id: invoice?.customer_id || "",
    customer_name: invoice?.customer_name || "",
    site_name: invoice?.site_name || "",
  };
}

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
  const [state, setState] = useState({ invoices: [], payments: [], tasks: [], loading: true, error: "" });

  const load = useCallback(async () => {
    try {
      const [rawInvoices, rawPayments, rawTasks] = await Promise.all([
        getJson("/api/invoices"),
        getJson("/api/payments"),
        getJson("/api/tasks"),
      ]);
      const invoices = rawInvoices.map(cleanInvoice);
      const byId = new Map(invoices.map((i) => [i.id, i]));
      setState({
        invoices,
        payments: rawPayments.map(cleanPayment),
        tasks: rawTasks.map((t) => cleanTask(t, byId)),
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
async function send(method, url, body) {
  const res = await apiFetch(url, { method, body: body ? JSON.stringify(body) : undefined });
  if (!res) throw new Error("You need to log in again");
  const data = await safeJson(res);
  if (!res.ok) throw new Error(data?.error || "The server could not save this. Please try again.");
  return data;
}

export const savePayment = (payment) => send("POST", "/api/payments", payment);
export const completeTask = (id) => send("PUT", `/api/tasks/${id}`, { status: "COMPLETED" });
export const fetchPayment = (id) => getJson(`/api/payments/${id}`);
export const fetchInvoice = (id) => getJson(`/api/invoices/${id}`);

// Creates a reminder task on an invoice from the Set Reminder dialog's values.
export function createReminder(form, invoice) {
  return send("POST", "/api/tasks", {
    reference_type: "INVOICE",
    reference_id: invoice.id,
    task_type: form.task_type,
    title: `${form.task_type} - ${invoice.invoice_number}`,
    notes: form.notes || null,
    priority: String(form.priority || "Normal").toUpperCase(),
    due_date: form.date || null,
    due_time: form.time ? `${form.time}:00` : null,
  });
}

// Splits a list into pages. Returns { pageRows, page, setPage, pageSize }.
export function usePaged(rows, pageSize = 10) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pages - 1);
  return { pageRows: rows.slice(current * pageSize, (current + 1) * pageSize), page: current, setPage, pageSize };
}

// For each invoice: the date of its next open reminder, and its last completed action.
// Returns a Map: invoiceId -> { next_follow_up, last_action }.
export function followUpsByInvoice(tasks) {
  const map = new Map();
  for (const t of tasks) {
    if (!t.reference_id) continue;
    const entry = map.get(t.reference_id) || { next_follow_up: "", last_action: "", lastDone: "" };
    if (t.status === "OPEN" && t.due_date && (!entry.next_follow_up || t.due_date < entry.next_follow_up)) {
      entry.next_follow_up = t.due_date;
    }
    if (t.status === "COMPLETED" && (t.completed_at || "") >= entry.lastDone) {
      entry.lastDone = t.completed_at || "";
      entry.last_action = t.task_type;
    }
    map.set(t.reference_id, entry);
  }
  return map;
}

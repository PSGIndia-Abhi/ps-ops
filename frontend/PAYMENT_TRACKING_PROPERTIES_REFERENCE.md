# Payment Tracking Object Properties Reference

This document lists all available properties on the `invoice`, `payment`, and `task` objects returned by the Payment Tracking API (`/api/invoices`, `/api/payments`, `/api/tasks`), used throughout the frontend (`InvoicesPage.jsx`, `PaymentsPage.jsx`, `TasksPage.jsx`).

## Invoice

### Core Info
| Property | Type | Example | Notes |
|----------|------|---------|-------|
| `invoice.id` | string (uuid) | `"92379b78-..."` | Unique invoice identifier |
| `invoice.invoice_number` | string | `"INV-2026-001"` | Unique per customer (`customer_id` + `invoice_number`) |
| `invoice.customer_id` | string (uuid) | `"4c778c74-..."` | References `companies.id` |
| `invoice.customer_name` | string | `"Acme Corp"` | Joined from `companies.name` |
| `invoice.customer_code` | string | `"ACME-001"` | Joined from `companies.code` |
| `invoice.site_id` | string (uuid) or `null` | `"0778fcb3-..."` | References `sites.id`; nullable |
| `invoice.site_name` | string or `null` | `"Tower A"` | Joined from `sites.name` |
| `invoice.remarks` | string or `null` | `"Q1 service charges"` | Free text |

### Status & Amounts
| Property | Type | Example | Notes |
|----------|------|---------|-------|
| `invoice.status` | string | `"PARTIAL"` | Stored value: `PENDING`, `PARTIAL`, `PAID`, `CANCELLED` |
| `invoice.display_status` | string | `"OVERDUE"` | Computed at read time only: `status`, or `OVERDUE` if `due_date` has passed and status isn't `PAID`/`CANCELLED`. Not stored in the DB. |
| `invoice.invoice_amount` | decimal string | `"1000.00"` | Total invoice amount |
| `invoice.paid_amount` | decimal string | `"400.00"` | Sum of all payment allocations so far |
| `invoice.pending_amount` | decimal string | `"600.00"` | `invoice_amount - paid_amount`, kept in sync server-side |

### Dates
| Property | Type | Example | Notes |
|----------|------|---------|-------|
| `invoice.invoice_date` | date | `"2026-09-18"` | Invoice issue date |
| `invoice.due_date` | date or `null` | `"2026-09-25"` | Used to compute `display_status` |
| `invoice.created_at` / `updated_at` | datetime | `"2026-09-18T16:40:35Z"` | |

### Audit
| Property | Type | Example | Notes |
|----------|------|---------|-------|
| `invoice.created_by` / `invoice.updated_by` | number or `null` | `1` | References `users.id` |

### Relationships — Allocations (detail endpoint only)
| Property | Type | Example | Notes |
|----------|------|---------|-------|
| `invoice.allocations` | array | `[{...}]` | Only present on `GET /api/invoices/:id`, not on the list endpoint |
| `invoice.allocations[0].allocated_amount` | decimal string | `"400.00"` | Amount from this payment applied to this invoice |
| `invoice.allocations[0].payment_number` | string | `"PAY-1758..."` | |
| `invoice.allocations[0].payment_date` | date | `"2026-09-18"` | |
| `invoice.allocations[0].payment_mode` | string | `"UPI"` | |

---

## Payment

### Core Info
| Property | Type | Example | Notes |
|----------|------|---------|-------|
| `payment.id` | string (uuid) | `"..."` | Unique payment identifier |
| `payment.payment_number` | string | `"PAY-1758..."` | Auto-generated, unique |
| `payment.customer_id` | string (uuid) | `"4c778c74-..."` | References `companies.id` |
| `payment.customer_name` / `customer_code` | string | `"Acme Corp"` / `"ACME-001"` | Joined from `companies` |
| `payment.payment_mode` | string | `"UPI"` | One of `CASH`, `UPI`, `BANK_TRANSFER`, `NEFT`, `CHEQUE`, `CARD`, `OTHER` |
| `payment.reference_number` | string or `null` | `"UTR123456"` | Bank/UPI reference, free text |
| `payment.remarks` | string or `null` | `"Partial settlement"` | |
| `payment.status` | string | `"POSTED"` | `POSTED` or `CANCELLED` — no cancel endpoint exists yet (see Notes) |

### Amounts & Dates
| Property | Type | Example | Notes |
|----------|------|---------|-------|
| `payment.received_amount` | decimal string | `"400.00"` | Total amount received; may exceed what's allocated to invoices |
| `payment.payment_date` | date | `"2026-09-18"` | |
| `payment.created_at` / `updated_at` | datetime | | |

### Relationships — Allocations (detail endpoint only)
| Property | Type | Example | Notes |
|----------|------|---------|-------|
| `payment.allocations` | array | `[{...}]` | Only present on `GET /api/payments/:id` |
| `payment.allocations[0].allocated_amount` | decimal string | `"400.00"` | |
| `payment.allocations[0].invoice_number` | string | `"INV-2026-001"` | Joined from `invoices` |

---

## Task

### Core Info
| Property | Type | Example | Notes |
|----------|------|---------|-------|
| `task.id` | string (uuid) | `"..."` | |
| `task.reference_type` | string | `"INVOICE"` | `INVOICE` or `JOB_CARD` (`JOB_CARD` is reserved for future use — no creation path exists yet) |
| `task.reference_id` | string (uuid) | `"92379b78-..."` | The invoice (or future job card) this task is about |
| `task.task_type` | string | `"FOLLOW_UP"` | Free text, not an enum — set by the caller |
| `task.title` | string | `"Follow up on INV-2026-001"` | |
| `task.notes` | string or `null` | | |
| `task.priority` | string | `"HIGH"` | `LOW`, `NORMAL`, `HIGH` |
| `task.status` | string | `"OPEN"` | `OPEN`, `COMPLETED`, `CANCELLED` |

### Assignment & Dates
| Property | Type | Example | Notes |
|----------|------|---------|-------|
| `task.assigned_to` | number or `null` | `1` | References `users.id` |
| `task.assigned_to_name` | string or `null` | `"Admin Main"` | Joined from `users.name` |
| `task.created_by` / `created_by_name` | number / string | `1` / `"Admin Main"` | |
| `task.due_date` | date or `null` | `"2026-09-18"` | |
| `task.due_time` | time or `null` | `"14:00:00"` | |
| `task.completed_at` | datetime or `null` | | Set automatically when `status` is updated to `COMPLETED`; cleared if reopened |

### Relationships — Reminders (detail endpoint only)
| Property | Type | Example | Notes |
|----------|------|---------|-------|
| `task.reminders` | array | `[]` | Only present on `GET /api/tasks/:id`. Always empty today — `task_reminders` rows exist in the schema but no endpoint creates them yet. |

---

## Common Usage Patterns

### Check if an invoice is overdue
```javascript
const isOverdue = invoice.display_status === "OVERDUE";
```

### Check if an invoice can still be edited or cancelled
```javascript
const canEdit = invoice.status !== "CANCELLED";
const canCancel = invoice.status !== "CANCELLED" && Number(invoice.paid_amount) === 0;
```

### Compute allocation total before submitting a payment
```javascript
const allocatedTotal = allocations.reduce((sum, a) => sum + Number(a.allocated_amount || 0), 0);
const isValid = allocatedTotal <= Number(form.received_amount);
```

### Check if a task is still actionable
```javascript
const isActionable = task.status === "OPEN";
```

---

## Notes

- **From list endpoints** (`GET /api/invoices`, `GET /api/payments`, `GET /api/tasks`): do **not** include `allocations`/`reminders` — fetch the detail endpoint (`GET /:id`) for those.
- **Role scoping** happens server-side before the response is built: `admin` sees everything; `branch_admin`/`supervisor` see records tied to their branch (via `site.branch_id` for invoices, via `EXISTS` on `sites` for payments); `client` sees only their own company's invoices/payments; non-admin task viewers see only tasks they created or are assigned to. The frontend does not need to re-filter these lists.
- **Money fields** (`invoice_amount`, `paid_amount`, `pending_amount`, `received_amount`, `allocated_amount`) come back as decimal strings from MySQL — always wrap with `Number(...)` before arithmetic or comparison, as done in `InvoicesPage.jsx`/`PaymentsPage.jsx`.
- **`display_status: "OVERDUE"`** is computed on every read from `due_date` vs. today's date — it is never written to the `status` column, so filtering/searching by literal `status` will not find overdue invoices; use `display_status`.
- **Not yet implemented**: bulk Excel invoice import (`invoice_imports`/`invoice_import_rows` tables exist but have no API), task reminders (creation/notification), and payment cancellation.

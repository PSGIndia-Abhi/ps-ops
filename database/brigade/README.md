# Brigade Executive module — database scripts

SQL scripts for the Brigade Executive module (web panel `/brigade`, API
`/api/brigade/*`). Run them **in order** on the `ps_ops` MySQL database of
every environment (local, staging, production) **before** deploying the
matching backend.

| # | File | What it adds |
|---|------|--------------|
| 1 | `01_brigade_masters.sql` | "Brigade Group" group, role `brigade_executive` and its permissions (`BRIGADE_ACCESS`, `BRIGADE_MANAGE_MASTERS` + existing contact / booking / job / visit permissions), and tables `brigade_bhk_types` (seeded 1–5 BHK, Villa), `brigade_flats`, `brigade_prices`, `brigade_booking_details` |
| 2 | `02_brigade_billing.sql` | Billing: `brigade_pos` (one row per client PO) and `brigade_po_lines` (service/job → PO with billed amount) |
| 3 | `03_brigade_flat_requests.sql` | Two-step booking: `brigade_flat_requests` (flat saved to Pending before services, dates and team are added) |
| 4 | `04_brigade_po_files.sql` | Files attached to a client PO: `brigade_po_files` (one row per file, kept by PO number; the file itself is in MinIO). Shared by the booking form and Billing |
| 5 | `05_brigade_invoices.sql` | Tax invoices from a PO (Billing → PO → Generate invoice): `brigade_invoice_sequences` (BSPMPL26-27/5000 numbering per financial year), `brigade_invoices` (one per invoice, with what was printed) and `brigade_invoice_lines` (a service is invoiced once) |

## Notes

- **Additive only.** The scripts only create new tables, the new group, role
  and permissions. No existing table, column or row is changed.
- **Safe to re-run.** Every statement uses `IF NOT EXISTS` / `NOT EXISTS`, so
  running a file twice does nothing the second time.
- **Order matters.** `02` and `03` rely on tables created by `01`
  (`brigade_po_lines` references `jobs`; the backend joins the new tables to
  `brigade_booking_details`).
- If `02` or `03` has not been run, the Billing / Pending screens show
  "not set up yet — run database/brigade/…" instead of failing.

## How to run

```bash
mysql -u <user> -p ps_ops < database/brigade/01_brigade_masters.sql
mysql -u <user> -p ps_ops < database/brigade/02_brigade_billing.sql
mysql -u <user> -p ps_ops < database/brigade/03_brigade_flat_requests.sql
```

Local Docker (`ps-mysql` container):

```bash
docker exec -i ps-mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" ps_ops' < database/brigade/01_brigade_masters.sql
```

(or paste each file into phpMyAdmin → `ps_ops` → SQL, in the same order).

## Check after running

```sql
SELECT name FROM group_name WHERE name = 'Brigade Group';
SELECT COUNT(*) FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
 WHERE r.name = 'brigade_executive';            -- 18
SHOW TABLES LIKE 'brigade%';                    -- 7 tables
```

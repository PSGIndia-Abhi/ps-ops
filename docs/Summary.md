# Analysis Tab — Implementation Summary

A full account of the "Analysis" tab feature built across four rounds: what
was added, which files changed, how the database is shaped and used, every
API endpoint, and every SQL query behind it. Detailed query-by-query
breakdowns already exist in [SQL.md](SQL.md) / [SQL2.md](SQL2.md) /
[SQL3.md](SQL3.md) / [SQL4.md](SQL4.md) — this document ties all four
together with the reasoning and the database model behind them.

---

## 1. What was built

A new **Analysis** tab in the Admin panel (`/admin/analysis`), showing five
rows of widgets, all reading live from MySQL — nothing mocked:

| Row | Widgets | Endpoint |
|-----|---------|----------|
| 1 | Scheduled · Completed · Pending · Overdue · Completion % · On-time % (KPI tiles) | `GET /api/dashboard/top-tiles` |
| 2 | Today's Service Pipeline · Today's Service Status (donut) · Customer Pending Services · Customers At Risk | `GET /api/dashboard/service-overview` |
| 3 | Employee Performance (Today) · On-Time Completion Trend · Employee Workload (Today) · Upcoming Services | `GET /api/dashboard/team-overview` |
| 4 | Overdue Services - Action Required · Monthly Service Summary | `GET /api/dashboard/overdue-overview` |

Each row was built, then **verified against the real database** before
being wired to the UI — see [§5](#5-how-everything-was-verified).

---

## 2. Files changed

### Backend

| File | What changed |
|------|---------------|
| [backend/src/routes/dashboard.routes.js](../backend/src/routes/dashboard.routes.js) | Added `buildJobScope(req)` (shared role/branch scope helper) and four new `GET` routes: `/top-tiles`, `/service-overview`, `/team-overview`, `/overdue-overview`. Pre-existing `/summary` route left untouched. |
| [backend/index.js](../backend/index.js) | Removed the wiring for a draft/scratch dashboard router that predated this work (`dashboard-draft/top-tiles.routes.js`) — its logic was folded into the real `/top-tiles` endpoint above. |
| `backend/src/dashboard-draft/` | Deleted (it was untracked scratch code, fully superseded). |

### Frontend

| File | What changed |
|------|---------------|
| [frontend/src/pages/AdminAnalysis.jsx](../frontend/src/pages/AdminAnalysis.jsx) | New page — the entire Analysis tab UI: 6 KPI tiles, funnel, donut (inline SVG, no chart library), 2 data tables, a workload bar chart, a line chart (inline SVG), an upcoming-services list, and an overdue action table wired to the existing job detail page. |
| [frontend/src/pages/AdminAnalysis.css](../frontend/src/pages/AdminAnalysis.css) | New stylesheet for all of the above, including the equal-size widget grid. |
| [frontend/src/router.jsx](../frontend/src/router.jsx) | Added the `/admin/analysis` route. |
| [frontend/src/layouts/AdminLayout.jsx](../frontend/src/layouts/AdminLayout.jsx) | Added an "Analysis" nav button (desktop sidebar + mobile menu). |

### Docs

`docs/SQL.md`, `SQL2.md`, `SQL3.md`, `SQL4.md` (one per round) + this file.

### Not touched by this work

`backend/package.json`, `backend/prisma/schema.prisma`, `docs/core-workflows.md`
(deleted), and the duplicated "Show Contacts" button in
`frontend/src/pages/AdminCompanies.jsx` were already modified/deleted in
your working tree before this feature started — none of that is part of
this change set.

---

## 3. Database model — tables actually used here

The Analysis tab reads five tables: `jobs`, `sites`, `companies`, `users`,
`roles`. Below is what each one is for and, importantly, **which
relationships are real database-enforced foreign keys vs. which are only
"logical" (application-level) relationships** — this distinction directly
shaped how several queries had to be written.

### `jobs` — the core work-order record

- **Primary key:** `id` (`CHAR(36)`, UUID)
- **DB-enforced foreign keys:**
  - `branch_id → branches.id`
  - `company_id → sites.id` *(see note below — misleadingly named)*
  - `location_id → locations.id`
- **Logical-only references (no DB constraint, no `@relation` in the Prisma schema):**
  - `supervisor_id → users.id` — the assigned supervisor
  - `booking_id → bookings.id` — the parent booking, if recurring
  - `requested_by_contact_id → contacts.id`
  - `created_by_user_id → users.id`
  - `team` (a **JSON array** of technician ids, e.g. `[128]`) — **not a join table**, just a JSON column referencing `users.id` values with no referential integrity enforced by MySQL at all

> **Naming trap:** `jobs.company_id` does **not** point at `companies.id`
> directly — it points at `sites.id` (a site is a company's physical
> location). The real customer organization is one hop further:
> `jobs.company_id → sites.id → sites.company_id → companies.id`. Every
> "Customer"-column query in this feature (Customer Pending Services,
> Customers At Risk, Overdue Services) uses this exact two-hop join.

> **`team` is JSON, not a relation.** Because there's no join table for
> "which technicians are on this job," per-technician aggregation (Employee
> Performance / Workload / the Employee column in Overdue Services) had to
> use `JSON_CONTAINS(j.team, ...)` instead of a normal `JOIN`. Historical
> rows store the ids inconsistently — some as JSON numbers (`[128]`), some
> as JSON strings (`["128"]`) — so every query matches **both** forms:
> `JSON_CONTAINS(j.team, CAST(u.id AS JSON)) OR JSON_CONTAINS(j.team,
> JSON_QUOTE(CAST(u.id AS CHAR)))`. This mirrors a pattern that already
> existed in `jobs.routes.js` for job-access checks — it wasn't invented
> for this feature, just reused for consistency.

### `sites` — a company's physical location

- **Primary key:** `id`
- **Foreign keys:** `company_id → companies.id` (the *correctly* named one), `branch_id → branches.id`, `location_id → locations.id`
- **Purpose:** the "site" a job is performed at. This is the table
  `jobs.company_id` actually points to (see above).

### `companies` — the real customer organization

- **Primary key:** `id`
- **Foreign key:** `group_id → group_name.id`
- **Purpose:** this is what every widget's "Customer" column actually
  means — a corporate client, reached via `sites`. Residential jobs (no
  `company_id`) have no company and are naturally excluded from every
  customer-grouped widget (Customer Pending Services, Customers At Risk,
  Overdue Services) because those queries use an `INNER JOIN`.

### `users` — every system login (staff and technicians)

- **Primary key:** `id` (`BIGINT`)
- **Foreign keys:** `branch_id → branches.id`, `role_id → roles.id` (required, not nullable)
- **Purpose:** admins, branch admins, supervisors, technicians, and client
  logins all live in this one table, distinguished by role. "Employee" in
  this feature = a user whose role is `technician`.

> **Two ways to store a role:** `users` has both a normalized `role_id →
> roles.id` *and* a legacy free-text `role` VARCHAR column, and they're
> not always kept in sync. Every technician-lookup query here checks
> **both** (`LOWER(r.name) = 'technician' OR LOWER(u.role) = 'technician'`)
> — again, an existing pattern (already used by `/api/shifts/technicians`)
> reused rather than reinvented.

### `roles` — the role catalog

- **Primary key:** `id`
- **Purpose:** `admin`, `branch_admin`, `supervisor`, `technician`,
  `client`, `temporary_worker`. Referenced by `users.role_id`; used here
  only to identify technicians.

---

## 4. API endpoints

All four require `Authorization: Bearer <JWT>` (`auth` middleware) and the
`VIEW_ANALYTICS` permission (`requirePermission`, with an unconditional
bypass for `role = admin`). All four share one scoping rule, built once
per request by `buildJobScope(req)`:

- **admin** — sees every non-archived job, no restriction
- **supervisor** — only jobs where `supervisor_id = req.user.id`
- **technician** — only jobs where `team` contains `req.user.id`
- **everyone except admin** — additionally restricted to their own
  `branch_id` (looked up from `users`); if they have none, the whole
  request is rejected with `403 Branch not assigned`

`buildJobScope` returns both a ready `WHERE ...` clause (`where`) for
simple queries and the bare AND-fragments (`extra`) for queries that need
the scope embedded somewhere other than a plain `WHERE` — e.g. inside a
`JOIN ... ON (...)` clause, which the Employee Performance query needs
because it's a `LEFT JOIN` starting from `users`, not `jobs`.

### `GET /api/dashboard/top-tiles`

Returns the 6 KPI numbers: `scheduled`, `completed`, `pending`, `overdue`,
`completionPct`, `onTimePct`. One aggregate query over `jobs`. Full
breakdown: [SQL.md](SQL.md).

### `GET /api/dashboard/service-overview`

Returns `pipeline`, `statusBreakdown`, `customerPendingServices`,
`customersAtRisk`. Three queries: one combined pipeline+status aggregate
over `jobs`, one grouped-by-company query (`jobs→sites→companies`) for
pending services, one grouped-by-company query with an OR of three risk
thresholds for at-risk customers. Full breakdown: [SQL2.md](SQL2.md).

### `GET /api/dashboard/team-overview`

Returns `employeePerformance`, `onTimeTrend`, `upcomingServices`. One
`LEFT JOIN users → jobs` query (via `JSON_CONTAINS`) for per-technician
stats, one monthly-grouped query for the 6-month trend, one daily-grouped
query for the next 5 days — the last two are zero-filled in Node so empty
periods still render instead of leaving gaps. Full breakdown:
[SQL3.md](SQL3.md).

### `GET /api/dashboard/overdue-overview`

Returns `overdueServices`, `monthlySummary`. One `jobs→sites→companies`
query for the top 5 most-overdue jobs (with a follow-up batch query to
`users` to resolve technician/supervisor names for the "Employee" column,
since `team` isn't a joinable relation), plus the same 6-month grouped
query pattern as the trend chart, but with more columns
(scheduled/completed/pending/overdue/completion%/on-time%). Full
breakdown: [SQL4.md](SQL4.md).

---

## 5. How everything was verified

Every query in every round was checked against the **real** database
before being trusted, not just written and assumed correct:

1. Ran the raw SQL directly against the live MySQL instance (published on
   `localhost:3306` from the `ps-mysql` Docker container) and hand-checked
   the results against the actual `jobs`/`sites`/`companies`/`users` rows.
2. Discovered the backend runs in a Docker container (`ps-backend`) built
   from a static image with **no bind mount** (`COPY . .` in the
   Dockerfile) — so source edits don't take effect until the image is
   rebuilt. This caused a real "Failed to load analysis data" error after
   round 1, fixed by `docker compose build backend && docker compose up -d
   backend`, and repeated after every subsequent round that touched the
   backend.
3. After each rebuild, signed a real JWT for an actual admin user from the
   database and called the live endpoint over HTTP end-to-end, confirming
   the JSON response matched the raw SQL results exactly.

Because the current dataset is small (8 jobs total, 1 technician, 0
completed jobs, 4 real customer companies), several widgets legitimately
show mostly zeros right now (On-Time Trend, Monthly Summary completion
figures) — that's correct behavior given the data, not a bug.

---

## 6. Known caveats worth knowing about

- **`jobs.team` has no referential integrity.** Nothing stops a job's
  `team` array from containing a deleted or non-existent user id; the
  queries here simply won't match a row for that id (it's silently
  dropped from name resolution, not an error).
- **Several "foreign keys" on `jobs` aren't enforced by the database**
  (`supervisor_id`, `booking_id`, `requested_by_contact_id`,
  `created_by_user_id`) — they're conventions the application code relies
  on, not constraints MySQL will reject a bad value for.
- **The `/summary` endpoint (pre-existing, not part of this feature)**
  still computes its "overdue" figure from `due_date`, which is set once
  at booking creation to the *end* of the whole recurrence window, not a
  per-day due date — a pre-existing bug, deliberately left alone since it
  was out of scope for this work (documented in `SQL.md`).
- **"View All" / "View Full Report" / "View Calendar" links are static
  placeholders** — no drill-down pages exist yet. The one exception is the
  Overdue Services table's eye icon, which does navigate to the real job
  detail page (`/admin/jobs/:jobId`).

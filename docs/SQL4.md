# Analysis Tab — SQL Reference (Part 4)

Covers the two widgets added below the team/trend/upcoming row:
**Overdue Services - Action Required · Monthly Service Summary**

- Endpoint: `GET /api/dashboard/overdue-overview`
- Route file: [backend/src/routes/dashboard.routes.js](../backend/src/routes/dashboard.routes.js)
- Frontend page: [frontend/src/pages/AdminAnalysis.jsx](../frontend/src/pages/AdminAnalysis.jsx)
- Tables read: `jobs`, `sites`, `companies`, `users`
- Parts 1–3: [SQL.md](SQL.md), [SQL2.md](SQL2.md), [SQL3.md](SQL3.md)

Same role/branch scope (`buildJobScope`) as every other widget on this
tab — `extra` is the raw AND-fragment form described in SQL3.md.

---

## 1. Overdue Services - Action Required

Top 5 overdue jobs, oldest due date first — one row per **job**, not per
customer (unlike Customer Pending Services in Part 2, which grouped by
company):

```sql
SELECT
  j.id AS job_id,
  co.name AS company_name,
  s.name  AS site_name,
  j.sub_service,
  j.supervisor_id,
  j.team,
  j.start_date AS due_date,
  DATEDIFF(CURDATE(), j.start_date) AS days_late
FROM jobs j
JOIN sites s      ON j.company_id = s.id
JOIN companies co ON s.company_id = co.id
WHERE COALESCE(j.is_archived, 0) = 0
  AND j.status NOT IN ('COMPLETED','CANCELED')
  AND j.start_date < CURDATE()
  {extra}
ORDER BY j.start_date ASC
LIMIT 5
```

> Same two-hop `jobs.company_id → sites.id → sites.company_id →
> companies.id` join as Part 2, so this list is naturally limited to jobs
> tied to a company (residential jobs with no `company_id` don't have a
> "Customer" to show and are excluded).

**Employee** column: `jobs.team` is a JSON array of technician ids, not a
join table, so names are resolved the same way `jobs.routes.js` already
does it — batch-fetch every id referenced across the returned rows in one
extra query, then map in Node:

```sql
SELECT id, name FROM users WHERE id IN (?, ?, ...)
```

```js
employee = technicianNames.join(", ")
        || supervisorName
        || "Unassigned";
```

**Days Late** = `DATEDIFF(CURDATE(), start_date)`, computed in SQL.

**Action** (the eye icon) navigates to the job's existing detail page —
`/admin/jobs/:jobId` — reusing the route that already exists in the app
rather than being a dead placeholder.

---

## 2. Monthly Service Summary (last 6 months)

Grouped by the month of `start_date`, same 6-month window as the On-Time
Completion Trend chart in Part 3 (so the two widgets describe the same
period):

```sql
SELECT
  DATE_FORMAT(j.start_date, '%Y-%m') AS month_key,
  COUNT(*) AS scheduled,
  SUM(j.status = 'COMPLETED')                                    AS completed,
  SUM(j.status IN ('CREATED','NOT_STARTED'))                      AS pending,
  SUM(j.start_date < CURDATE()
      AND j.status NOT IN ('COMPLETED','CANCELED'))               AS overdue,
  SUM(j.status = 'COMPLETED'
      AND j.completed_at IS NOT NULL
      AND DATE(j.completed_at) <= DATE(j.start_date))              AS on_time
FROM jobs j
WHERE COALESCE(j.is_archived, 0) = 0
  AND j.start_date >= ?          -- first day of (current month - 5)
  {extra}
GROUP BY month_key
```

| Column        | Field        | Definition                                                        |
|----------------|-------------|---------------------------------------------------------------------|
| Scheduled      | `scheduled`  | Jobs whose `start_date` falls in that month, any status             |
| Completed      | `completed`  | ...and currently `status = COMPLETED`                                |
| Pending        | `pending`    | ...and currently `status IN (CREATED, NOT_STARTED)`                  |
| Overdue        | `overdue`    | ...past `start_date` and not done (only non-zero for months already fully in the past) |
| Completion %   | derived      | `completed / scheduled`                                              |
| On-Time %      | derived      | `on_time / completed` (0 when nothing completed that month)          |

Note these are **current-status snapshots** of each month's jobs, not a
historical record of what status they were in at the time — e.g. a job
scheduled in June that got completed in August still counts under June's
"Completed", and "Pending"/"Overdue" reflect where that job sits *today*,
not back then. This matches how every other widget on this tab treats
`start_date` vs. current `status`.

The 6 month buckets are generated in Node exactly like the trend chart in
Part 3, so a month with zero jobs shows `0`s across the row instead of
being omitted.

## Response shape

```json
{
  "overdueServices": [
    {
      "jobId": "…",
      "companyName": "ABC Hotels",
      "siteName": "Whitefield",
      "service": "Pest Control",
      "dueDate": "2026-09-01T00:00:00.000Z",
      "employee": "Suresh Babu",
      "daysLate": 2
    }
  ],
  "monthlySummary": [
    {
      "month": "2026-06",
      "label": "Jun 2026",
      "scheduled": 2100,
      "completed": 1980,
      "pending": 120,
      "overdue": 45,
      "completionPct": 94.3,
      "onTimePct": 91.0
    }
  ]
}
```

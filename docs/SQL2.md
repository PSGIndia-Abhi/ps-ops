# Analysis Tab — SQL Reference (Part 2)

Covers the four widgets added below the top KPI tiles:
**Today's Service Pipeline · Today's Service Status · Customer Pending
Services · Customers At Risk**

- Endpoint: `GET /api/dashboard/service-overview`
- Route file: [backend/src/routes/dashboard.routes.js](../backend/src/routes/dashboard.routes.js)
- Frontend page: [frontend/src/pages/AdminAnalysis.jsx](../frontend/src/pages/AdminAnalysis.jsx)
- Tables read: `jobs`, `sites`, `companies`
- For the top-tile queries (Scheduled/Completed/Pending/Overdue/Completion %/On-time %), see [SQL.md](SQL.md)

All numbers are computed live from MySQL on every request and use the same
role/branch scoping as the top tiles (factored into a shared
`buildJobScope(req)` helper, used by both `/top-tiles` and
`/service-overview`):

```sql
-- base filter, always applied
WHERE 1=1 AND COALESCE(j.is_archived, 0) = 0

-- + if role = 'supervisor'
AND j.supervisor_id = ?              -- req.user.id

-- + if role = 'technician'
AND JSON_CONTAINS(j.team, JSON_QUOTE(?))   -- String(req.user.id)

-- + if role != 'admin'
AND j.branch_id = ?                  -- caller's own branch_id
```

`admin` sees every non-archived job across all branches; everyone else is
scoped to their own branch (and further to their own jobs, for
supervisors/technicians).

---

## 1. Today's Service Pipeline + Today's Service Status

One query produces both widgets, since they're both slices of "today's
scheduled jobs" (`DATE(j.start_date) = CURDATE()`):

```sql
SELECT
  SUM(DATE(j.start_date) = CURDATE()) AS scheduled_today,

  SUM(DATE(j.start_date) = CURDATE()
      AND j.supervisor_id IS NOT NULL)               AS assigned_today,

  SUM(DATE(j.start_date) = CURDATE()
      AND j.status IN ('IN_PROGRESS','PAUSED','COMPLETED')) AS in_progress_or_beyond_today,

  SUM(DATE(j.start_date) = CURDATE()
      AND j.status = 'COMPLETED')                    AS completed_today,

  SUM(DATE(j.start_date) = CURDATE()
      AND j.status IN ('CREATED','NOT_STARTED'))       AS pending_today,

  SUM(j.start_date < CURDATE()
      AND j.status NOT IN ('COMPLETED','CANCELED'))    AS overdue_all_time,

  -- status donut buckets (mutually exclusive, always sum to scheduled_today)
  SUM(DATE(j.start_date) = CURDATE()
      AND j.status IN ('IN_PROGRESS','PAUSED'))        AS status_in_progress,

  SUM(DATE(j.start_date) = CURDATE()
      AND j.status IN ('CREATED','NOT_STARTED')
      AND j.start_date >= NOW())                       AS status_pending,

  SUM(DATE(j.start_date) = CURDATE()
      AND j.status IN ('CREATED','NOT_STARTED')
      AND j.start_date < NOW())                        AS status_overdue_today,

  SUM(DATE(j.start_date) = CURDATE()
      AND j.status = 'CANCELED')                       AS status_cancelled

FROM jobs j
WHERE 1=1 AND COALESCE(j.is_archived, 0) = 0
  -- (+ role/branch scoping)
```

### Today's Service Pipeline (funnel)

| Stage         | Field                          | Definition                                                             |
|---------------|----------------------------------|--------------------------------------------------------------------------|
| Scheduled     | `scheduled_today`               | Today's jobs, any status                                                 |
| Assigned      | `assigned_today`                | Today's jobs that already have a supervisor assigned                     |
| In Progress   | `in_progress_or_beyond_today`   | Today's jobs that have started or finished (`IN_PROGRESS`/`PAUSED`/`COMPLETED`) |
| Completed     | `completed_today`               | Today's jobs marked `COMPLETED`                                          |
| Pending       | `pending_today`                 | Today's jobs still `CREATED`/`NOT_STARTED` — same value as the top tile  |
| Overdue       | `overdue_all_time`              | **All-time** overdue (not just today) — same value as the top tile       |

The first four numbers are intentionally cumulative (each stage is a subset
of the one before it) so they read as a funnel. Pending/Overdue are shown
as flags underneath, not extra funnel steps — they reuse the exact same
figures as the top tiles for consistency.

### Today's Service Status (donut)

Unlike the "Overdue" **tile** (which spans all dates), the donut's
"Overdue" slice is scoped to **today only**: a today-scheduled job still
`CREATED`/`NOT_STARTED` whose `start_date` (date **and** time) has already
passed. This keeps the five slices mutually exclusive and reconciling
exactly to `scheduled_today` — unlike a plain reuse of the all-time Overdue
number, which would double-count against Pending and not sum to the total.

| Slice        | Field                    | % of total                          |
|--------------|--------------------------|--------------------------------------|
| Completed    | `completed_today`        | `completed_today / scheduled_today`  |
| In Progress  | `status_in_progress`     | jobs currently `IN_PROGRESS`/`PAUSED`|
| Pending      | `status_pending`         | not started, still before due time   |
| Overdue      | `status_overdue_today`   | not started, due time already passed (today only) |
| Cancelled    | `status_cancelled`       | today's jobs marked `CANCELED`       |

`Completed + In Progress + Pending + Overdue + Cancelled = Scheduled (total)`.

---

## 2. Customer Pending Services

Top 5 customers (companies) with active (non-completed/cancelled) jobs,
ordered so the most overdue customer surfaces first:

```sql
SELECT
  co.id   AS company_id,
  co.name AS company_name,
  COUNT(*) AS pending_count,
  MIN(j.start_date) AS oldest_due
FROM jobs j
JOIN sites s      ON j.company_id = s.id
JOIN companies co ON s.company_id = co.id
WHERE 1=1 AND COALESCE(j.is_archived, 0) = 0
  -- (+ role/branch scoping)
  AND j.status NOT IN ('COMPLETED','CANCELED')
GROUP BY co.id, co.name
ORDER BY oldest_due ASC
LIMIT 5
```

> `jobs.company_id` actually points at `sites.id` (a site is a company's
> physical location), and `sites.company_id` points at the real
> `companies` row — this two-hop join is the same pattern already used in
> `jobs.routes.js` to resolve a job's customer. Residential jobs with no
> `company_id` are naturally excluded (INNER JOIN), matching "Customer"
> meaning a corporate client here.

**Status** per row is derived in Node from `oldest_due` vs. today's date:

```js
if (oldestDue < today)      status = "Overdue";
else if (oldestDue === today) status = "Pending";
else                          status = "Upcoming";
```

---

## 3. Customers At Risk

A customer (company) is "at risk" if **any** of the three criteria shown
in the widget is true, aggregated per company:

```sql
SELECT COUNT(*) AS at_risk_count
FROM (
  SELECT
    co.id,
    SUM(j.status NOT IN ('COMPLETED','CANCELED')
        AND j.start_date < CURDATE())                 AS overdue_count,
    SUM(j.status NOT IN ('COMPLETED','CANCELED')
        AND DATE(j.start_date) <= CURDATE())           AS pending_count,
    SUM(j.status = 'COMPLETED'
        AND j.completed_at IS NOT NULL
        AND DATE(j.completed_at) > DATE(j.start_date))  AS late_completed_count
  FROM jobs j
  JOIN sites s      ON j.company_id = s.id
  JOIN companies co ON s.company_id = co.id
  WHERE 1=1 AND COALESCE(j.is_archived, 0) = 0
    -- (+ role/branch scoping)
  GROUP BY co.id
) x
WHERE x.overdue_count >= 1
   OR x.pending_count >= 2
   OR x.late_completed_count >= 2
```

| Criterion                  | Threshold                                              |
|-----------------------------|--------------------------------------------------------|
| Overdue services exist      | ≥ 1 job past its `start_date`, still not completed/cancelled |
| Multiple pending services   | ≥ 2 active jobs due today or earlier                    |
| Repeated late services      | ≥ 2 completed jobs finished after their `start_date`    |

The widget currently surfaces only the count; the underlying per-company
breakdown is already computed server-side, so a drill-down list ("View
All") can be added later without a new query shape.

## Response shape

```json
{
  "pipeline": {
    "scheduled": 125,
    "assigned": 120,
    "inProgress": 110,
    "completed": 98,
    "pending": 15,
    "overdue": 12
  },
  "statusBreakdown": {
    "completed": 98,
    "inProgress": 10,
    "pending": 5,
    "overdue": 10,
    "cancelled": 2,
    "total": 125
  },
  "customerPendingServices": [
    {
      "companyId": "…",
      "companyName": "ABC Hotels",
      "pending": 5,
      "oldestDue": "2026-09-01T00:00:00.000Z",
      "status": "Overdue"
    }
  ],
  "customersAtRisk": { "count": 8 }
}
```

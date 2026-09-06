# Analysis Tab — SQL Reference

This document lists the SQL used to power the **Analysis** tab's top KPI tiles
(Scheduled, Completed, Pending, Overdue, Completion %, On-time %).

- Endpoint: `GET /api/dashboard/top-tiles`
- Route file: [backend/src/routes/dashboard.routes.js](../backend/src/routes/dashboard.routes.js)
- Frontend page: [frontend/src/pages/AdminAnalysis.jsx](../frontend/src/pages/AdminAnalysis.jsx)
- Table read: `jobs` (see `backend/prisma/schema.prisma` for the full column list)

All numbers are computed live from MySQL on every request (no caching, no
mock data) and are scoped to the logged-in user exactly the way the existing
`/api/dashboard/summary` endpoint is scoped.

## 1. Role / branch scoping

Applied as a `WHERE` prefix before the main aggregate query, built dynamically
based on `req.user.role`:

```sql
-- base filter, always applied
WHERE 1=1 AND COALESCE(j.is_archived, 0) = 0

-- + if role = 'supervisor'
AND j.supervisor_id = ?              -- req.user.id

-- + if role = 'technician'
AND JSON_CONTAINS(j.team, JSON_QUOTE(?))   -- String(req.user.id)

-- + if role != 'admin' (supervisor / technician / branch_admin / client)
AND j.branch_id = ?                  -- the caller's own branch_id,
                                      -- looked up separately:
                                      --   SELECT branch_id FROM users WHERE id = ?
```

`admin` sees every non-archived job across all branches; everyone else is
restricted to their own branch (and further to their own jobs, for
supervisors/technicians).

## 2. Main KPI aggregate

```sql
SELECT
  SUM(DATE(j.start_date) = CURDATE()) AS scheduled_today,

  SUM(DATE(j.start_date) = CURDATE()
      AND j.status IN ('CREATED','NOT_STARTED'))  AS pending_today,

  SUM(DATE(j.start_date) = CURDATE()
      AND j.status = 'COMPLETED')                 AS completed_today,

  SUM(j.start_date < CURDATE()
      AND j.status NOT IN ('COMPLETED','CANCELED')) AS overdue,

  SUM(j.status = 'COMPLETED')                     AS completed_all_time,

  SUM(j.status = 'COMPLETED'
      AND j.completed_at IS NOT NULL
      AND DATE(j.completed_at) <= DATE(j.start_date)) AS on_time_all_time

FROM jobs j
WHERE 1=1 AND COALESCE(j.is_archived, 0) = 0
  -- (+ role/branch scoping from section 1)
```

## 3. Derived tile values (computed in Node from the row above)

```js
completionPct = scheduledToday > 0
  ? round1(completedToday / scheduledToday * 100)
  : 0;

onTimePct = completedAllTime > 0
  ? round1(onTimeAllTime / completedAllTime * 100)
  : 0;
```

## Field → tile mapping

| Tile          | Source field         | Definition                                                                 |
|---------------|-----------------------|-----------------------------------------------------------------------------|
| Scheduled     | `scheduled_today`     | Jobs with `start_date` = today, any status                                  |
| Completed     | `completed_today`     | Today's jobs with `status = COMPLETED`                                      |
| Pending       | `pending_today`       | Today's jobs with `status IN (CREATED, NOT_STARTED)`                        |
| Overdue       | `overdue`             | Any job (any date) with `start_date` in the past and not COMPLETED/CANCELED |
| Completion %  | derived               | `completed_today / scheduled_today`                                         |
| On-time %     | derived               | `on_time_all_time / completed_all_time` (all-time, not just today)          |

> **Note:** `jobs.status` has no native `SCHEDULED` value — "Scheduled" is
> defined here as "`start_date` is today" (any status), which matches how
> `start_date` is already used elsewhere in the app (job list sorting,
> overdue/upcoming grouping in `jobs.routes.js`). `due_date` was deliberately
> **not** used — it's set once at booking creation to the end of the whole
> recurrence window, not a per-day due date (the existing `/summary`
> endpoint still has this bug; it wasn't touched as part of this change).

## Response shape

```json
{
  "scheduled": 125,
  "completed": 98,
  "pending": 15,
  "overdue": 12,
  "completionPct": 78.4,
  "onTimePct": 86.0
}
```

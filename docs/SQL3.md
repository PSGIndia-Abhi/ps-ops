# Analysis Tab — SQL Reference (Part 3)

Covers the four widgets added below the pipeline/status/customer row:
**Employee Performance (Today) · On-Time Completion Trend · Employee
Workload (Today) · Upcoming Services**

- Endpoint: `GET /api/dashboard/team-overview`
- Route file: [backend/src/routes/dashboard.routes.js](../backend/src/routes/dashboard.routes.js)
- Frontend page: [frontend/src/pages/AdminAnalysis.jsx](../frontend/src/pages/AdminAnalysis.jsx)
- Tables read: `jobs`, `users`, `roles`
- Parts 1 & 2: [SQL.md](SQL.md), [SQL2.md](SQL2.md)

All numbers are computed live from MySQL on every request, scoped the same
way as the rest of the Analysis tab. The shared scope helper now exposes
both forms:

```js
buildJobScope(req) → { where, extra, params, branchId, forbidden }
```

- `where` — a ready `WHERE 1=1 AND COALESCE(j.is_archived,0)=0 {extra}` clause, used as-is for single-table queries (see SQL.md / SQL2.md).
- `extra` — just the role/branch AND-fragments with no leading `WHERE`, so it can be spliced into a `JOIN ... ON (...)` condition or a query that already has its own `WHERE` (needed below, since "Employee Performance" is a `LEFT JOIN` from `users`, not a plain `FROM jobs`).

```sql
-- extra, built the same way as before:
AND j.supervisor_id = ?              -- role = supervisor
AND JSON_CONTAINS(j.team, JSON_QUOTE(?))   -- role = technician
AND j.branch_id = ?                  -- role != admin
```

---

## 1. Employee Performance (Today) + Employee Workload

Both widgets are the same per-technician dataset — Employee Performance
renders it as a table, Employee Workload re-sorts it by `assignedToday`
and renders it as bars. One query, no duplicate work:

```sql
SELECT
  u.id   AS technician_id,
  u.name AS technician_name,

  SUM(DATE(j.start_date) = CURDATE())                              AS assigned_today,
  SUM(DATE(j.start_date) = CURDATE()
      AND j.status = 'COMPLETED')                                  AS completed_today,
  SUM(DATE(j.start_date) = CURDATE()
      AND j.status IN ('CREATED','NOT_STARTED'))                    AS pending_today,
  SUM(j.start_date < CURDATE()
      AND j.status NOT IN ('COMPLETED','CANCELED'))                 AS overdue_all_time,
  SUM(j.status = 'COMPLETED')                                       AS completed_all_time,
  SUM(j.status = 'COMPLETED'
      AND j.completed_at IS NOT NULL
      AND DATE(j.completed_at) <= DATE(j.start_date))                AS on_time_all_time

FROM users u
JOIN roles r ON r.id = u.role_id
LEFT JOIN jobs j
  ON (
       JSON_CONTAINS(j.team, CAST(u.id AS JSON))
    OR JSON_CONTAINS(j.team, JSON_QUOTE(CAST(u.id AS CHAR)))
  )
  AND 1=1 AND COALESCE(j.is_archived, 0) = 0
  {extra}                                    -- role/branch scope on the jobs side

WHERE u.is_active = 1
  AND (LOWER(r.name) = 'technician' OR LOWER(u.role) = 'technician')
  {AND u.branch_id = ?}                      -- only for non-admin roles

GROUP BY u.id, u.name
ORDER BY assigned_today DESC, u.name ASC
LIMIT 5
```

> `jobs.team` is a JSON array of technician ids. Older rows store the ids
> as JSON numbers (`[128]`), matched by `JSON_CONTAINS(j.team, CAST(u.id
> AS JSON))`; the `JSON_QUOTE(...)` form additionally matches any rows
> written as JSON strings (`["128"]`) — the same dual check already used
> for job-access control in `jobs.routes.js`. `LEFT JOIN` (not `INNER
> JOIN`) so a technician with zero jobs still shows up with all-zero
> counts instead of disappearing from the list.
>
> The technician role check mirrors the existing `/api/shifts/technicians`
> query (`shifts.routes.js`) — it accepts either the normalized `roles.name`
> or the legacy `users.role` string column, since both are used
> inconsistently across the codebase.

**On-Time %** per employee, computed in Node exactly like the top tile:

```js
onTimePct = completedAllTime > 0
  ? round1(onTimeAllTime / completedAllTime * 100)
  : 0;
```

| Column     | Field               | Definition                                          |
|------------|---------------------|-------------------------------------------------------|
| Assigned   | `assigned_today`     | Jobs today where this technician is on `team`         |
| Completed  | `completed_today`    | ...and `status = COMPLETED`                            |
| Pending    | `pending_today`      | ...and `status IN (CREATED, NOT_STARTED)`               |
| Overdue    | `overdue_all_time`   | Any (not just today) job past `start_date`, not done   |
| On-Time %  | derived              | All-time on-time completions / all-time completions    |

Employee Workload reuses `assignedToday`, sorted descending, bar width
scaled against the max value in the returned set.

---

## 2. On-Time Completion Trend (last 6 months)

Grouped by the **month of the job's `start_date`** (not completion date —
keeps it aligned with the "on-time relative to start_date" definition used
everywhere else on this tab):

```sql
SELECT
  DATE_FORMAT(j.start_date, '%Y-%m') AS month_key,
  COUNT(*) AS completed_count,
  SUM(j.completed_at IS NOT NULL
      AND DATE(j.completed_at) <= DATE(j.start_date)) AS on_time_count
FROM jobs j
WHERE j.status = 'COMPLETED'
  AND COALESCE(j.is_archived, 0) = 0
  AND j.start_date >= ?              -- first day of (current month - 5)
  {extra}
GROUP BY month_key
```

The 6 month buckets (current month + previous 5) are generated in Node
first, so months with **zero** completed jobs still show up on the chart
as 0% instead of a gap:

```js
onTimePct = completedCount > 0
  ? round1(onTimeCount / completedCount * 100)
  : 0;
```

---

## 3. Upcoming Services (next 5 days)

```sql
SELECT DATE(j.start_date) AS service_date, COUNT(*) AS cnt
FROM jobs j
WHERE j.start_date >= ?     -- tomorrow, 00:00
  AND j.start_date < ?      -- 6 days from today, 00:00 (exclusive)
  AND COALESCE(j.is_archived, 0) = 0
  AND j.status <> 'CANCELED'
  {extra}
GROUP BY service_date
```

The 5 day buckets (tomorrow … +5 days) are generated in Node the same way
as the month buckets, so a day with no scheduled jobs shows `0` rather
than being omitted. Labels: `Tomorrow (DD Mon)` for the first day, `+N
days (DD Mon)` for the rest.

## Response shape

```json
{
  "employeePerformance": [
    {
      "technicianId": 128,
      "technicianName": "Ravi Kumar",
      "assignedToday": 25,
      "completedToday": 24,
      "pendingToday": 1,
      "overdueAllTime": 0,
      "onTimePct": 96
    }
  ],
  "onTimeTrend": [
    { "month": "2026-04", "label": "Apr", "onTimePct": 91.2 }
  ],
  "upcomingServices": [
    { "date": "2026-09-05", "label": "Tomorrow (05 Sep)", "count": 48 }
  ]
}
```

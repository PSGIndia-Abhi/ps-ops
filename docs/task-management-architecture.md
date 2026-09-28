# Task Management Module — Architecture

**Status:** Design spec — not yet implemented (no code in the repo against this spec).
**Scope:** Backend & API only. Consumers: web frontend (built by teammates), future mobile app.

---

## Scope boundary

This module is completely independent from the existing `tasks` table used by the Accountant / Payment Tracking panel (invoice follow-ups, migration `20260918_create_payment_tracking_tables.sql`, live at `/api/tasks`). No tables, routes, or permissions are shared or reused between the two. Every identifier in this module is prefixed `work_task` specifically to avoid collision.

---

## 1. System placement

```
Web frontend (React)        Mobile app (future)
        \                        /
         \                      /
          v                    v
        HTTPS + JWT (existing auth)
                 |
                 v
  /api/work-tasks            /api/work-task-series
  (CRUD, lifecycle,          (recurring schedule
   comments, attachments,     control: pause/
   history)                   resume/stop)
                 |
                 v
   Task engine  --------  Hierarchy module (existing,
  (recurrence date-math,   reused as-is via
   lifecycle rules,        getTeamUserIds())
   history log)            RBAC (existing permissions/
                            role_permissions — 4 new rows)
                 |
                 v
      MySQL (6 new tables)        MinIO (attachment files,
      fully separate from          same bucket/pattern as
      the `tasks` table            job_attachments)
```

## 2. Key decisions

| Decision | Choice | Why |
|---|---|---|
| Relationship to Accountant `tasks` | Fully separate tables/API | Explicit product requirement — the two must never be linked |
| `task_type` | Free text, type-ahead from prior values | No fixed list wanted; matches the `unit_type` pattern already used for departments |
| `priority` | Fixed enum — LOW / NORMAL / HIGH | Kept simple and consistent on request |
| Linking to other records | `source_module` + `source_id`, no FK | Generic and reusable — the module never needs to know about invoices, jobs, customers, etc. |
| Who can see whose tasks | Reuses the existing org hierarchy | Avoids a second, competing hierarchy concept |
| Reminders | Deferred — not in this pass | Design doc itself treats reminders as a later layer |
| "Overdue" status | Never stored — derived from `due_date` at read time | Same pattern already used by `jobs` and the Accountant `tasks` table |

## 3. Recurrence engine

A recurring task is two records:

- A **series** (the template — title, assignee, priority, description — plus its own lifecycle: `ACTIVE` / `PAUSED` / `CANCELLED`).
- A **recurrence rule** (`DAILY` / `WEEKLY` / `MONTHLY` / `YEARLY`, an interval, and end conditions).

Neither is a task by itself. When the rule fires, it creates an ordinary row in `work_tasks` — a real, independent occurrence with its own status, comments, attachments and history. Completing, skipping, or editing one occurrence never touches the series or any other occurrence.

- The first due occurrence(s) generate **synchronously** the moment the series is created — no waiting for the next scheduler run.
- A background job then runs once daily, generating any occurrence that has become due since the last run (catches up correctly even after downtime).
- **Pause** stops generation for a date range without cancelling the schedule. **Stop** cancels it permanently; past occurrences are untouched either way.
- **Skip** cancels a single future occurrence without affecting the schedule at all.

## 4. Visibility model

Two independent concepts, deliberately kept apart:

- **Role (RBAC)** — can this person create/reassign/delete tasks at all?
- **Hierarchy** — whose tasks can this person see, out of the people they're allowed to act on?

| Requester holds… | Sees |
|---|---|
| Nothing extra | Only their own tasks (as assignee or creator) |
| `VIEW_TEAM_WORK_TASKS` | Their own + everyone below them in the org hierarchy (via `getTeamUserIds()`) |
| `MANAGE_TEAM_WORK_TASKS` | Same visibility as above, plus the ability to create/assign/reassign within that team |
| `VIEW_ALL_WORK_TASKS` or `admin` | Every task in the company, no filter |

## 5. Task lifecycle

```
OPEN --start(assignee only)--> IN_PROGRESS --complete--> COMPLETED

(any open state) --delete / skip--> CANCELLED
```

Every transition — create, start, progress note, complete, reassign, reschedule, skip, cancel, attach — is written to `work_task_history`, giving each task a full, permanent audit trail.

---

## Deferred from v1

- **Reminders** — a `work_task_reminders` table + time-based cron, deliberately left out; the design doc treats this as a later layer.
- **Fine-grained recurring edits** — "this occurrence only / this and future / entire schedule" (as in Google Calendar) isn't built; only single-occurrence edits and whole-schedule pause/stop exist in this design.
- **Source validation** — `source_module`/`source_id` are stored as-is, never checked against the table they claim to reference.

See also: `task-management-database-design.md`, `task-management-api-payloads.md`.

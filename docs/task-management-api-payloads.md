# Task Management Module — API & Payloads

**Status:** Design spec — not yet implemented (these routes do not exist in the repo yet).

Two route groups: `/api/work-tasks` and `/api/work-task-series`. Every request carries a Bearer JWT, same as the rest of the backend. See `task-management-architecture.md` for the visibility model and `task-management-database-design.md` for the underlying tables.

---

## Auth & visibility rules

Every list/read endpoint is scoped the same way:

- Own tasks are always visible.
- `VIEW_TEAM_WORK_TASKS` adds everyone in the requester's hierarchy team.
- `VIEW_ALL_WORK_TASKS` or `admin` removes the filter entirely.
- A task outside the requester's visibility returns **404**, never 403 — existence is never leaked.

---

## Task CRUD

### `GET /api/work-tasks/types`
Distinct `task_type` values already used — powers a type-ahead dropdown.

**Auth:** any signed-in user.

**Response 200**
```json
["Follow-up", "Site Visit", "Report"]
```

---

### `GET /api/work-tasks`
List tasks, auto-scoped to what the requester may see.

**Auth:** scoped by hierarchy (see above).

**Query params** (all optional, combine with AND): `status`, `priority`, `task_type`, `source_module`, `source_id`, `assigned_to`, `from_date`, `to_date`.

**Response 200**
```json
[
  {
    "id": "9939d779-a039-4261-8164-a836590fa43f",
    "series_id": null,
    "title": "Call customer - ABC Hotels",
    "task_type": "Follow-up",
    "priority": "HIGH",
    "status": "OPEN",
    "assigned_to": 12, "assigned_to_name": "Rahul Sharma",
    "created_by": 1, "created_by_name": "Admin Main",
    "due_date": "2026-09-30", "due_time": "10:00:00",
    "is_overdue": false,
    "source_module": "CUSTOMER", "source_id": "abc-hotels"
  }
]
```

---

### `POST /api/work-tasks`
Create a one-time task, or — with a `recurrence` object — a recurring series (first occurrence(s) generate immediately).

**Auth:** any signed-in user, for themself. Assigning to someone else requires `MANAGE_TEAM_WORK_TASKS` and the target must be in the requester's team.

**Request — one-time**
```json
{
  "title": "Call customer - ABC Hotels",
  "description": "Follow up on pending payment",
  "task_type": "Follow-up",
  "priority": "HIGH",
  "assigned_to": 12,
  "due_date": "2026-09-30",
  "due_time": "10:00:00",
  "source_module": "CUSTOMER",
  "source_id": "abc-hotels"
}
```

**Request — recurring**
```json
{
  "title": "Check equipment",
  "assigned_to": 12,
  "priority": "NORMAL",
  "recurrence": {
    "frequency": "WEEKLY",
    "interval_value": 1,
    "days_of_week": [1, 5],
    "start_date": "2026-09-07",
    "time_of_day": "10:00:00",
    "end_type": "NEVER"
  }
}
```

**Response 201 — recurring**
```json
{
  "success": true,
  "series_id": "87471486-...",
  "occurrences_created": 6,
  "tasks": [ { "id": "...", "due_date": "2026-09-07", "status": "OPEN" } ]
}
```

---

### `GET /api/work-tasks/:id`
Full task detail, plus comment and attachment counts.

**Auth:** visible to requester (else 404).

---

### `PUT /api/work-tasks/:id`
Edit title / description / task_type / priority. Blocked once `COMPLETED` or `CANCELLED`.

**Auth:** assignee, creator, or `MANAGE_TEAM_WORK_TASKS`.

**Request**
```json
{ "title": "Updated title", "priority": "LOW" }
```

---

## Lifecycle actions

### `POST /api/work-tasks/:id/start`
`OPEN` → `IN_PROGRESS`. Records `started_at`/`started_by`.

**Auth:** assignee only.

---

### `POST /api/work-tasks/:id/progress`
Add a progress note (stored as a comment) and optionally set the next action. Requires `IN_PROGRESS`.

**Auth:** assignee only.

**Request**
```json
{
  "note": "Customer confirmed payment next week",
  "next_action": "Call again",
  "next_action_date": "2026-10-05"
}
```

---

### `POST /api/work-tasks/:id/complete`
→ `COMPLETED`. Records `completed_at`/`completed_by`/`completion_note`.

**Auth:** assignee only.

**Request**
```json
{ "completion_note": "Payment received" }
```

---

### `POST /api/work-tasks/:id/reassign`
Change assignee. New assignee must be within the actor's team (or the actor is admin).

**Auth:** `MANAGE_TEAM_WORK_TASKS`, creator, or admin.

**Request**
```json
{ "assigned_to": 15, "note": "Rahul is on leave" }
```

---

### `POST /api/work-tasks/:id/reschedule`
Change due date/time.

**Auth:** `MANAGE_TEAM_WORK_TASKS`, creator, or admin.

**Request**
```json
{ "due_date": "2026-10-02", "due_time": "11:00:00", "reason": "Customer asked to push" }
```

---

### `POST /api/work-tasks/:id/skip`
Cancel one recurring occurrence only — the series and future occurrences are untouched.

**Auth:** `MANAGE_TEAM_WORK_TASKS`, assignee, creator, or admin.

---

### `DELETE /api/work-tasks/:id`
Soft-cancel (sets status `CANCELLED` — never a hard delete).

**Auth:** `DELETE_WORK_TASK`.

---

## Comments, attachments, history

### `GET /api/work-tasks/:id/comments` / `POST /api/work-tasks/:id/comments`
**Auth:** anyone who can view the task.

**Request (POST)**
```json
{ "comment": "Spoke to the customer, will pay by Friday." }
```

---

### Attachments
- `GET /api/work-tasks/:id/attachments`
- `POST /api/work-tasks/:id/attachments` — `multipart/form-data`, field name `file`
- `GET /api/work-tasks/:id/attachments/:attachmentId/view` — streams the file from MinIO
- `DELETE /api/work-tasks/:id/attachments/:attachmentId`

**Auth:** view — anyone who can see the task. Upload/delete — assignee, creator, or `MANAGE_TEAM_WORK_TASKS`.

---

### `GET /api/work-tasks/:id/history`
Full audit trail, oldest first.

**Response 200**
```json
[
  { "action": "CREATE", "to_status": "OPEN", "changed_by_name": "Admin Main", "changed_at": "..." },
  { "action": "START", "from_status": "OPEN", "to_status": "IN_PROGRESS", "changed_at": "..." },
  { "action": "COMPLETE", "from_status": "IN_PROGRESS", "to_status": "COMPLETED", "note": "Payment received" }
]
```

---

## Recurring series

### `GET /api/work-task-series`
List schedules, same visibility scoping as tasks.

### `GET /api/work-task-series/:id`
Detail, including the recurrence rule and up to 50 recent occurrences.

---

### `POST /api/work-task-series/:id/pause`
**Auth:** `MANAGE_TEAM_WORK_TASKS`, creator, assignee, or admin.

**Request**
```json
{ "pause_from": "2026-10-01", "pause_until": "2026-10-15" }
```

---

### `POST /api/work-task-series/:id/resume`
Clears the pause and immediately generates any occurrence now due.

---

### `POST /api/work-task-series/:id/stop`
Permanent — no more occurrences ever generate. Past occurrences are untouched.

---

See also: `task-management-architecture.md`, `task-management-database-design.md`.

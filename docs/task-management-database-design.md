# Task Management Module — Database Design

**Status:** Design spec — not yet implemented (no migration has been run against dev or production for this).

Six new tables, all prefixed `work_task`. IDs are UUID (`CHAR(36)`), matching the convention already used by `org_units`, `sites`, and `companies`. User references are `BIGINT`, matching `users.id`.

See `task-management-architecture.md` for why these tables are fully separate from the existing Accountant `tasks` table.

---

## Entity overview

```
work_task_series (recurring template)
        |
        | 1:1
        v
work_task_recurrence (schedule rule)
        |
        | generates
        v
work_tasks  <---- the task itself: a one-time task, or one occurrence of a series
   |    |    |
   |    |    +--- work_task_comments      (1:many)
   |    +--------- work_task_attachments   (1:many, MinIO-backed)
   +-------------- work_task_history       (1:many, append-only)
```

---

## `work_task_series`

The recurring task's template. Every field here is copied onto each generated occurrence.

| Column | Type | Notes |
|---|---|---|
| `id` **PK** | `CHAR(36)` | UUID |
| `title` | `VARCHAR(200)` | Required |
| `description` | `TEXT` | Optional |
| `task_type` | `VARCHAR(100)` | Free text |
| `priority` | `ENUM('LOW','NORMAL','HIGH')` | Default `NORMAL` |
| `source_module` | `VARCHAR(50)` | Optional, unvalidated |
| `source_id` | `VARCHAR(64)` | Optional, unvalidated |
| `assigned_to` **FK** | `BIGINT` | → `users.id`, required |
| `status` | `ENUM('ACTIVE','PAUSED','CANCELLED')` | Default `ACTIVE` |
| `pause_from` / `pause_until` | `DATE` | Only set while `PAUSED` |
| `created_by` **FK** | `BIGINT` | → `users.id` |
| `created_at` / `updated_at` | `TIMESTAMP` | |

```sql
CREATE TABLE work_task_series (
  id CHAR(36) NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT NULL,
  task_type VARCHAR(100) NULL,
  priority ENUM('LOW','NORMAL','HIGH') NOT NULL DEFAULT 'NORMAL',
  source_module VARCHAR(50) NULL,
  source_id VARCHAR(64) NULL,
  assigned_to BIGINT NOT NULL,
  status ENUM('ACTIVE','PAUSED','CANCELLED') NOT NULL DEFAULT 'ACTIVE',
  pause_from DATE NULL,
  pause_until DATE NULL,
  created_by BIGINT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_wts_assigned FOREIGN KEY (assigned_to) REFERENCES users (id),
  CONSTRAINT fk_wts_created_by FOREIGN KEY (created_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

---

## `work_task_recurrence`

One rule per series (1:1). Which columns matter depends on `frequency`.

| Column | Type | Notes |
|---|---|---|
| `id` **PK** | `CHAR(36)` | |
| `series_id` **FK, UNIQUE** | `CHAR(36)` | → `work_task_series.id` |
| `frequency` | `ENUM('DAILY','WEEKLY','MONTHLY','YEARLY')` | |
| `interval_value` | `INT` | "every N days/weeks/months/years", default 1 |
| `days_of_week` | `JSON` | WEEKLY only — array of 0(Sun)–6(Sat), e.g. `[1,5]` |
| `day_of_month` | `INT` | MONTHLY / YEARLY |
| `use_last_day_of_month` | `TINYINT(1)` | MONTHLY — "last day of every month" |
| `month_of_year` | `INT` | YEARLY only, 1–12 |
| `time_of_day` | `TIME` | Default `09:00:00` |
| `start_date` | `DATE` | Required |
| `end_type` | `ENUM('NEVER','ON_DATE','AFTER_COUNT')` | |
| `end_date` / `end_count` | `DATE` / `INT` | Set according to `end_type` |
| `occurrences_created` | `INT` | Running counter, for `AFTER_COUNT` |
| `last_generated_until` | `DATE` | Scheduler bookmark — resumes generation from here |

```sql
CREATE TABLE work_task_recurrence (
  id CHAR(36) NOT NULL,
  series_id CHAR(36) NOT NULL,
  frequency ENUM('DAILY','WEEKLY','MONTHLY','YEARLY') NOT NULL,
  interval_value INT NOT NULL DEFAULT 1,
  days_of_week JSON NULL,
  day_of_month INT NULL,
  use_last_day_of_month TINYINT(1) NOT NULL DEFAULT 0,
  month_of_year INT NULL,
  time_of_day TIME NOT NULL DEFAULT '09:00:00',
  start_date DATE NOT NULL,
  end_type ENUM('NEVER','ON_DATE','AFTER_COUNT') NOT NULL DEFAULT 'NEVER',
  end_date DATE NULL,
  end_count INT NULL,
  occurrences_created INT NOT NULL DEFAULT 0,
  last_generated_until DATE NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_wtr_series (series_id),
  CONSTRAINT fk_wtr_series FOREIGN KEY (series_id) REFERENCES work_task_series (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

> **Timezone note:** dates must always be read back via `DATE_FORMAT(..., '%Y-%m-%d')`, never as raw driver `Date` objects — mysql2 shifts unformatted `DATE` columns by the server's timezone offset, a known gotcha already documented in `backend/src/utils/hierarchy.js` and applicable here identically.

---

## `work_tasks`

The task itself — a standalone one-time task, or one generated occurrence of a series.

| Column | Type | Notes |
|---|---|---|
| `id` **PK** | `CHAR(36)` | |
| `series_id` **FK** | `CHAR(36)` | → `work_task_series.id`, NULL for a one-time task |
| `title`, `description`, `task_type`, `priority` | — | Same shape as the series template |
| `status` | `ENUM('OPEN','IN_PROGRESS','COMPLETED','CANCELLED')` | |
| `source_module` / `source_id` | `VARCHAR` | Optional, unvalidated |
| `assigned_to` / `created_by` **FK** | `BIGINT` | → `users.id` |
| `due_date` / `due_time` | `DATE` / `TIME` | `due_date` required |
| `next_action` / `next_action_date` | `VARCHAR` / `DATE` | Set via the progress-update action |
| `started_at` / `started_by` | `DATETIME` / `BIGINT` | Set on Start |
| `completed_at` / `completed_by` / `completion_note` | — | Set on Complete |
| `created_at` / `updated_at` | `TIMESTAMP` | |

```sql
CREATE TABLE work_tasks (
  id CHAR(36) NOT NULL,
  series_id CHAR(36) NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT NULL,
  task_type VARCHAR(100) NULL,
  priority ENUM('LOW','NORMAL','HIGH') NOT NULL DEFAULT 'NORMAL',
  status ENUM('OPEN','IN_PROGRESS','COMPLETED','CANCELLED') NOT NULL DEFAULT 'OPEN',
  source_module VARCHAR(50) NULL,
  source_id VARCHAR(64) NULL,
  assigned_to BIGINT NOT NULL,
  created_by BIGINT NULL,
  due_date DATE NOT NULL,
  due_time TIME NULL,
  next_action VARCHAR(255) NULL,
  next_action_date DATE NULL,
  started_at DATETIME NULL,
  started_by BIGINT NULL,
  completed_at DATETIME NULL,
  completed_by BIGINT NULL,
  completion_note TEXT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_wt_assigned (assigned_to, status),
  KEY idx_wt_series (series_id),
  KEY idx_wt_due (due_date),
  KEY idx_wt_source (source_module, source_id),
  CONSTRAINT fk_wt_series FOREIGN KEY (series_id) REFERENCES work_task_series (id),
  CONSTRAINT fk_wt_assigned FOREIGN KEY (assigned_to) REFERENCES users (id),
  CONSTRAINT fk_wt_created_by FOREIGN KEY (created_by) REFERENCES users (id),
  CONSTRAINT fk_wt_started_by FOREIGN KEY (started_by) REFERENCES users (id),
  CONSTRAINT fk_wt_completed_by FOREIGN KEY (completed_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

---

## `work_task_comments`

| Column | Type | Notes |
|---|---|---|
| `id` **PK** | `CHAR(36)` | |
| `task_id` **FK** | `CHAR(36)` | → `work_tasks.id` |
| `user_id` **FK** | `BIGINT` | → `users.id` |
| `comment` | `TEXT` | Required |
| `created_at` | `TIMESTAMP` | |

```sql
CREATE TABLE work_task_comments (
  id CHAR(36) NOT NULL,
  task_id CHAR(36) NOT NULL,
  user_id BIGINT NOT NULL,
  comment TEXT NOT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_wtc_task (task_id),
  CONSTRAINT fk_wtc_task FOREIGN KEY (task_id) REFERENCES work_tasks (id),
  CONSTRAINT fk_wtc_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

---

## `work_task_attachments`

Same MinIO-backed pattern as `job_attachments` — file bytes live in MinIO; the DB row is metadata only.

| Column | Type | Notes |
|---|---|---|
| `id` **PK** | `CHAR(36)` | |
| `task_id` **FK** | `CHAR(36)` | → `work_tasks.id` |
| `object_key` | `VARCHAR(500)` | MinIO object path, e.g. `work-tasks/<task_id>/<uuid>.pdf` |
| `file_name`, `file_type`, `file_size` | — | Original filename, MIME type, bytes |
| `uploaded_by` **FK** | `BIGINT` | → `users.id` |
| `created_at` | `TIMESTAMP` | |

```sql
CREATE TABLE work_task_attachments (
  id CHAR(36) NOT NULL,
  task_id CHAR(36) NOT NULL,
  object_key VARCHAR(500) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_type VARCHAR(100) NULL,
  file_size INT NULL,
  uploaded_by BIGINT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_wta_task (task_id),
  CONSTRAINT fk_wta_task FOREIGN KEY (task_id) REFERENCES work_tasks (id),
  CONSTRAINT fk_wta_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

---

## `work_task_history`

Append-only audit trail. One row per lifecycle event.

| Column | Type | Notes |
|---|---|---|
| `id` **PK** | `BIGINT AUTO_INCREMENT` | |
| `task_id` **FK** | `CHAR(36)` | → `work_tasks.id` |
| `action` | `VARCHAR(50)` | `CREATE` / `START` / `UPDATE` / `COMPLETE` / `REASSIGN` / `RESCHEDULE` / `SKIP` / `CANCEL` / `ATTACH` |
| `from_status` / `to_status` | `VARCHAR(20)` | Nullable — not every action is a status change |
| `note` | `VARCHAR(500)` | Human-readable detail, e.g. "Reassigned from … to …" |
| `changed_by` **FK** | `BIGINT` | → `users.id` |
| `changed_at` | `TIMESTAMP` | |

```sql
CREATE TABLE work_task_history (
  id BIGINT NOT NULL AUTO_INCREMENT,
  task_id CHAR(36) NOT NULL,
  action VARCHAR(50) NOT NULL,
  from_status VARCHAR(20) NULL,
  to_status VARCHAR(20) NULL,
  note VARCHAR(500) NULL,
  changed_by BIGINT NULL,
  changed_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_wth_task (task_id),
  CONSTRAINT fk_wth_task FOREIGN KEY (task_id) REFERENCES work_tasks (id),
  CONSTRAINT fk_wth_changed_by FOREIGN KEY (changed_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

---

## Permissions (new rows on the existing `permissions` table)

No new permission system — 4 rows added to the existing `permissions` table, assignable per-role from the existing Roles & Permissions screen.

| Permission | Grants |
|---|---|
| `VIEW_TEAM_WORK_TASKS` | See tasks belonging to everyone below you in the org hierarchy |
| `MANAGE_TEAM_WORK_TASKS` | Create, assign, reassign, reschedule tasks for your team |
| `VIEW_ALL_WORK_TASKS` | See every task company-wide |
| `DELETE_WORK_TASK` | Soft-delete (cancel) any visible task |

Acting on your own task — view, start, update, complete, comment — never requires a permission. `admin` bypasses every check, as elsewhere in this app.

```sql
INSERT INTO permissions (name) SELECT 'VIEW_TEAM_WORK_TASKS' WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'VIEW_TEAM_WORK_TASKS');
INSERT INTO permissions (name) SELECT 'MANAGE_TEAM_WORK_TASKS' WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'MANAGE_TEAM_WORK_TASKS');
INSERT INTO permissions (name) SELECT 'VIEW_ALL_WORK_TASKS' WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'VIEW_ALL_WORK_TASKS');
INSERT INTO permissions (name) SELECT 'DELETE_WORK_TASK' WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'DELETE_WORK_TASK');
```

See also: `task-management-architecture.md`, `task-management-api-payloads.md`.

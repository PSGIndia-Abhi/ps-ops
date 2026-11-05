-- =============================================================================================
-- Customer Feedback - production upgrade: steps 22 to 31, in order, in one script.
--
-- Before you run it:
--   1. Take a backup of the database (mysqldump) - this changes tables.
--   2. Steps 01-21 (20261030_feedback_01 ... 20261104_feedback_21) must already be in production.
--      Check:  SHOW COLUMNS FROM feedback_questions LIKE 'question_type';   -- must exist
--   3. Run the whole file once against the production database, e.g.
--        mysql -u <user> -p <database> < feedback_production_upgrade.sql
--      Every step is safe to run again, so if it stops halfway, fix the cause and run it all again.
--   4. Run the checks at the bottom; then restart / redeploy the backend.
--
-- Made from backend/src/data/migrations/20261105_feedback_22 ... 31 (step 24 made safe to re-run).
-- =============================================================================================

-- ---------------------------------------------------------------------------------------------
-- 20261105_feedback_22_departments.sql
-- ---------------------------------------------------------------------------------------------
-- Customer Feedback Tickets, step 22: the departments a ticket can go to.
--
-- feedback_departments: which org departments (org_units, admin > Departments) take feedback tickets,
-- and what kind of work each one does on a ticket:
--   OPERATIONS  the existing flow - the issue, the visit it is about and a re-visit booked in Jobs
--   ACCOUNTS    an invoice-related issue: its summary, priority and the customer's invoice(s)
-- The admin switches a department on or off in Feedback > Masters > Settings. People of an active
-- department (user_org_units) get the Feedback app next to Task Management, and see only the tickets
-- that have a part for their department.
--
-- Starts with the departments named 'Operations Team' and 'Accounts Team' when they exist; the admin
-- can point either kind at another department later. New table only. Safe to re-run.

CREATE TABLE IF NOT EXISTS `feedback_departments` (
  `kind`         ENUM('OPERATIONS','ACCOUNTS') NOT NULL,
  `org_unit_id`  CHAR(36)   NOT NULL,
  `is_active`    TINYINT(1) NOT NULL DEFAULT 1,
  `sort_order`   INT        NOT NULL DEFAULT 0,
  `updated_by`   BIGINT     NULL,
  `created_at`   DATETIME   NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME   NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`kind`),
  UNIQUE KEY `uniq_fd_org_unit` (`org_unit_id`),
  CONSTRAINT `fk_fd_org_unit` FOREIGN KEY (`org_unit_id`) REFERENCES `org_units` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT IGNORE INTO `feedback_departments` (`kind`, `org_unit_id`, `is_active`, `sort_order`)
SELECT 'OPERATIONS', u.id, 1, 1 FROM `org_units` u
WHERE u.name = 'Operations Team' AND u.is_active = 1
ORDER BY u.created_at LIMIT 1;

INSERT IGNORE INTO `feedback_departments` (`kind`, `org_unit_id`, `is_active`, `sort_order`)
SELECT 'ACCOUNTS', u.id, 1, 2 FROM `org_units` u
WHERE u.name = 'Accounts Team' AND u.is_active = 1
ORDER BY u.created_at LIMIT 1;

-- ---------------------------------------------------------------------------------------------
-- 20261105_feedback_23_ticket_parts.sql
-- ---------------------------------------------------------------------------------------------
-- Customer Feedback Tickets, step 23: a ticket's department parts.
--
-- One ticket (one FB number) can go to several departments; each gets a part:
--   OPERATIONS  uses the ticket's own columns (issue_summary, priority, action, visit, re-visit). Its
--               work is done when the re-visit is completed (or the action needs no visit).
--   ACCOUNTS    keeps its own issue_summary, priority and invoice_ids (JSON list of invoices.id of the
--               customer). The Accounts team marks it DONE with a note (e.g. "Invoice sent").
-- The follow-up call is due when every part is done; a satisfied customer then closes the ticket.
--
-- Every existing ticket gets an OPERATIONS part (that is what they were). Needs step 22.
-- New table + backfill. Safe to re-run.

CREATE TABLE IF NOT EXISTS `feedback_ticket_parts` (
  `id`             CHAR(36)     NOT NULL,
  `ticket_id`      CHAR(36)     NOT NULL,
  `kind`           ENUM('OPERATIONS','ACCOUNTS') NOT NULL,
  `issue_summary`  VARCHAR(500) NULL,
  `priority`       ENUM('LOW','MEDIUM','HIGH') NULL,
  `invoice_ids`    JSON         NULL,
  `status`         ENUM('PENDING','DONE') NOT NULL DEFAULT 'PENDING',
  `done_by`        BIGINT       NULL,
  `done_at`        DATETIME     NULL,
  `done_note`      VARCHAR(500) NULL,
  `created_at`     DATETIME     NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_ftp_ticket_kind` (`ticket_id`, `kind`),
  KEY `idx_ftp_kind_status` (`kind`, `status`),
  CONSTRAINT `fk_ftp_ticket`  FOREIGN KEY (`ticket_id`) REFERENCES `feedback_tickets` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ftp_done_by` FOREIGN KEY (`done_by`)   REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO `feedback_ticket_parts` (`id`, `ticket_id`, `kind`, `issue_summary`, `priority`)
SELECT UUID(), t.id, 'OPERATIONS', t.issue_summary, t.priority
FROM `feedback_tickets` t
WHERE NOT EXISTS (SELECT 1 FROM `feedback_ticket_parts` p WHERE p.ticket_id = t.id);

-- ---------------------------------------------------------------------------------------------
-- 20261105_feedback_24_department_questions.sql
-- ---------------------------------------------------------------------------------------------
-- Customer Feedback Tickets, step 24: department questions (made safe to re-run for this script).
ALTER TABLE `feedback_questions`
  MODIFY COLUMN `question_type` ENUM('GENERAL','SERVICE','DEPARTMENT') NOT NULL DEFAULT 'GENERAL';
SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'feedback_questions' AND COLUMN_NAME = 'departments');
SET @sql := IF(@has_col = 0, 'ALTER TABLE `feedback_questions` ADD COLUMN `departments` JSON NULL AFTER `services`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------------------------
-- 20261105_feedback_25_any_department_and_call_results.sql
-- ---------------------------------------------------------------------------------------------
-- Customer Feedback, step 25:
--
-- 1. Any department from the user hierarchy (org_units) can take feedback tickets, not only
--    Operations and Accounts. feedback_departments.kind and feedback_ticket_parts.kind become text
--    keys: OPERATIONS and ACCOUNTS stay as they are; a department the admin adds later gets a key
--    made from its name (for example QUALITY_TEAM). with_invoices = its ticket part can list the
--    customer's invoices (on for Accounts).
-- 2. A call whose last try was a wrong number shows as WRONG_NUMBER.
-- 3. A call closed because the customer never answered (calls missed and the form link expired
--    unused) is DONE with result NO_RESPONSE ("Not responded").
--
-- Widens columns only; existing rows keep their values. Safe to re-run.

ALTER TABLE `feedback_departments`
  MODIFY `kind` VARCHAR(40) NOT NULL;

SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'feedback_departments' AND COLUMN_NAME = 'with_invoices');
SET @sql := IF(@has_col = 0,
  'ALTER TABLE `feedback_departments` ADD COLUMN `with_invoices` TINYINT(1) NOT NULL DEFAULT 0 AFTER `is_active`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE `feedback_departments` SET `with_invoices` = 1 WHERE `kind` = 'ACCOUNTS';

ALTER TABLE `feedback_ticket_parts`
  MODIFY `kind` VARCHAR(40) NOT NULL;

ALTER TABLE `feedback_requests`
  MODIFY `status` ENUM('TO_CALL','NOT_ANSWERED','WRONG_NUMBER','FORM_SENT','FORM_RECEIVED','DONE') NOT NULL DEFAULT 'TO_CALL',
  MODIFY `result` ENUM('GOOD','ISSUE','NO_RESPONSE') NULL DEFAULT NULL;

-- ---------------------------------------------------------------------------------------------
-- 20261105_feedback_26_issue_types.sql
-- ---------------------------------------------------------------------------------------------
-- Customer Feedback, step 26: each department's issue types (Feedback Desk > Issues).
--
-- feedback_issue_types: the issues a ticket can raise for a department (feedback_departments.kind),
-- e.g. Operations: Services, Technicians, Grooming, Behaviour. When raising a ticket the collector
-- ticks one or more issues of each chosen department and types the details for each.
-- is_service = 1: the "Services" issue of Operations - it shows the month's services to pick (the
-- visit and technician go on the ticket) instead of a text box.
-- feedback_ticket_parts.issues: the issues ticked on that part, as
-- [{ "id": 3, "name": "Grooming", "text": "Technician came without uniform" }].
--
-- New permission FEEDBACK_ISSUES (manage departments and issue types), given to the Service
-- Coordinator role. Admin passes every check in code.
--
-- New table, a new column and permission rows only. Safe to re-run.

CREATE TABLE IF NOT EXISTS `feedback_issue_types` (
  `id`               INT          NOT NULL AUTO_INCREMENT,
  `department_kind`  VARCHAR(40)  NOT NULL,
  `name`             VARCHAR(100) NOT NULL,
  `is_service`       TINYINT(1)   NOT NULL DEFAULT 0,
  `sort_order`       INT          NOT NULL DEFAULT 0,
  `is_active`        TINYINT(1)   NOT NULL DEFAULT 1,
  `created_by`       BIGINT       NULL,
  `updated_by`       BIGINT       NULL,
  `created_at`       DATETIME     NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_fit_dept_name` (`department_kind`, `name`),
  KEY `idx_fit_dept` (`department_kind`, `is_active`, `sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Starting issues (the admin / service coordinator edit them later).
INSERT IGNORE INTO `feedback_issue_types` (`department_kind`, `name`, `is_service`, `sort_order`) VALUES
  ('OPERATIONS', 'Services',   1, 1),
  ('OPERATIONS', 'Technicians', 0, 2),
  ('OPERATIONS', 'Grooming',   0, 3),
  ('OPERATIONS', 'Behaviour',  0, 4),
  ('ACCOUNTS',   'Invoice not received', 0, 1),
  ('ACCOUNTS',   'Wrong invoice amount', 0, 2),
  ('ACCOUNTS',   'Payment not updated',  0, 3),
  ('ACCOUNTS',   'GST / billing details', 0, 4);

SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'feedback_ticket_parts' AND COLUMN_NAME = 'issues');
SET @sql := IF(@has_col = 0,
  'ALTER TABLE `feedback_ticket_parts` ADD COLUMN `issues` JSON NULL AFTER `issue_summary`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

INSERT INTO `permissions` (`name`)
SELECT 'FEEDBACK_ISSUES' WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `name` = 'FEEDBACK_ISSUES');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
WHERE r.name = 'Service Coordinator'
  AND p.name = 'FEEDBACK_ISSUES';

-- ---------------------------------------------------------------------------------------------
-- 20261105_feedback_27_very_high_priority.sql
-- ---------------------------------------------------------------------------------------------
-- Customer Feedback, step 27: a fourth priority, VERY_HIGH ("Very high"), above HIGH.
-- Widens the priority ENUMs of the feedback tables; existing values stay. Safe to re-run.

ALTER TABLE `feedback_tickets`
  MODIFY `priority`           ENUM('LOW','MEDIUM','HIGH','VERY_HIGH') NOT NULL,
  MODIFY `suggested_priority` ENUM('LOW','MEDIUM','HIGH','VERY_HIGH') NULL DEFAULT NULL;

ALTER TABLE `feedback_ticket_parts`
  MODIFY `priority` ENUM('LOW','MEDIUM','HIGH','VERY_HIGH') NULL DEFAULT NULL;

ALTER TABLE `feedback_question_options`
  MODIFY `suggested_priority` ENUM('LOW','MEDIUM','HIGH','VERY_HIGH') NULL DEFAULT NULL;

ALTER TABLE `feedback_responses`
  MODIFY `suggested_priority` ENUM('LOW','MEDIUM','HIGH','VERY_HIGH') NULL DEFAULT NULL;

-- ---------------------------------------------------------------------------------------------
-- 20261105_feedback_28_assigned_next_steps.sql
-- ---------------------------------------------------------------------------------------------
-- Customer Feedback, step 28: next steps done by one assigned person.
--
-- 1. Three more next steps on a ticket: SITE_AUDIT ("Site audit") and SUPERVISOR_VISIT
--    ("Supervisor visit") are assigned to a supervisor; SALES ("Sales") to a salesperson. The
--    person is stored in action_owner_user_id; they see the ticket and mark their step done.
-- 2. action_done_by / action_done_at / action_done_note: who marked the step done, when, and what
--    was done. The follow-up call to the customer opens after that.
--
-- Widens a column and adds new ones; existing rows keep their values. Safe to re-run.

ALTER TABLE `feedback_tickets`
  MODIFY `action` ENUM('RESOLVED_ON_CALL','SCHEDULE_REVISIT','ESCALATE_OPERATIONS','OTHER','SITE_AUDIT','SUPERVISOR_VISIT','SALES') NOT NULL;

SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'feedback_tickets' AND COLUMN_NAME = 'action_done_at');
SET @sql := IF(@has_col = 0,
  'ALTER TABLE `feedback_tickets`
     ADD COLUMN `action_done_by` BIGINT NULL DEFAULT NULL AFTER `action_note`,
     ADD COLUMN `action_done_at` DATETIME NULL DEFAULT NULL AFTER `action_done_by`,
     ADD COLUMN `action_done_note` VARCHAR(500) NULL DEFAULT NULL AFTER `action_done_at`,
     ADD CONSTRAINT `fk_ft_action_done_by` FOREIGN KEY (`action_done_by`) REFERENCES `users` (`id`)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------------------------
-- 20261105_feedback_29_call_schedules.sql
-- ---------------------------------------------------------------------------------------------
-- Customer Feedback, step 29: call schedules (Feedback Desk > Masters > Call schedule).
--
-- Feedback calls are no longer one per site every month. A site gets calls only when a schedule
-- covers it; sites without one get no calls.
--
-- feedback_schedules: one rule for a customer (all its sites, site_id NULL) or for one site (a
-- site's own rule wins over its customer's rule).
--   mode EVERY_N_DAYS        a call every `every_days` days (7, 15, 30...) from start_date, when the
--                            site had a service since the last call.
--   mode AFTER_EACH_SERVICE  a call the day after each service; first_services = only the first N
--                            services of the customer / site (e.g. a new customer's first 3), then
--                            then_every_days (or no more calls when NULL). first_services NULL =
--                            after every service.
--   service_types            only these services count (JSON list of service names); NULL = all.
--   start_date / end_date    when the rule applies (end_date NULL = no end).
--
-- feedback_requests (a call) gets its own dates: due_date (the day it is to be made) and
-- period_start / period_end (the services it asks about: from period_start, before period_end). period_month
-- stays (the month of due_date) so tickets and reports by month keep working. Calls before this
-- step keep their month: due_date = the 1st of that month.
-- One call per site and due date (was: one per site and month).
--
-- New permission FEEDBACK_SCHEDULE (manage call schedules) for Service Coordinator and Operations
-- Manager. Admin passes every check in code.
--
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS `feedback_schedules` (
  `id`               INT          NOT NULL AUTO_INCREMENT,
  `company_id`       VARCHAR(20)  NOT NULL,
  `site_id`          VARCHAR(20)  NULL DEFAULT NULL,
  `mode`             ENUM('EVERY_N_DAYS','AFTER_EACH_SERVICE') NOT NULL,
  `every_days`       INT          NULL DEFAULT NULL,
  `first_services`   INT          NULL DEFAULT NULL,
  `then_every_days`  INT          NULL DEFAULT NULL,
  `service_types`    JSON         NULL,
  `start_date`       DATE         NOT NULL,
  `end_date`         DATE         NULL DEFAULT NULL,
  `note`             VARCHAR(300) NULL DEFAULT NULL,
  `is_active`        TINYINT(1)   NOT NULL DEFAULT 1,
  `created_by`       BIGINT       NULL,
  `updated_by`       BIGINT       NULL,
  `created_at`       DATETIME     NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_fs_company` (`company_id`, `is_active`),
  KEY `idx_fs_site` (`site_id`, `is_active`),
  CONSTRAINT `fk_fs_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_fs_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- The call's own dates and the schedule that made it.
SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'feedback_requests' AND COLUMN_NAME = 'due_date');
SET @sql := IF(@has_col = 0,
  'ALTER TABLE `feedback_requests`
     ADD COLUMN `due_date` DATE NULL DEFAULT NULL AFTER `period_month`,
     ADD COLUMN `period_start` DATE NULL DEFAULT NULL AFTER `due_date`,
     ADD COLUMN `period_end` DATE NULL DEFAULT NULL AFTER `period_start`,
     ADD COLUMN `schedule_id` INT NULL DEFAULT NULL AFTER `period_end`,
     ADD KEY `idx_freq_due` (`due_date`, `status`),
     ADD CONSTRAINT `fk_freq_schedule` FOREIGN KEY (`schedule_id`) REFERENCES `feedback_schedules` (`id`) ON DELETE SET NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Calls from before: their month's 1st is the due date, the whole month their services.
UPDATE `feedback_requests` SET `due_date` = `period_month` WHERE `due_date` IS NULL;
UPDATE `feedback_requests` SET `period_start` = `period_month` WHERE `period_start` IS NULL;
UPDATE `feedback_requests` SET `period_end` = DATE_ADD(`period_month`, INTERVAL 1 MONTH) WHERE `period_end` IS NULL;
ALTER TABLE `feedback_requests` MODIFY `due_date` DATE NOT NULL, MODIFY `period_start` DATE NOT NULL, MODIFY `period_end` DATE NOT NULL;

-- One call per site and due date (was one per site and month).
SET @has_new := (SELECT COUNT(*) FROM information_schema.STATISTICS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'feedback_requests' AND INDEX_NAME = 'uniq_freq_site_due');
SET @sql := IF(@has_new = 0, 'ALTER TABLE `feedback_requests` ADD UNIQUE KEY `uniq_freq_site_due` (`site_id`, `due_date`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_old := (SELECT COUNT(*) FROM information_schema.STATISTICS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'feedback_requests' AND INDEX_NAME = 'uniq_freq_site_month');
SET @sql := IF(@has_old > 0, 'ALTER TABLE `feedback_requests` DROP INDEX `uniq_freq_site_month`, ADD KEY `idx_freq_site_month` (`site_id`, `period_month`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Who manages the schedules.
INSERT INTO `permissions` (`name`)
SELECT 'FEEDBACK_SCHEDULE' WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `name` = 'FEEDBACK_SCHEDULE');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
WHERE r.name IN ('Service Coordinator', 'Operations Manager')
  AND p.name = 'FEEDBACK_SCHEDULE';

-- ---------------------------------------------------------------------------------------------
-- 20261105_feedback_30_schedule_month_days.sql
-- ---------------------------------------------------------------------------------------------
-- Customer Feedback, step 30: call schedules on dates of the month.
--
-- feedback_schedules.mode MONTH_DAYS: a call on the given days of every month (month_days, e.g.
-- [1] = the 1st of every month, [1, 15] = the 1st and the 15th; 31 = the month's last day in
-- shorter months) - when the site had a service since the last call.
--
-- Widens a column and adds one; existing rows keep their values. Safe to re-run.

ALTER TABLE `feedback_schedules`
  MODIFY `mode` ENUM('EVERY_N_DAYS','AFTER_EACH_SERVICE','MONTH_DAYS') NOT NULL;

SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'feedback_schedules' AND COLUMN_NAME = 'month_days');
SET @sql := IF(@has_col = 0,
  'ALTER TABLE `feedback_schedules` ADD COLUMN `month_days` JSON NULL AFTER `then_every_days`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------------------------
-- 20261105_feedback_31_number_requests.sql
-- ---------------------------------------------------------------------------------------------
-- Customer Feedback, step 31: requests for the right number (Feedback Desk > Requests).
--
-- When a call reaches a wrong number, the collector sends a request; the service coordinator (or a
-- desk manager) finds the right number and saves it on the site's contacts. The call goes back on
-- the collector's list to call again.
--
-- feedback_number_requests: one row per request.
--   request_id / site_id / company_id  the call and its site
--   contact_id, wrong_name, wrong_phone the contact / number that was wrong
--   note                               what the collector adds
--   status                             OPEN, DONE (right number saved) or CANCELLED (by the collector)
--   new_contact_id, new_name, new_phone the right number saved; resolve_note
--
-- New table only. Safe to re-run.

CREATE TABLE IF NOT EXISTS `feedback_number_requests` (
  `id`              CHAR(36)     NOT NULL,
  `request_id`      CHAR(36)     NOT NULL,
  `company_id`      VARCHAR(20)  NOT NULL,
  `site_id`         VARCHAR(20)  NOT NULL,
  `contact_id`      CHAR(36)     NULL DEFAULT NULL,
  `wrong_name`      VARCHAR(150) NULL DEFAULT NULL,
  `wrong_phone`     VARCHAR(20)  NULL DEFAULT NULL,
  `note`            VARCHAR(500) NULL DEFAULT NULL,
  `status`          ENUM('OPEN','DONE','CANCELLED') NOT NULL DEFAULT 'OPEN',
  `requested_by`    BIGINT       NOT NULL,
  `requested_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `resolved_by`     BIGINT       NULL DEFAULT NULL,
  `resolved_at`     DATETIME     NULL DEFAULT NULL,
  `new_contact_id`  CHAR(36)     NULL DEFAULT NULL,
  `new_name`        VARCHAR(150) NULL DEFAULT NULL,
  `new_phone`       VARCHAR(20)  NULL DEFAULT NULL,
  `resolve_note`    VARCHAR(500) NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_fnr_status` (`status`, `requested_at`),
  KEY `idx_fnr_call` (`request_id`),
  KEY `idx_fnr_by` (`requested_by`, `status`),
  CONSTRAINT `fk_fnr_call` FOREIGN KEY (`request_id`) REFERENCES `feedback_requests` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_fnr_requested_by` FOREIGN KEY (`requested_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_fnr_resolved_by` FOREIGN KEY (`resolved_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =============================================================================================
-- Checks (each should return rows / the values shown)
-- =============================================================================================
SELECT kind, with_invoices, is_active FROM feedback_departments;                       -- OPERATIONS, ACCOUNTS ...
SELECT department_kind, COUNT(*) AS issues FROM feedback_issue_types GROUP BY department_kind;
SHOW COLUMNS FROM feedback_tickets LIKE 'action';                                       -- ... 'SITE_AUDIT','SUPERVISOR_VISIT','SALES'
SHOW COLUMNS FROM feedback_tickets LIKE 'priority';                                     -- ... 'VERY_HIGH'
SHOW COLUMNS FROM feedback_requests LIKE 'due_date';                                    -- date, NOT NULL
SHOW INDEX FROM feedback_requests WHERE Key_name = 'uniq_freq_site_due';
SHOW COLUMNS FROM feedback_schedules LIKE 'month_days';
SHOW TABLES LIKE 'feedback_number_requests';
SELECT r.name AS role, p.name AS permission FROM role_permissions rp
  JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id
  WHERE p.name IN ('FEEDBACK_ISSUES', 'FEEDBACK_SCHEDULE') ORDER BY p.name, r.name;     -- Service Coordinator, Operations Manager

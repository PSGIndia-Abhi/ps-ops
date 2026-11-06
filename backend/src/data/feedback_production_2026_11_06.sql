-- =============================================================================================
-- Customer Feedback - database changes made TODAY (6 Nov 2026): steps 32 and 33.
--
--   Step 32  Role access: Service Coordinator gets FEEDBACK_VIEW (Dashboard + Customer report);
--            Operations Manager gets FEEDBACK_ADMIN (Questions, Issues, Templates & settings).
--   Step 33  A file attached when a department marks its part of a ticket done
--            (3 new columns on feedback_ticket_parts).
--
-- Both steps are safe to run again. Everything else changed today is code only (backend, website,
-- Android app) - no other database change.
--
-- How to run (production):
--   1. Backup:  mysqldump -u <user> -p <database> > backup_before_feedback_2026_11_06.sql
--   2. Run:     mysql -u <user> -p <database> < feedback_production_2026_11_06.sql
--   3. Check the results at the bottom, then deploy the backend, the website and the new app.
-- =============================================================================================

-- Step 32 · 20261106_feedback_32_role_access.sql
-- ---------------------------------------------------------------------------------------------
-- Customer Feedback, step 32: who sees which Feedback Desk screens.
--
--   Service Coordinator  + FEEDBACK_VIEW   the Dashboard (calls, read-only) and the Customer report,
--                                           next to Issues, Call schedule and Requests they have.
--   Operations Manager   + FEEDBACK_ADMIN  Masters: Questions, Issues, Templates & settings.
--
-- Permission rows only. Safe to re-run.

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
WHERE r.name = 'Service Coordinator'
  AND p.name = 'FEEDBACK_VIEW';

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
WHERE r.name = 'Operations Manager'
  AND p.name = 'FEEDBACK_ADMIN';

-- ---------------------------------------------------------------------------------------------
-- Step 33 · 20261106_feedback_33_part_attachments.sql
-- ---------------------------------------------------------------------------------------------
-- Customer Feedback, step 33: a file attached when a department marks its part of a ticket done.
--
-- feedback_ticket_parts gets attachment_key (the file in MinIO), attachment_name (the file's name)
-- and attachment_type (its content type). One file per department part, optional; e.g. the invoice
-- copy the Accounts Team sent.
--
-- Adds columns only; existing rows keep their values. Safe to re-run.

SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'feedback_ticket_parts' AND COLUMN_NAME = 'attachment_key');
SET @sql := IF(@has_col = 0,
  'ALTER TABLE `feedback_ticket_parts`
     ADD COLUMN `attachment_key` VARCHAR(255) NULL DEFAULT NULL AFTER `done_note`,
     ADD COLUMN `attachment_name` VARCHAR(255) NULL DEFAULT NULL AFTER `attachment_key`,
     ADD COLUMN `attachment_type` VARCHAR(120) NULL DEFAULT NULL AFTER `attachment_name`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- =============================================================================================
-- Checks
-- =============================================================================================
SELECT r.name AS role, p.name AS permission FROM role_permissions rp
  JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id
  WHERE (r.name = 'Service Coordinator' AND p.name = 'FEEDBACK_VIEW')
     OR (r.name = 'Operations Manager' AND p.name = 'FEEDBACK_ADMIN');               -- 2 rows
SHOW COLUMNS FROM feedback_ticket_parts LIKE 'attachment%';                         -- 3 rows

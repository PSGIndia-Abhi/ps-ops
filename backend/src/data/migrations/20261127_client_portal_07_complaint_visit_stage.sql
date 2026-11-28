-- Client complaints: new stage "Visit scheduled" between In progress and Resolved, with the
-- optional visit date / time the Feedback Desk enters (shown to the client).
--
--   job_tickets.status      + 'VISIT_SCHEDULED'   (Raised -> In progress -> Visit scheduled -> Resolved -> Closed)
--   job_tickets.visit_date  DATE NULL             the scheduled visit day
--   job_tickets.visit_slot  VARCHAR(40) NULL      free text time, e.g. "3 - 5 PM"
--
-- Existing values keep working; no data is changed. Safe to re-run.

ALTER TABLE `job_tickets`
  MODIFY COLUMN `status` ENUM('OPEN','IN_PROGRESS','VISIT_SCHEDULED','RESOLVED','CLOSED') NOT NULL DEFAULT 'OPEN';

SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'job_tickets' AND COLUMN_NAME = 'visit_date');
SET @sql := IF(@has_col = 0,
  'ALTER TABLE `job_tickets` ADD COLUMN `visit_date` DATE NULL AFTER `category`, ADD COLUMN `visit_slot` VARCHAR(40) NULL AFTER `visit_date`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

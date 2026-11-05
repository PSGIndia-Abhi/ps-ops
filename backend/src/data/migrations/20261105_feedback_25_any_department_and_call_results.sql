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

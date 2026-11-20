-- Commercial lead conversions: the conversion date can now be chosen (backdated) by the Managing
-- Director / Personal Assistant, for customers who were converted before the app was in use.
--
-- converted_at stays the business date the conversion counts on (targets, reports, Excel).
-- recorded_at is new: when the conversion was actually entered in the app - never changed, so a
-- backdated conversion can always be told apart.
--
-- Existing rows get recorded_at = their converted_at (that is when they were entered). Adds a
-- column only; nothing else changes. Safe to re-run.
--
-- Run this BEFORE deploying the backend that reads recorded_at.

SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_lead_conversions' AND COLUMN_NAME = 'recorded_at');
SET @sql := IF(@has_col = 0,
  'ALTER TABLE `crm_lead_conversions` ADD COLUMN `recorded_at` DATETIME NULL DEFAULT NULL AFTER `converted_at`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE `crm_lead_conversions` SET `recorded_at` = `converted_at` WHERE `recorded_at` IS NULL;

ALTER TABLE `crm_lead_conversions`
  MODIFY COLUMN `recorded_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

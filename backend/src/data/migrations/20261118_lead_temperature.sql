-- Commercial leads: Hot / Warm / Cold - how interested the customer is (separate from the stage).
--
-- Set by the people who own leads: Sales Executive, Sales Manager, Managing Director, Personal
-- Assistant (and admin). Optional - existing leads stay NULL (not set). Every change is also written
-- to crm_lead_history as TEMPERATURE_SET, so the lead's timeline shows who changed it and when.
--
--   lead_temperature    'HOT' | 'WARM' | 'COLD' | NULL
--   temperature_set_by  users.id of who set it last
--   temperature_set_at  when it was set last
--
-- Adds columns only; nothing else changes. Safe to re-run.
-- The backend reads these columns only if they exist, so the order of running this and deploying
-- does not break anything - but the feature shows nothing until this has been run.

SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_leads' AND COLUMN_NAME = 'lead_temperature');
SET @sql := IF(@has_col = 0,
  'ALTER TABLE `crm_leads`
     ADD COLUMN `lead_temperature` VARCHAR(10) NULL DEFAULT NULL AFTER `pipeline_stage`,
     ADD COLUMN `temperature_set_by` BIGINT NULL DEFAULT NULL AFTER `lead_temperature`,
     ADD COLUMN `temperature_set_at` DATETIME NULL DEFAULT NULL AFTER `temperature_set_by`,
     ADD KEY `idx_crm_leads_temperature` (`lead_temperature`)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

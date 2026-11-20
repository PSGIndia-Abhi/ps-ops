-- Invoice generation: Termite contracts billed daily, weekly or monthly.
--
--   billing_contracts.frequency_unit   MONTH (every frequency_months months, as before),
--                                      WEEK  (every week: 7-day periods from the first bill date),
--                                      DAY   (every day: one-day periods)
--
-- Only Termite contracts can be WEEK or DAY; frequency_months stays 1 for them. Every existing
-- contract is MONTH and bills exactly as before. A weekly / daily contract gets one invoice per
-- period: the month's Bill Run drafts every period of it that is due in that month.
--
-- One new column only: nothing existing changes. Run once (after 20261125_billing_group_contracts.sql).
-- Safe to re-run. In phpMyAdmin, select the ps_ops database in the left panel first (or keep the USE line).

USE ps_ops;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_contracts' AND COLUMN_NAME = 'frequency_unit');
SET @sql := IF(@has = 0,
  'ALTER TABLE billing_contracts
     ADD COLUMN frequency_unit ENUM(''MONTH'',''WEEK'',''DAY'') NOT NULL DEFAULT ''MONTH'' AFTER frequency_months',
  'SELECT ''billing_contracts.frequency_unit already exists'' AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

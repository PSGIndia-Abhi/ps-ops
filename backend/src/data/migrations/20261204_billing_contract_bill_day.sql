-- Contract billing: "Bill date" typed as a day of the month.
--
-- New Contract / Edit contract: the Bill date is typed as a day (1-31). The Bill Run dates the
-- contract's invoices on that day of the bill month (its last day when the month is shorter), or
-- today when that day is still to come. Start / End of the month (bill_timing) still decides which
-- month a period is billed in.
--
--   billing_contracts.bill_day   TINYINT UNSIGNED NULL  (NULL = dated the day the Bill Run makes it: as before)
--
-- New optional column only; every existing contract gets NULL, so existing billing is unchanged.
-- Run once. Safe to re-run. In phpMyAdmin, select the ps_ops database in the left panel first (or
-- keep the USE line).

USE ps_ops;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_contracts' AND COLUMN_NAME = 'bill_day');
SET @sql := IF(@has = 0,
  'ALTER TABLE billing_contracts ADD COLUMN bill_day TINYINT UNSIGNED NULL DEFAULT NULL AFTER bill_timing',
  'SELECT ''billing_contracts.bill_day already exists'' AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

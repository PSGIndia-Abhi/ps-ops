-- Invoice generation:
--   1. "Service Offered To" address for a group based contract (as a customer's billing details have).
--   2. Termite POs: the rate per sq. ft / sq. m fixed on the PO (the unit is po_area_unit).
--
--   billing_group_profiles.service_offered_to   VARCHAR(1000) NULL  (NULL = not printed: as before)
--   customer_pos.po_rate                         DECIMAL(14,4) NULL  (NULL = no rate on the PO: as before)
--
-- New optional columns only; existing rows get NULL, so nothing existing changes.
-- Run once, after 20261205. Safe to re-run. In phpMyAdmin, select the ps_ops database in the left
-- panel first (or keep the USE line).

USE ps_ops;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_group_profiles' AND COLUMN_NAME = 'service_offered_to');
SET @sql := IF(@has = 0,
  'ALTER TABLE billing_group_profiles ADD COLUMN service_offered_to VARCHAR(1000) NULL DEFAULT NULL AFTER billing_address',
  'SELECT ''billing_group_profiles.service_offered_to already exists'' AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_pos' AND COLUMN_NAME = 'po_rate');
SET @sql := IF(@has = 0,
  'ALTER TABLE customer_pos ADD COLUMN po_rate DECIMAL(14,4) NULL DEFAULT NULL AFTER po_area_unit',
  'SELECT ''customer_pos.po_rate already exists'' AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

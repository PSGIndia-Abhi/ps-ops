-- Invoice generation: "Service Offered To" address on the customer's billing details.
--
-- New Contract step 1 / Billing details: ticking "Service Offered To" lets a different address be typed;
-- the invoices then print it under "Service Offered To" instead of the outlet / billing address.
--
--   billing_profiles.service_offered_to   VARCHAR(1000) NULL  (NULL = not used: as before)
--
-- New optional column only; every existing profile gets NULL, so existing invoices are unchanged.
-- Run once. Safe to re-run. In phpMyAdmin, select the ps_ops database in the left panel first (or
-- keep the USE line).

USE ps_ops;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_profiles' AND COLUMN_NAME = 'service_offered_to');
SET @sql := IF(@has = 0,
  'ALTER TABLE billing_profiles ADD COLUMN service_offered_to VARCHAR(1000) NULL DEFAULT NULL AFTER billing_address',
  'SELECT ''billing_profiles.service_offered_to already exists'' AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

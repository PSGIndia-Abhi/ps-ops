-- Invoice delivery: CC addresses for the invoice email.
--
-- Print & email: next to "Email invoice to", the invoices can be copied (CC) to more addresses.
-- The automatic email on issue sends To the invoice emails and CC to these.
--
--   billing_profiles.invoice_cc_emails   VARCHAR(1000) NULL  (comma separated; NULL = no CC: as before)
--
-- New optional column only; every existing profile gets NULL, so existing emails are unchanged.
-- Run once, after 20261207. Safe to re-run. In phpMyAdmin, select the ps_ops database in the left
-- panel first (or keep the USE line).

USE ps_ops;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_profiles' AND COLUMN_NAME = 'invoice_cc_emails');
SET @sql := IF(@has = 0,
  'ALTER TABLE billing_profiles ADD COLUMN invoice_cc_emails VARCHAR(1000) NULL DEFAULT NULL AFTER invoice_emails',
  'SELECT ''billing_profiles.invoice_cc_emails already exists'' AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

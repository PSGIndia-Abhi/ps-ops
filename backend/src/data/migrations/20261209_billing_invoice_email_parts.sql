-- Invoice delivery: the invoice email as parts - each part its own email with its own To and CC.
--
-- Print & email: "+ Add email" adds a part (a To box and a CC box together). When an invoice is
-- issued, each part is sent as a separate email, so each To sees only its own CC.
--
--   billing_profiles.invoice_email_parts   JSON NULL   [{ "to": [...], "cc": [...] }, ...]
--
-- NULL = not set: the invoice goes as one email to invoice_emails with invoice_cc_emails in CC (as
-- before). invoice_emails / invoice_cc_emails are still kept (every To / every CC) for the screens.
-- New optional column only; nothing existing changes.
-- Run once, after 20261208. Safe to re-run. In phpMyAdmin, select the ps_ops database in the left
-- panel first (or keep the USE line).

USE ps_ops;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_profiles' AND COLUMN_NAME = 'invoice_email_parts');
SET @sql := IF(@has = 0,
  'ALTER TABLE billing_profiles ADD COLUMN invoice_email_parts JSON NULL DEFAULT NULL AFTER invoice_cc_emails',
  'SELECT ''billing_profiles.invoice_email_parts already exists'' AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

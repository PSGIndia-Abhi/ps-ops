-- Optional email for the accountant's customer contacts (customer_payment_contacts).
--
-- For a database where the table was created before the email column was part of
-- 20261009_create_customer_payment_contacts.sql. Existing rows keep a NULL email.
-- Safe to re-run: the column is only added if it's missing.

SET @has_email := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_payment_contacts' AND COLUMN_NAME = 'email'
);
SET @sql := IF(@has_email = 0,
  'ALTER TABLE `customer_payment_contacts` ADD COLUMN `email` VARCHAR(150) NULL AFTER `phone`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

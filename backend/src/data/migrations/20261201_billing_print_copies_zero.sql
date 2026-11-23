-- Invoice generation: print copies - 0 allowed, and no small upper limit.
--
-- 0 copies = nothing is printed automatically when an invoice is issued (Print on the invoice page
-- still prints one copy by hand). Any number of copies can be typed: the columns were TINYINT (at
-- most 127) with a rule of 1 to 4; they become SMALLINT UNSIGNED (0 to 65535) with no 1-4 rule.
--
--   billing_profiles.print_copies         TINYINT -> SMALLINT UNSIGNED
--   billing_outlet_settings.print_copies  TINYINT -> SMALLINT UNSIGNED, CHECK 1-4 dropped
--   billing_invoices.print_copies         TINYINT -> SMALLINT UNSIGNED, CHECK 1-4 dropped
--
-- Existing values are kept as they are (all 1 or more). Default stays 1.
-- Run once. Safe to re-run. In phpMyAdmin, select the ps_ops database in the left panel first (or
-- keep the USE line).

USE ps_ops;

-- the old 1-4 rules (a CHECK must go before its column can change)
SET @has := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
              WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_invoices' AND CONSTRAINT_NAME = 'chk_binv_copies');
SET @sql := IF(@has > 0, 'ALTER TABLE billing_invoices DROP CHECK chk_binv_copies', 'SELECT ''chk_binv_copies already removed'' AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
              WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_outlet_settings' AND CONSTRAINT_NAME = 'chk_bos_copies');
SET @sql := IF(@has > 0, 'ALTER TABLE billing_outlet_settings DROP CHECK chk_bos_copies', 'SELECT ''chk_bos_copies already removed'' AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- the columns: 0 to 65535 copies
ALTER TABLE billing_profiles        MODIFY COLUMN print_copies SMALLINT UNSIGNED NOT NULL DEFAULT 1;
ALTER TABLE billing_outlet_settings MODIFY COLUMN print_copies SMALLINT UNSIGNED NOT NULL DEFAULT 1;
ALTER TABLE billing_invoices        MODIFY COLUMN print_copies SMALLINT UNSIGNED NOT NULL DEFAULT 1;

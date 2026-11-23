-- =====================================================================
-- PRODUCTION SQL - Billing / Invoice Generation, update of 2026-11-23
--
-- Run AFTER prod_release_billing_2026-11-22.sql (that file must have been run first: these steps
-- change billing tables it creates). Back up the production database first, select it
-- (phpMyAdmin: click it in the left panel), then run the whole file.
-- Every step is safe to re-run. Nothing is deleted: one new table, one new optional column, and two
-- column changes that keep every existing value.
--
-- Parts:
--   PART 1  Files attached to the monthly SOS (sent with the invoice email)
--   PART 2  Print copies: 0 allowed, no 1-4 limit
--   PART 3  Rate per service with 4 decimals
--   PART 4  Service Offered To address on the billing details
--   PART 5  Final checks
-- =====================================================================


-- =====================================================================
-- PART 1 - Files attached to the monthly SOS (sent with the invoice email)
-- Same as backend/src/data/migrations/20261130_billing_sos_files.sql
-- =====================================================================
-- Invoice generation: files attached to the monthly SOS.
--
-- The Service Coordinator can attach files (service reports, signed job sheets, photos) to a
-- customer's SOS for a month - optional, up to 10 files of 10 MB each, any file format.
-- Accounts see them on the SOS, on the draft invoice and on the issued invoice, and they are
-- attached to the invoice email (manual "Email" and the automatic email on issue) for every month
-- the invoice period covers.
--
--   billing_sos_files   one row per file; the file itself is in MinIO (object_key)
--
-- Keyed by customer + month (not by billing_sos.id) so files can be attached before the SOS is saved.
-- New table only. Safe to re-run. Run after 20261129_billing_manual_invoices.sql.
-- In phpMyAdmin, select the ps_ops database in the left panel first.

CREATE TABLE IF NOT EXISTS billing_sos_files (
  id           CHAR(36)      NOT NULL,
  company_id   VARCHAR(20)   NOT NULL,
  month        DATE          NOT NULL,                 -- first day of the month
  object_key   VARCHAR(500)  NOT NULL,
  file_name    VARCHAR(255)  NOT NULL,
  file_type    VARCHAR(150)  NULL,
  file_size    INT           NOT NULL DEFAULT 0,
  uploaded_by  BIGINT        NULL,
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sosf_month (company_id, month),
  CONSTRAINT fk_sosf_company  FOREIGN KEY (company_id)  REFERENCES companies (id),
  CONSTRAINT fk_sosf_uploaded FOREIGN KEY (uploaded_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Invoice generation: files attached to the monthly SOS (sent with the invoice email)';

-- Rollback: DROP TABLE billing_sos_files;  (the files stay in MinIO under billing/sos/)


-- =====================================================================
-- PART 2 - Print copies: 0 allowed, no 1-4 limit
-- Same as backend/src/data/migrations/20261201_billing_print_copies_zero.sql
-- =====================================================================
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

-- (USE line removed: select the production database first)
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


-- =====================================================================
-- PART 3 - Rate per service with 4 decimals
-- Same as backend/src/data/migrations/20261202_billing_rate_4_decimals.sql
-- =====================================================================
-- Invoice generation: rate per service with 4 decimals.
--
-- New contract › Services: a month amount can be typed; it is divided by the services per month into
-- the rate per service. 18,500 a month for 12 services is 1,541.6667 per service; with 2 decimals
-- (1,541.67) the month came to 18,500.04. With 4 decimals: 1,541.6667 x 12 = 18,500.00.
--
--   billing_contract_lines.rate  DECIMAL(12,2) -> DECIMAL(14,4)
--   billing_invoice_lines.rate   DECIMAL(12,2) -> DECIMAL(14,4)   (copied from the contract line)
--
-- Only the rate gets more decimals. Amounts, GST and totals stay at 2 decimals (rupees and paise);
-- screens and invoices show the rate with 2 decimals. Existing rates keep their value (e.g. 896.00
-- becomes 896.0000). NOT NULL and the "rate >= 0" rule are kept.
-- Run once. Safe to re-run. In phpMyAdmin, select the ps_ops database in the left panel first (or
-- keep the USE line).

-- (USE line removed: select the production database first)
ALTER TABLE billing_contract_lines MODIFY COLUMN rate DECIMAL(14,4) NOT NULL;
ALTER TABLE billing_invoice_lines  MODIFY COLUMN rate DECIMAL(14,4) NOT NULL;


-- =====================================================================
-- PART 4 - Service Offered To address on the billing details
-- Same as backend/src/data/migrations/20261203_billing_service_offered_to.sql
-- =====================================================================
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

-- (USE line removed: select the production database first)
SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_profiles' AND COLUMN_NAME = 'service_offered_to');
SET @sql := IF(@has = 0,
  'ALTER TABLE billing_profiles ADD COLUMN service_offered_to VARCHAR(1000) NULL DEFAULT NULL AFTER billing_address',
  'SELECT ''billing_profiles.service_offered_to already exists'' AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- =====================================================================
-- PART 5 - Final checks (every row should say OK)
-- =====================================================================
SELECT t.object, IF(t.found > 0, 'OK', 'MISSING - tell the developer') AS result FROM (
  SELECT 'table billing_sos_files' AS object, (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_sos_files') AS found
  UNION ALL SELECT 'print copies allow 0 (no 1-4 rule)', (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_invoices' AND COLUMN_NAME = 'print_copies' AND COLUMN_TYPE LIKE 'smallint%')
  UNION ALL SELECT 'rate with 4 decimals (contract lines)', (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_contract_lines' AND COLUMN_NAME = 'rate' AND NUMERIC_SCALE = 4)
  UNION ALL SELECT 'rate with 4 decimals (invoice lines)', (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_invoice_lines' AND COLUMN_NAME = 'rate' AND NUMERIC_SCALE = 4)
  UNION ALL SELECT 'column billing_profiles.service_offered_to', (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_profiles' AND COLUMN_NAME = 'service_offered_to')
) t;

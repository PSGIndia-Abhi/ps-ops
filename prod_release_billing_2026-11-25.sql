-- =====================================================================
-- PRODUCTION SQL - Billing / Invoice Generation, update of 2026-11-25
--
-- Run AFTER prod_release_billing_2026-11-23.sql. Back up the production database first, select it
-- (phpMyAdmin: click it in the left panel), then run the whole file.
-- Every step is safe to re-run. Nothing is deleted or changed: one new table and new optional
-- columns only (existing rows get NULL, so existing billing behaves as before).
--
-- Parts:
--   PART 1  Contract "Bill date" as a day of the month         (20261204)
--   PART 2  Area on Termite POs                                 (20261205)
--   PART 3  Group "Service Offered To" + rate on Termite POs    (20261206)
--   PART 4  PO area + rate per unit (sq.ft and sq.m)            (20261207)
--   PART 5  CC addresses for the invoice email                  (20261208)
--   PART 6  Invoice email as parts (own To + CC each)           (20261209)
--   PART 7  Final checks
--
-- Do NOT run backend/src/data/cleanup/delete_all_billing_contracts.sql - it is not part of this release.
-- =====================================================================


-- =====================================================================
-- PART 1 - Same as backend/src/data/migrations/20261204_billing_contract_bill_day.sql
-- =====================================================================
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


SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_contracts' AND COLUMN_NAME = 'bill_day');
SET @sql := IF(@has = 0,
  'ALTER TABLE billing_contracts ADD COLUMN bill_day TINYINT UNSIGNED NULL DEFAULT NULL AFTER bill_timing',
  'SELECT ''billing_contracts.bill_day already exists'' AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- =====================================================================
-- PART 2 - Same as backend/src/data/migrations/20261205_billing_po_area.sql
-- =====================================================================
-- Purchase orders: area (sq. ft / sq. m) on Termite POs.
--
-- A Termite PO can carry the treated area it covers, next to its amount. Like the amount, the area
-- billed on issued invoices carrying the PO is counted against it (Area / Used / Balance); going over
-- only warns on the draft.
--
--   customer_pos.po_area        DECIMAL(14,2) NULL  (NULL = no area on the PO: as before)
--   customer_pos.po_area_unit   VARCHAR(10)   NULL  ('sq.ft' or 'sq.m': the unit the area is in)
--
-- New optional columns only; every existing PO gets NULL, so nothing existing changes.
-- Run once. Safe to re-run. In phpMyAdmin, select the ps_ops database in the left panel first (or
-- keep the USE line).


SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_pos' AND COLUMN_NAME = 'po_area');
SET @sql := IF(@has = 0,
  'ALTER TABLE customer_pos ADD COLUMN po_area DECIMAL(14,2) NULL DEFAULT NULL AFTER po_amount',
  'SELECT ''customer_pos.po_area already exists'' AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_pos' AND COLUMN_NAME = 'po_area_unit');
SET @sql := IF(@has = 0,
  'ALTER TABLE customer_pos ADD COLUMN po_area_unit VARCHAR(10) NULL DEFAULT NULL AFTER po_area',
  'SELECT ''customer_pos.po_area_unit already exists'' AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- =====================================================================
-- PART 3 - Same as backend/src/data/migrations/20261206_billing_group_service_to_po_rate.sql
-- =====================================================================
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

-- =====================================================================
-- PART 4 - Same as backend/src/data/migrations/20261207_billing_po_area_rates.sql
-- =====================================================================
-- Purchase orders: area and rate for BOTH square feet and square meter on one Termite PO.
--
-- A PO can now carry an area and a rate per unit for sq. ft, for sq. m, or for both (one row per
-- unit). The area billed on issued invoices in that unit is deducted from that unit's area.
--
--   customer_po_area_rates (po_id, unit 'sq.ft' / 'sq.m', area, rate)   one row per PO and unit
--
-- Areas saved earlier on customer_pos (po_area / po_area_unit / po_rate, from 20261205 / 20261206)
-- are copied in. Those columns stay in the table but are no longer used.
-- Run once, after 20261206. Safe to re-run. In phpMyAdmin, select the ps_ops database in the left
-- panel first (or keep the USE line).


CREATE TABLE IF NOT EXISTS customer_po_area_rates (
  po_id   CHAR(36)      NOT NULL,
  unit    VARCHAR(10)   NOT NULL,          -- 'sq.ft' or 'sq.m'
  area    DECIMAL(14,2) NOT NULL,          -- the area the PO covers in this unit
  rate    DECIMAL(14,4) NOT NULL,          -- the rate per this unit
  PRIMARY KEY (po_id, unit),
  CONSTRAINT fk_cpar_po FOREIGN KEY (po_id) REFERENCES customer_pos (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT IGNORE INTO customer_po_area_rates (po_id, unit, area, rate)
SELECT id, po_area_unit, po_area, COALESCE(po_rate, 0)
  FROM customer_pos
 WHERE po_area IS NOT NULL AND po_area_unit IN ('sq.ft', 'sq.m');

-- =====================================================================
-- PART 5 - Same as backend/src/data/migrations/20261208_billing_invoice_cc_emails.sql
-- =====================================================================
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


SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_profiles' AND COLUMN_NAME = 'invoice_cc_emails');
SET @sql := IF(@has = 0,
  'ALTER TABLE billing_profiles ADD COLUMN invoice_cc_emails VARCHAR(1000) NULL DEFAULT NULL AFTER invoice_emails',
  'SELECT ''billing_profiles.invoice_cc_emails already exists'' AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- =====================================================================
-- PART 6 - Same as backend/src/data/migrations/20261209_billing_invoice_email_parts.sql
-- =====================================================================
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


SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_profiles' AND COLUMN_NAME = 'invoice_email_parts');
SET @sql := IF(@has = 0,
  'ALTER TABLE billing_profiles ADD COLUMN invoice_email_parts JSON NULL DEFAULT NULL AFTER invoice_cc_emails',
  'SELECT ''billing_profiles.invoice_email_parts already exists'' AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- =====================================================================
-- PART 7 - Final checks (every row should say OK)
-- =====================================================================
SELECT t.object, IF(t.found > 0, 'OK', 'MISSING - tell the developer') AS result FROM (
  SELECT 'column billing_contracts.bill_day' AS object, (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_contracts' AND COLUMN_NAME = 'bill_day') AS found
  UNION ALL SELECT 'column customer_pos.po_area', (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_pos' AND COLUMN_NAME = 'po_area')
  UNION ALL SELECT 'column customer_pos.po_area_unit', (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_pos' AND COLUMN_NAME = 'po_area_unit')
  UNION ALL SELECT 'column customer_pos.po_rate', (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_pos' AND COLUMN_NAME = 'po_rate')
  UNION ALL SELECT 'column billing_group_profiles.service_offered_to', (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_group_profiles' AND COLUMN_NAME = 'service_offered_to')
  UNION ALL SELECT 'table customer_po_area_rates', (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_po_area_rates')
  UNION ALL SELECT 'column billing_profiles.invoice_cc_emails', (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_profiles' AND COLUMN_NAME = 'invoice_cc_emails')
  UNION ALL SELECT 'column billing_profiles.invoice_email_parts', (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_profiles' AND COLUMN_NAME = 'invoice_email_parts')
) t;

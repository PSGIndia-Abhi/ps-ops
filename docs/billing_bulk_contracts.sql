-- =====================================================================
-- Bulk-add billing contracts with their price lines, all at once.
-- Does the same as Billing > Contracts > New contract (same running codes AMC-0012…, default
-- invoice description, chemicals/descriptions masters), except no audit-log entry is written.
-- Run in phpMyAdmin with ps_ops selected. Take a mysqldump backup first.
--
-- HOW TO USE
--   1. Fill STEP 1 (one row per contract) and STEP 2 (one row per price line).
--      `ref` is just your own number that ties the lines to their contract.
--      `company` must be the customer's exact name as in Companies.
--   2. Run STEP 1 to STEP 3 first, read the CHECK results: every check must return no rows.
--      (The data sits in two helper tables zz_bulk_*, so you can fix rows and re-run the checks.)
--   3. Then run STEP 4 (inserts everything in one transaction) and STEP 5 (drops the helper tables).
-- =====================================================================

SET NAMES utf8mb4;
SET @me := 1;   -- your user id (users.id): shown as "created by"

-- ---------------------------------------------------------------------
-- STEP 1. Contracts
--   billing_type : AMC | ONE_TIME | TERMITE | CHEMICAL   (TERMITE/CHEMICAL need a PO: add those in the app)
--   frequency    : months per bill for AMC: 1, 3, 4, 6 or 12 (NULL for ONE_TIME)
--   first_bill   : "First bill from" (billed in Vyapar until the day before); NULL = start_date
--   gst          : 1 = GST on invoices (Commercial), 0 = no GST (Residential)
--   gst_rate     : 5, 12, 18 or 28
--   timing       : ARREARS (bill after the month) | ADVANCE
--   description  : NULL = default wording; may use {month} {period} {from_month} {to_month}
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS zz_bulk_contracts;
CREATE TABLE zz_bulk_contracts (
  ref          INT PRIMARY KEY,
  company      VARCHAR(255) NOT NULL,
  billing_type VARCHAR(10)  NOT NULL DEFAULT 'AMC',
  frequency    TINYINT      NULL,
  start_date   DATE         NOT NULL,
  first_bill   DATE         NULL,
  end_date     DATE         NULL,
  gst          TINYINT(1)   NOT NULL DEFAULT 1,
  gst_rate     DECIMAL(5,2) NOT NULL DEFAULT 18,
  timing       VARCHAR(10)  NOT NULL DEFAULT 'ARREARS',
  po_required  TINYINT(1)   NOT NULL DEFAULT 0,
  description  VARCHAR(500) NULL,
  notes        VARCHAR(1000) NULL
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO zz_bulk_contracts (ref, company, billing_type, frequency, start_date, first_bill, end_date, gst, gst_rate, timing, po_required, description, notes) VALUES
  -- Fill your rows here (examples below; replace them before running):
  ( 1, 'Exact Customer Name', 'AMC', 1, '2026-04-01', '2026-12-01', '2027-03-31', 1, 18, 'ARREARS', 0, NULL, NULL),
  ( 2, 'Another Customer',    'AMC', 3, '2026-07-01', NULL,         NULL,         1, 18, 'ARREARS', 0, NULL, NULL);

-- ---------------------------------------------------------------------
-- STEP 2. Price lines
--   basis  : FIXED (amount per bill) | PER_SERVICE (rate × services done) | PER_UNIT (rate × qty)
--   qty    : default quantity for PER_UNIT (NULL otherwise)
--   outlet : NULL = whole customer, or the outlet's exact name (sites.name) of that customer
--   kind   : SERVICE | CHEMICAL
--   plan_type / plan_sub : optional, the job service_type / sub_service the line follows on the SOS
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS zz_bulk_lines;
CREATE TABLE zz_bulk_lines (
  ref        INT          NOT NULL,
  item_name  VARCHAR(255) NOT NULL,
  basis      VARCHAR(12)  NOT NULL DEFAULT 'FIXED',
  rate       DECIMAL(12,2) NOT NULL,
  qty        DECIMAL(12,3) NULL,
  unit       VARCHAR(20)  NOT NULL DEFAULT 'nos',
  sac        VARCHAR(10)  NULL DEFAULT '998531',
  outlet     VARCHAR(255) NULL,
  kind       VARCHAR(10)  NOT NULL DEFAULT 'SERVICE',
  plan_type  VARCHAR(50)  NULL,
  plan_sub   VARCHAR(100) NULL,
  sort_order INT          NOT NULL DEFAULT 0
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO zz_bulk_lines (ref, item_name, basis, rate, qty, unit, sac, outlet, kind, plan_type, plan_sub, sort_order) VALUES
  -- Fill your rows here (examples below; replace them before running):
  (1, 'General Pest Control', 'FIXED',       2500, NULL, 'nos', '998531', NULL, 'SERVICE', NULL, NULL, 0),
  (1, 'Rodent Control',       'PER_SERVICE',  800, NULL, 'nos', '998531', NULL, 'SERVICE', NULL, NULL, 1),
  (2, 'General Pest Control', 'FIXED',       6000, NULL, 'nos', '998531', NULL, 'SERVICE', NULL, NULL, 0);

-- ---------------------------------------------------------------------
-- STEP 3. CHECKS: each query must return NO rows before you run STEP 4
-- ---------------------------------------------------------------------
-- 3a. Customer name not found, or found more than once
SELECT t.ref, t.company, COUNT(c.id) AS matches
  FROM zz_bulk_contracts t LEFT JOIN companies c ON c.name = t.company
 GROUP BY t.ref, t.company HAVING COUNT(c.id) <> 1;

-- 3b. Customer type not set (the app refuses these: set Corporate / Individual / RWA first)
SELECT t.ref, t.company, c.type
  FROM zz_bulk_contracts t JOIN companies c ON c.name = t.company
 WHERE c.type NOT IN ('CORPORATE','INDIVIDUAL','RWA') OR c.type IS NULL;

-- 3c. Wrong values in a contract row
SELECT * FROM zz_bulk_contracts
 WHERE billing_type NOT IN ('AMC','ONE_TIME','TERMITE','CHEMICAL')
    OR (billing_type = 'AMC' AND frequency IS NULL)
    OR (frequency IS NOT NULL AND frequency NOT IN (SELECT months FROM billing_frequencies WHERE is_active = 1))
    OR timing NOT IN ('ARREARS','ADVANCE')
    OR gst_rate NOT IN (5,12,18,28)
    OR (end_date IS NOT NULL AND end_date < start_date)
    OR (first_bill IS NOT NULL AND (first_bill < start_date OR (end_date IS NOT NULL AND first_bill > end_date)))
    OR billing_type = 'TERMITE';   -- termite contracts need POs linked: add them in the app

-- 3d. Wrong values in a price line, or a line with no contract
SELECT l.* FROM zz_bulk_lines l LEFT JOIN zz_bulk_contracts t ON t.ref = l.ref
 WHERE t.ref IS NULL OR l.basis NOT IN ('FIXED','PER_SERVICE','PER_UNIT') OR l.kind NOT IN ('SERVICE','CHEMICAL') OR l.rate < 0;

-- 3e. Outlet name not found for that customer
SELECT l.ref, l.item_name, l.outlet
  FROM zz_bulk_lines l JOIN zz_bulk_contracts t ON t.ref = l.ref JOIN companies c ON c.name = t.company
  LEFT JOIN sites s ON s.company_id = c.id AND s.name = l.outlet
 WHERE l.outlet IS NOT NULL AND s.id IS NULL;

-- 3f. (Information) Contracts with no price line, and customers without a billing profile
--     (no profile = no invoice can be drafted until it is filled in Customers)
SELECT t.ref, t.company, 'no price lines' AS note FROM zz_bulk_contracts t WHERE NOT EXISTS (SELECT 1 FROM zz_bulk_lines l WHERE l.ref = t.ref);
SELECT t.ref, t.company, 'no billing profile yet' AS note FROM zz_bulk_contracts t JOIN companies c ON c.name = t.company
 WHERE NOT EXISTS (SELECT 1 FROM billing_profiles bp WHERE bp.company_id = c.id);

-- ---------------------------------------------------------------------
-- STEP 4. INSERT (run only after every check above is empty)
-- ---------------------------------------------------------------------
-- New contract ids (made before the transaction: CREATE TABLE would end a transaction)
DROP TABLE IF EXISTS zz_bulk_contract_ids;
CREATE TABLE zz_bulk_contract_ids AS
SELECT t.ref, UUID() AS id, c.id AS company_id,
       ROW_NUMBER() OVER (ORDER BY t.ref) AS rn,
       CASE t.billing_type WHEN 'AMC' THEN 'AMC' WHEN 'ONE_TIME' THEN 'ONE' WHEN 'TERMITE' THEN 'TRM' ELSE 'CHM' END AS prefix,
       COALESCE(t.description,
         CASE WHEN t.billing_type = 'ONE_TIME' THEN 'Pest control service carried out on {period}'
              WHEN COALESCE(t.frequency, 1) > 1 THEN 'Pest control services for {from_month} to {to_month}'
              ELSE 'Pest control services for the month of {month}' END) AS description
  FROM zz_bulk_contracts t JOIN companies c ON c.name = t.company;

START TRANSACTION;

INSERT IGNORE INTO sequences (name, value) VALUES ('billing_contract', 0);
SELECT value INTO @seq FROM sequences WHERE name = 'billing_contract' FOR UPDATE;

-- Contract code: AMC-0012, ONE-0013 … continuing the app's running number
INSERT INTO billing_contracts
  (id, contract_code, company_id, billing_type, frequency_months, cycle_start_day, bill_timing, start_date, end_date,
   next_period_start, invoice_grouping, site_id, po_required, gst_applicable, gst_rate, shortfall_billing,
   description_template, notes, created_by, updated_by)
SELECT i.id, CONCAT(i.prefix, '-', LPAD(@seq + i.rn, 4, '0')), i.company_id, t.billing_type,
       CASE WHEN t.billing_type = 'ONE_TIME' THEN NULL ELSE COALESCE(t.frequency, 1) END,
       DAY(t.start_date), t.timing, t.start_date, t.end_date,
       COALESCE(t.first_bill, t.start_date), 'PER_CUSTOMER', NULL,
       IF(t.billing_type IN ('CHEMICAL','TERMITE'), 1, t.po_required), t.gst, t.gst_rate, 'PRO_RATA',
       i.description, t.notes, @me, @me
  FROM zz_bulk_contracts t JOIN zz_bulk_contract_ids i ON i.ref = t.ref;

INSERT INTO billing_contract_lines
  (id, contract_id, site_id, item_name, item_kind, invoice_group, sac_code, service_id, plan_service_type, plan_sub_service,
   pricing_basis, unit, rate, default_qty, effective_from, sort_order, created_by, updated_by)
SELECT UUID(), i.id, s.id, l.item_name, l.kind, NULL, l.sac, NULL,
       IF(l.kind = 'CHEMICAL', NULL, l.plan_type), IF(l.kind = 'CHEMICAL', NULL, l.plan_sub),
       l.basis, l.unit, l.rate, l.qty, t.start_date, l.sort_order, @me, @me
  FROM zz_bulk_lines l
  JOIN zz_bulk_contracts t      ON t.ref = l.ref
  JOIN zz_bulk_contract_ids i  ON i.ref = l.ref
  LEFT JOIN sites s  ON s.company_id = i.company_id AND s.name = l.outlet;

-- Typed chemicals go to the chemicals list, typed descriptions to Masters > Invoice Descriptions (as the app does)
INSERT IGNORE INTO billing_chemicals (id, name, created_by)
SELECT UUID(), l.item_name, @me FROM zz_bulk_lines l WHERE l.kind = 'CHEMICAL' GROUP BY l.item_name;

INSERT IGNORE INTO billing_invoice_descriptions (id, text, sort_order, created_by, updated_by)
SELECT UUID(), d.description, (SELECT COALESCE(MAX(sort_order), 0) FROM billing_invoice_descriptions) + ROW_NUMBER() OVER (ORDER BY d.description), @me, @me
  FROM (SELECT DISTINCT description FROM zz_bulk_contract_ids) d
 WHERE NOT EXISTS (SELECT 1 FROM billing_invoice_descriptions x WHERE x.text = d.description);

UPDATE sequences SET value = @seq + (SELECT COUNT(*) FROM zz_bulk_contract_ids) WHERE name = 'billing_contract';

COMMIT;

-- What was added
SELECT bc.contract_code, c.name, bc.billing_type, bc.frequency_months, bc.start_date, bc.next_period_start AS first_bill_from,
       COUNT(l.id) AS price_lines, SUM(l.rate) AS total_rates
  FROM zz_bulk_contract_ids i JOIN billing_contracts bc ON bc.id = i.id JOIN companies c ON c.id = bc.company_id
  LEFT JOIN billing_contract_lines l ON l.contract_id = bc.id
 GROUP BY bc.id ORDER BY bc.contract_code;

-- ---------------------------------------------------------------------
-- STEP 5. Drop the helper tables
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS zz_bulk_contract_ids;
DROP TABLE IF EXISTS zz_bulk_lines;
DROP TABLE IF EXISTS zz_bulk_contracts;

-- Quotation master: brings the data to the final state (the same as the local DB on 2026-10-20).
-- Run AFTER 20261017_create_quotation_master.sql and 20261017b_create_quotation_documents.sql.
-- Replaces 20261017c, 20261019 and 20261019b - do not run those.
--
-- Data only - no table is created, altered or dropped (there is no separate frequencies
-- table: a treatment row's frequency is one of the plan names).
-- Rows are matched by name, so it is safe to run more than once. Treatment rows and the
-- price chart of these services are replaced with the final set.

-- The quotation tables are utf8mb4_0900_ai_ci; without this, a connection that defaults to
-- another collation (phpMyAdmin: utf8mb4_unicode_ci) makes the temporary lists below fail
-- with "#1267 Illegal mix of collations".
SET NAMES utf8mb4 COLLATE utf8mb4_0900_ai_ci;

START TRANSACTION;

-- ---------------------------------------------------------------------------
-- 1. Plans - rename the four seeded plans (keeps their ids), add the rest, then set
--    billing / visits / order / active exactly.
-- ---------------------------------------------------------------------------
UPDATE `crm_quote_plans` p
JOIN (
  SELECT 'One-time Service' AS old_name, 'One Time' AS new_name
  UNION ALL SELECT 'AMC - 1 Service / Month', 'Monthly Once'
  UNION ALL SELECT 'AMC - 2 Services / Month', 'Fortnightly'
  UNION ALL SELECT 'AMC - 4 Services / Month', 'Weekly Once'
) r ON r.old_name = p.name
LEFT JOIN `crm_quote_plans` taken ON taken.name = r.new_name
SET p.name = r.new_name
WHERE taken.id IS NULL;

CREATE TEMPORARY TABLE `tmp_qm_plans` AS
  SELECT 'One Time' AS name, 'ONE_TIME' AS billing, NULL AS visits, 10 AS sort_order, 1 AS is_active
  UNION ALL SELECT 'Monthly Once', 'MONTHLY', 1, 20, 1
  UNION ALL SELECT 'Fortnightly', 'MONTHLY', 2, 30, 1
  UNION ALL SELECT 'Weekly Once', 'MONTHLY', 4, 40, 1
  UNION ALL SELECT 'Weekly Twice', 'MONTHLY', 8, 50, 1
  UNION ALL SELECT 'Weekly Thrice', 'MONTHLY', 12, 60, 1
  UNION ALL SELECT 'Weekly 6 Days', 'MONTHLY', 26, 70, 1
  UNION ALL SELECT 'Daily', 'MONTHLY', 30, 80, 1
  UNION ALL SELECT 'AMC - 3 Services / Year', 'YEARLY', 3, 90, 1
  UNION ALL SELECT 'Quarterly (AMC)', 'YEARLY', 4, 100, 1
  UNION ALL SELECT 'As and When Required', 'ONE_TIME', NULL, 110, 1
  UNION ALL SELECT 'Other', 'MONTHLY', NULL, 120, 1
  UNION ALL SELECT 'Monthly Once (AMC)', 'YEARLY', 12, 130, 0;

INSERT INTO `crm_quote_plans` (`id`, `name`, `billing`, `visits_per_month`, `sort_order`, `is_active`)
SELECT UUID(), t.name, t.billing, t.visits, t.sort_order, t.is_active FROM `tmp_qm_plans` t
WHERE NOT EXISTS (SELECT 1 FROM `crm_quote_plans` q WHERE q.name = t.name);

UPDATE `crm_quote_plans` q JOIN `tmp_qm_plans` t ON t.name = q.name
SET q.billing = t.billing, q.visits_per_month = t.visits, q.sort_order = t.sort_order, q.is_active = t.is_active;

-- ---------------------------------------------------------------------------
-- 2. Services - 'Ants / Flies / Other Insects' becomes GPC; Snake and Anti Termite added.
-- ---------------------------------------------------------------------------
UPDATE `crm_quote_services` s
LEFT JOIN `crm_quote_services` taken ON taken.name = 'GPC'
SET s.name = 'GPC'
WHERE s.name IN ('Ants / Flies / Other Insects', 'GPC (General Pest Control)') AND taken.id IS NULL;

CREATE TEMPORARY TABLE `tmp_qm_services` AS
  SELECT 'Rat Control' AS name, NULL AS description, 10 AS sort_order, 1 AS is_active
  UNION ALL SELECT 'GPC', NULL, 20, 1
  UNION ALL SELECT 'Cockroach Control', NULL, 30, 1
  UNION ALL SELECT 'Mosquito Control', NULL, 40, 1
  UNION ALL SELECT 'Bedbugs Treatment', NULL, 50, 1
  UNION ALL SELECT 'Honey Bee Removal', NULL, 60, 1
  UNION ALL SELECT 'Snake Control', NULL, 70, 1
  UNION ALL SELECT 'Anti Termite Control', NULL, 80, 1;

INSERT INTO `crm_quote_services` (`id`, `name`, `description`, `sort_order`, `is_active`)
SELECT UUID(), t.name, t.description, t.sort_order, t.is_active FROM `tmp_qm_services` t
WHERE NOT EXISTS (SELECT 1 FROM `crm_quote_services` q WHERE q.name = t.name);

UPDATE `crm_quote_services` q JOIN `tmp_qm_services` t ON t.name = q.name
SET q.description = t.description, q.sort_order = t.sort_order, q.is_active = t.is_active;

-- ---------------------------------------------------------------------------
-- 3. Treatment rows - replaced with the final rows (frequency = a plan name).
-- ---------------------------------------------------------------------------
DELETE x FROM `crm_quote_service_treatments` x
JOIN `crm_quote_services` qs ON qs.id = x.service_id
JOIN `tmp_qm_services` t ON t.name = qs.name;

INSERT INTO `crm_quote_service_treatments` (`id`, `service_id`, `defense_area`, `material_used`, `treatment_area`, `frequency`, `sort_order`)
SELECT UUID(), qs.id, t.defense_area, t.material_used, t.treatment_area, t.frequency, t.sort_order
FROM (
  SELECT 'Rat Control' AS service, 'First Line of Defense' AS defense_area, 'EBS - External Baiting Station' AS material_used, 'Surrounding the compound wall or outer boundary' AS treatment_area, 'Daily' AS frequency, 10 AS sort_order
  UNION ALL SELECT 'Rat Control', 'Second Line of Defense', 'TRBS - Tamper Resistant Baiting Station', 'Surrounding the building wall', 'Daily', 20
  UNION ALL SELECT 'Rat Control', 'Third Line of Defense', 'Break Back - Clip Board', 'Sensitive areas like server room, electrical room, kitchen, parking, STP and other key common areas', 'Daily', 30
  UNION ALL SELECT 'Rat Control', 'Third Line of Defense', 'Glue Tray / Glue Pad / Glue Trap', 'Sensitive areas like server room, electrical room, kitchen, parking, STP and other key common areas', 'Daily', 40
  UNION ALL SELECT 'GPC', 'Internal  Premises', 'Residual Chemical Spray / Granules', 'Entire internal  including fly-sensitive areas', 'Daily', 10
  UNION ALL SELECT 'GPC', 'External Premises', 'Residual Chemical Spray / Granules', 'Entire  external premises including fly-sensitive areas', 'Daily', 20
  UNION ALL SELECT 'Cockroach Control', 'Kitchen Premises', 'Residual Chemical Spray', 'Kitchen areas on basis', 'Weekly Once', 10
  UNION ALL SELECT 'Mosquito Control', 'Internal Premises', 'Residual Spray', 'Entire internal common area', 'Daily', 10
  UNION ALL SELECT 'Mosquito Control', 'External Premises', 'Residual Spray / Residual Misting with natural oil', 'External common area, parking and basement', 'Daily', 20
  UNION ALL SELECT 'Mosquito Control', 'Drainage and Stagnant Water Areas', 'Residual Spray', 'Drainage and stagnant water in basement and garden', 'Fortnightly', 30
  UNION ALL SELECT 'Bedbugs Treatment', 'Rooms and Lobby Area', 'Chemical Spray', 'Vacated rooms on rotation basis as per schedule', 'Daily', 10
  UNION ALL SELECT 'Honey Bee Removal', 'Required Area', 'Fogging', 'Wherever formed in the premises and easily accessible', 'As and When Required', 10
  UNION ALL SELECT 'Snake Control', 'Boundary / Perimeter', 'Snake repellent granules / spray', 'Along the compound wall, garden and open areas', 'Monthly Once', 10
  UNION ALL SELECT 'Snake Control', 'Entry Points', 'Repellent treatment and sealing advice', 'Drains, pipe openings and gaps under gates and doors', 'Monthly Once', 20
  UNION ALL SELECT 'Anti Termite Control', 'Pre-Construction', 'Anti-termite chemical soil treatment', 'Foundation pits, plinth and ground floor soil before flooring', 'One Time', 10
  UNION ALL SELECT 'Anti Termite Control', 'Post-Construction', 'Drill-Fill-Seal with termiticide', 'Along internal and external walls at the floor junction', 'One Time', 20
  UNION ALL SELECT 'Anti Termite Control', 'Woodwork', 'Termiticide spray / injection', 'Door and window frames, cupboards and wooden fixtures', 'One Time', 30
) t
JOIN `crm_quote_services` qs ON qs.name = t.service;

-- ---------------------------------------------------------------------------
-- 4. Price chart (Rs.; Monthly plans = per month, AMC plans = per year) - replaced.
-- ---------------------------------------------------------------------------
DELETE sp FROM `crm_quote_service_prices` sp
JOIN `crm_quote_services` qs ON qs.id = sp.service_id
JOIN `tmp_qm_services` t ON t.name = qs.name;

INSERT INTO `crm_quote_service_prices` (`service_id`, `plan_id`, `price`)
SELECT qs.id, qp.id, x.price
FROM (
  SELECT 'Rat Control' AS service, 'One Time' AS plan, 2000.00 AS price
  UNION ALL SELECT 'Rat Control', 'Monthly Once', 2000.00
  UNION ALL SELECT 'Rat Control', 'Fortnightly', 4000.00
  UNION ALL SELECT 'Rat Control', 'Weekly Once', 8000.00
  UNION ALL SELECT 'Rat Control', 'Weekly Twice', 12000.00
  UNION ALL SELECT 'Rat Control', 'Weekly Thrice', 18000.00
  UNION ALL SELECT 'Rat Control', 'Weekly 6 Days', 36000.00
  UNION ALL SELECT 'Rat Control', 'Daily', 40000.00
  UNION ALL SELECT 'Rat Control', 'AMC - 3 Services / Year', 8000.00
  UNION ALL SELECT 'Rat Control', 'Quarterly (AMC)', 8000.00
  UNION ALL SELECT 'Rat Control', 'As and When Required', 2000.00
  UNION ALL SELECT 'Rat Control', 'Monthly Once (AMC)', 25000.00
  UNION ALL SELECT 'GPC', 'One Time', 2000.00
  UNION ALL SELECT 'GPC', 'Monthly Once', 2000.00
  UNION ALL SELECT 'GPC', 'Fortnightly', 4000.00
  UNION ALL SELECT 'GPC', 'Weekly Once', 8000.00
  UNION ALL SELECT 'GPC', 'Weekly Twice', 16000.00
  UNION ALL SELECT 'GPC', 'Weekly Thrice', 24000.00
  UNION ALL SELECT 'GPC', 'Weekly 6 Days', 48000.00
  UNION ALL SELECT 'GPC', 'Daily', 55000.00
  UNION ALL SELECT 'GPC', 'AMC - 3 Services / Year', 8000.00
  UNION ALL SELECT 'GPC', 'Quarterly (AMC)', 8000.00
  UNION ALL SELECT 'GPC', 'As and When Required', 2000.00
  UNION ALL SELECT 'GPC', 'Monthly Once (AMC)', 18000.00
  UNION ALL SELECT 'Cockroach Control', 'One Time', 3500.00
  UNION ALL SELECT 'Cockroach Control', 'Monthly Once', 3500.00
  UNION ALL SELECT 'Cockroach Control', 'Fortnightly', 7000.00
  UNION ALL SELECT 'Cockroach Control', 'Weekly Once', 12000.00
  UNION ALL SELECT 'Cockroach Control', 'Weekly Twice', 24000.00
  UNION ALL SELECT 'Cockroach Control', 'Weekly Thrice', 36000.00
  UNION ALL SELECT 'Cockroach Control', 'Weekly 6 Days', 60000.00
  UNION ALL SELECT 'Cockroach Control', 'Daily', 70000.00
  UNION ALL SELECT 'Cockroach Control', 'AMC - 3 Services / Year', 8000.00
  UNION ALL SELECT 'Cockroach Control', 'Quarterly (AMC)', 8000.00
  UNION ALL SELECT 'Cockroach Control', 'As and When Required', 3500.00
  UNION ALL SELECT 'Cockroach Control', 'Monthly Once (AMC)', 18000.00
  UNION ALL SELECT 'Mosquito Control', 'One Time', 2000.00
  UNION ALL SELECT 'Mosquito Control', 'Monthly Once', 2000.00
  UNION ALL SELECT 'Mosquito Control', 'Fortnightly', 4000.00
  UNION ALL SELECT 'Mosquito Control', 'Weekly Once', 8000.00
  UNION ALL SELECT 'Mosquito Control', 'Weekly Twice', 16000.00
  UNION ALL SELECT 'Mosquito Control', 'Weekly Thrice', 24000.00
  UNION ALL SELECT 'Mosquito Control', 'Weekly 6 Days', 48000.00
  UNION ALL SELECT 'Mosquito Control', 'Daily', 55000.00
  UNION ALL SELECT 'Mosquito Control', 'AMC - 3 Services / Year', 8000.00
  UNION ALL SELECT 'Mosquito Control', 'Quarterly (AMC)', 8000.00
  UNION ALL SELECT 'Mosquito Control', 'As and When Required', 2000.00
  UNION ALL SELECT 'Mosquito Control', 'Monthly Once (AMC)', 22000.00
  UNION ALL SELECT 'Bedbugs Treatment', 'One Time', 3000.00
  UNION ALL SELECT 'Bedbugs Treatment', 'Monthly Once', 3000.00
  UNION ALL SELECT 'Bedbugs Treatment', 'Fortnightly', 6000.00
  UNION ALL SELECT 'Bedbugs Treatment', 'Weekly Once', 12000.00
  UNION ALL SELECT 'Bedbugs Treatment', 'Weekly Twice', 24000.00
  UNION ALL SELECT 'Bedbugs Treatment', 'Weekly Thrice', 36000.00
  UNION ALL SELECT 'Bedbugs Treatment', 'Weekly 6 Days', 60000.00
  UNION ALL SELECT 'Bedbugs Treatment', 'Daily', 70000.00
  UNION ALL SELECT 'Bedbugs Treatment', 'AMC - 3 Services / Year', 8000.00
  UNION ALL SELECT 'Bedbugs Treatment', 'Quarterly (AMC)', 8000.00
  UNION ALL SELECT 'Bedbugs Treatment', 'As and When Required', 3500.00
  UNION ALL SELECT 'Bedbugs Treatment', 'Monthly Once (AMC)', 30000.00
  UNION ALL SELECT 'Honey Bee Removal', 'One Time', 5000.00
  UNION ALL SELECT 'Honey Bee Removal', 'Monthly Once', 5000.00
  UNION ALL SELECT 'Honey Bee Removal', 'Fortnightly', 10000.00
  UNION ALL SELECT 'Honey Bee Removal', 'Weekly Once', 16000.00
  UNION ALL SELECT 'Honey Bee Removal', 'Weekly Twice', 24000.00
  UNION ALL SELECT 'Honey Bee Removal', 'Weekly Thrice', 36000.00
  UNION ALL SELECT 'Honey Bee Removal', 'AMC - 3 Services / Year', 5000.00
  UNION ALL SELECT 'Honey Bee Removal', 'Quarterly (AMC)', 5000.00
  UNION ALL SELECT 'Honey Bee Removal', 'As and When Required', 5000.00
  UNION ALL SELECT 'Snake Control', 'One Time', 5000.00
  UNION ALL SELECT 'Snake Control', 'Monthly Once', 5000.00
  UNION ALL SELECT 'Snake Control', 'Fortnightly', 10000.00
  UNION ALL SELECT 'Snake Control', 'Weekly Once', 16000.00
  UNION ALL SELECT 'Snake Control', 'Weekly Twice', 24000.00
  UNION ALL SELECT 'Snake Control', 'Weekly Thrice', 36000.00
  UNION ALL SELECT 'Snake Control', 'Weekly 6 Days', 60000.00
  UNION ALL SELECT 'Snake Control', 'Daily', 70000.00
  UNION ALL SELECT 'Snake Control', 'AMC - 3 Services / Year', 5000.00
  UNION ALL SELECT 'Snake Control', 'Quarterly (AMC)', 5000.00
  UNION ALL SELECT 'Snake Control', 'As and When Required', 5000.00
  UNION ALL SELECT 'Snake Control', 'Monthly Once (AMC)', 24000.00
  UNION ALL SELECT 'Anti Termite Control', 'Quarterly (AMC)', 18000.00
) x
JOIN `crm_quote_services` qs ON qs.name = x.service
JOIN `crm_quote_plans` qp ON qp.name = x.plan;

-- ---------------------------------------------------------------------------
-- 5. Clauses - is_default = 1 means locked: always printed on every quotation.
-- ---------------------------------------------------------------------------
CREATE TEMPORARY TABLE `tmp_qm_clauses` AS
  SELECT 'TERMS' AS kind, 'All taxes extra as applicable.' AS text, 1 AS is_default, 10 AS sort_order, 1 AS is_active
  UNION ALL SELECT 'TERMS', 'All payments to be made in the name of Bestserve Pest Management Pvt. Ltd.', 1, 20, 1
  UNION ALL SELECT 'TERMS', 'Any pest repellent machine will be installed at additional cost.', 1, 30, 1
  UNION ALL SELECT 'TERMS', 'Any service to the staff room will be done at additional cost.', 0, 40, 1
  UNION ALL SELECT 'VALUE_ADDED', 'Time-to-time suggestions to prevent pest infestation.', 1, 10, 1
  UNION ALL SELECT 'VALUE_ADDED', 'A quality check report will be given every quarter.', 0, 20, 1;

INSERT INTO `crm_quote_clauses` (`id`, `kind`, `text`, `is_default`, `sort_order`, `is_active`)
SELECT UUID(), t.kind, t.text, t.is_default, t.sort_order, t.is_active FROM `tmp_qm_clauses` t
WHERE NOT EXISTS (SELECT 1 FROM `crm_quote_clauses` q WHERE q.kind = t.kind AND q.text = t.text);

UPDATE `crm_quote_clauses` q JOIN `tmp_qm_clauses` t ON t.kind = q.kind AND t.text = q.text
SET q.is_default = t.is_default, q.sort_order = t.sort_order, q.is_active = t.is_active;

DROP TEMPORARY TABLE `tmp_qm_plans`;
DROP TEMPORARY TABLE `tmp_qm_services`;
DROP TEMPORARY TABLE `tmp_qm_clauses`;

COMMIT;

-- Verify (expect 8 services / 17 rows / 13 plans / 82 prices / 6 clauses)
-- SELECT name, sort_order, is_active FROM crm_quote_services ORDER BY sort_order;
-- SELECT name, billing, visits_per_month, sort_order, is_active FROM crm_quote_plans ORDER BY sort_order;
-- SELECT COUNT(*) FROM crm_quote_service_treatments;
-- SELECT COUNT(*) FROM crm_quote_service_prices;
-- SELECT kind, text, is_default FROM crm_quote_clauses ORDER BY kind, sort_order;

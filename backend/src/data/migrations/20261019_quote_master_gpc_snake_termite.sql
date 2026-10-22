-- Quotation master updates (data only, no table changes). Run after 20261017c_quote_plans_monthly_and_amc.sql.
--
--   1. "Ants / Flies / Other Insects" is renamed "GPC" -- same row, same
--      place in the list, same treatment rows and prices.
--   2. Two services are added at the end: Snake Control and Anti Termite Control, with standard
--      treatment rows and placeholder prices (to be replaced from the master screen).
--   3. Treatment-row frequencies use the standard list the screens offer
--      ("As and when required" -> "As and When Required").
--   4. Clauses: is_default now means "always included" (salespeople cannot remove it). These five
--      are always included; "Any service to the staff room..." stays optional.
--
-- Safe to run more than once.

-- 1. GPC
UPDATE `crm_quote_services` SET `name` = 'GPC'
 WHERE `name` IN ('Ants / Flies / Other Insects', 'GPC (General Pest Control)')
   AND NOT EXISTS (SELECT 1 FROM (SELECT `name` FROM `crm_quote_services`) x WHERE x.name = 'GPC');

-- 2. New services
INSERT INTO `crm_quote_services` (`id`, `name`, `sort_order`)
SELECT UUID(), s.name, s.sort_order FROM (
  SELECT 'Snake Control' AS name, 70 AS sort_order
  UNION ALL SELECT 'Anti Termite Control', 80
) s
WHERE NOT EXISTS (SELECT 1 FROM `crm_quote_services` q WHERE q.name = s.name);

INSERT INTO `crm_quote_service_treatments` (`id`, `service_id`, `defense_area`, `material_used`, `treatment_area`, `frequency`, `sort_order`)
SELECT UUID(), qs.id, t.defense_area, t.material_used, t.treatment_area, t.frequency, t.sort_order
FROM (
  SELECT 'Snake Control' AS service, 'Boundary / Perimeter' AS defense_area, 'Snake repellent granules / spray' AS material_used,
         'Along the compound wall, garden and open areas' AS treatment_area, 'Monthly Once' AS frequency, 10 AS sort_order
  UNION ALL SELECT 'Snake Control', 'Entry Points', 'Repellent treatment and sealing advice',
         'Drains, pipe openings and gaps under gates and doors', 'Monthly Once', 20
  UNION ALL SELECT 'Anti Termite Control', 'Pre-Construction', 'Anti-termite chemical soil treatment',
         'Foundation pits, plinth and ground floor soil before flooring', 'One Time', 10
  UNION ALL SELECT 'Anti Termite Control', 'Post-Construction', 'Drill-Fill-Seal with termiticide',
         'Along internal and external walls at the floor junction', 'One Time', 20
  UNION ALL SELECT 'Anti Termite Control', 'Woodwork', 'Termiticide spray / injection',
         'Door and window frames, cupboards and wooden fixtures', 'One Time', 30
) t
JOIN `crm_quote_services` qs ON qs.name = t.service
WHERE NOT EXISTS (SELECT 1 FROM `crm_quote_service_treatments` x WHERE x.service_id = qs.id);

-- Placeholder prices (Rs.; Monthly = per month, AMC = per year). Only fills missing cells.
INSERT INTO `crm_quote_service_prices` (`service_id`, `plan_id`, `price`)
SELECT qs.id, qp.id, x.price
FROM (
  SELECT 'Snake Control' AS service, 'One-time Service' AS plan, 3500 AS price
  UNION ALL SELECT 'Snake Control', 'Monthly - 1 Service', 2500
  UNION ALL SELECT 'Snake Control', 'AMC - 4 Services / Year (Quarterly)', 9000
  UNION ALL SELECT 'Snake Control', 'AMC - 12 Services / Year (Monthly)', 24000
  UNION ALL SELECT 'Anti Termite Control', 'One-time Service', 15000
  UNION ALL SELECT 'Anti Termite Control', 'AMC - 4 Services / Year (Quarterly)', 18000
) x
JOIN `crm_quote_services` qs ON qs.name = x.service
JOIN `crm_quote_plans` qp ON qp.name = x.plan
WHERE NOT EXISTS (SELECT 1 FROM `crm_quote_service_prices` p WHERE p.service_id = qs.id AND p.plan_id = qp.id);

-- 3. Standard frequency names
UPDATE `crm_quote_service_treatments` SET `frequency` = 'As and When Required' WHERE `frequency` = 'As and when required';

-- 4. Always-included clauses
UPDATE `crm_quote_clauses` SET `is_default` = 1
 WHERE `text` IN (
   'Time-to-time suggestions to prevent pest infestation.',
   'A quality check report will be given every quarter.',
   'All taxes extra as applicable.',
   'All payments to be made in the name of Bestserve Pest Management Pvt. Ltd.',
   'Any pest repellent machine will be installed at additional cost.'
 );
UPDATE `crm_quote_clauses` SET `is_default` = 0 WHERE `text` = 'Any service to the staff room will be done at additional cost.';

-- Verify
-- SELECT s.sort_order, s.name, COUNT(t.id) AS rows_ FROM crm_quote_services s LEFT JOIN crm_quote_service_treatments t ON t.service_id = s.id GROUP BY s.id ORDER BY s.sort_order;
-- SELECT kind, is_default, text FROM crm_quote_clauses ORDER BY kind, sort_order;

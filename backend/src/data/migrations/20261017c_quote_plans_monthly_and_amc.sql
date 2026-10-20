-- Quotation plans: monthly contracts and AMC are different things.
--
--   Monthly  - N services a month, charged per month          (billing = MONTHLY)
--   AMC      - annual maintenance contract, one amount a year  (billing = YEARLY)
--
-- 1. The plans first seeded as "AMC - N Service(s) / Month" are monthly plans: renamed to
--    "Monthly - N Service(s)". Their prices and billing do not change.
-- 2. Two AMC plans are added, with placeholder yearly prices (AMC 12/year = 10 x the
--    1-service-a-month price, AMC 4/year = 4 x it), to be replaced from the master screen.
--
-- crm_quote_plans.visits_per_month holds the services in one billing period: per month for
-- MONTHLY, per year for YEARLY. No table structure changes.
-- Safe to run more than once: renames only touch the old names, inserts only add what is missing.
-- Run after 20261017_create_quotation_master.sql.

-- 1. Rename the monthly plans
UPDATE `crm_quote_plans` SET `name` = 'Monthly - 1 Service'
 WHERE `name` = 'AMC - 1 Service / Month' AND NOT EXISTS (SELECT 1 FROM (SELECT `name` FROM `crm_quote_plans`) x WHERE x.name = 'Monthly - 1 Service');
UPDATE `crm_quote_plans` SET `name` = 'Monthly - 2 Services'
 WHERE `name` = 'AMC - 2 Services / Month' AND NOT EXISTS (SELECT 1 FROM (SELECT `name` FROM `crm_quote_plans`) x WHERE x.name = 'Monthly - 2 Services');
UPDATE `crm_quote_plans` SET `name` = 'Monthly - 4 Services'
 WHERE `name` = 'AMC - 4 Services / Month' AND NOT EXISTS (SELECT 1 FROM (SELECT `name` FROM `crm_quote_plans`) x WHERE x.name = 'Monthly - 4 Services');

-- 2. AMC plans (yearly)
INSERT INTO `crm_quote_plans` (`id`, `name`, `billing`, `visits_per_month`, `sort_order`)
SELECT UUID(), p.name, 'YEARLY', p.visits, p.sort_order FROM (
  SELECT 'AMC - 4 Services / Year (Quarterly)' AS name, 4 AS visits, 50 AS sort_order
  UNION ALL SELECT 'AMC - 12 Services / Year (Monthly)', 12, 60
) p
WHERE NOT EXISTS (SELECT 1 FROM `crm_quote_plans` q WHERE q.name = p.name);

-- 3. Placeholder AMC prices (Rs. per year). Only fills missing cells.
INSERT INTO `crm_quote_service_prices` (`service_id`, `plan_id`, `price`)
SELECT qs.id, qp.id, x.price
FROM (
  SELECT 'Rat Control' AS service, 'AMC - 4 Services / Year (Quarterly)' AS plan, 10000 AS price
  UNION ALL SELECT 'Rat Control', 'AMC - 12 Services / Year (Monthly)', 25000
  UNION ALL SELECT 'Ants / Flies / Other Insects', 'AMC - 4 Services / Year (Quarterly)', 7200
  UNION ALL SELECT 'Ants / Flies / Other Insects', 'AMC - 12 Services / Year (Monthly)', 18000
  UNION ALL SELECT 'Cockroach Control', 'AMC - 4 Services / Year (Quarterly)', 7200
  UNION ALL SELECT 'Cockroach Control', 'AMC - 12 Services / Year (Monthly)', 18000
  UNION ALL SELECT 'Mosquito Control', 'AMC - 4 Services / Year (Quarterly)', 8800
  UNION ALL SELECT 'Mosquito Control', 'AMC - 12 Services / Year (Monthly)', 22000
  UNION ALL SELECT 'Bedbugs Treatment', 'AMC - 4 Services / Year (Quarterly)', 12000
  UNION ALL SELECT 'Bedbugs Treatment', 'AMC - 12 Services / Year (Monthly)', 30000
) x
JOIN `crm_quote_services` qs ON qs.name = x.service
JOIN `crm_quote_plans` qp ON qp.name = x.plan
WHERE NOT EXISTS (SELECT 1 FROM `crm_quote_service_prices` p WHERE p.service_id = qs.id AND p.plan_id = qp.id);

-- Verify
-- SELECT name, billing, visits_per_month FROM crm_quote_plans ORDER BY sort_order;

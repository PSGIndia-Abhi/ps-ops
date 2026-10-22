-- Quotation plans double as the Frequency choices of treatment rows (data only, no table changes).
-- Run after 20261019_quote_master_gpc_snake_termite.sql.
--
-- A plan's name is what a treatment row shows as its Frequency, and picking a plan on a quotation
-- sets the rows' frequency to it. So the plans are named by how often the service is done:
--
--   One Time               ONE_TIME   (was "One-time Service")
--   As and When Required   ONE_TIME   new - per visit / on call
--   Daily                  MONTHLY    30 / month   new
--   Weekly 6 Days          MONTHLY    26 / month   new
--   Weekly Thrice          MONTHLY    12 / month   new
--   Weekly Twice           MONTHLY     8 / month   new
--   Weekly Once            MONTHLY     4 / month   (was "Monthly - 4 Services")
--   Fortnightly            MONTHLY     2 / month   (was "Monthly - 2 Services")
--   Monthly Once           MONTHLY     1 / month   (was "Monthly - 1 Service")
--   Quarterly (AMC)        YEARLY      4 / year    (was "AMC - 4 Services / Year (Quarterly)")
--   Monthly Once (AMC)     YEARLY     12 / year    (was "AMC - 12 Services / Year (Monthly)")
--
-- Renamed plans keep their prices. New plans start with no price (not offered) until the sales
-- manager fills them in the price chart. Treatment rows already use these names
-- (Daily, Weekly Once, Fortnightly, Monthly Once, One Time, As and When Required).
--
-- Safe to run more than once: renames only touch the old names, inserts only add what is missing.

-- 1. Rename the existing plans
UPDATE `crm_quote_plans` p
  JOIN (
    SELECT 'One-time Service' AS old_name, 'One Time' AS new_name
    UNION ALL SELECT 'Monthly - 4 Services', 'Weekly Once'
    UNION ALL SELECT 'Monthly - 2 Services', 'Fortnightly'
    UNION ALL SELECT 'Monthly - 1 Service', 'Monthly Once'
    UNION ALL SELECT 'AMC - 4 Services / Year (Quarterly)', 'Quarterly (AMC)'
    UNION ALL SELECT 'AMC - 12 Services / Year (Monthly)', 'Monthly Once (AMC)'
  ) r ON r.old_name = p.name
  LEFT JOIN `crm_quote_plans` taken ON taken.name = r.new_name
   SET p.name = r.new_name
 WHERE taken.id IS NULL;

-- 2. Add the new plans
INSERT INTO `crm_quote_plans` (`id`, `name`, `billing`, `visits_per_month`, `sort_order`)
SELECT UUID(), n.name, n.billing, n.visits, 0 FROM (
  SELECT 'As and When Required' AS name, 'ONE_TIME' AS billing, NULL AS visits
  UNION ALL SELECT 'Daily', 'MONTHLY', 30
  UNION ALL SELECT 'Weekly 6 Days', 'MONTHLY', 26
  UNION ALL SELECT 'Weekly Thrice', 'MONTHLY', 12
  UNION ALL SELECT 'Weekly Twice', 'MONTHLY', 8
) n
WHERE NOT EXISTS (SELECT 1 FROM `crm_quote_plans` q WHERE q.name = n.name);

-- 3. Order: most frequent first within each kind
UPDATE `crm_quote_plans` p
  JOIN (
    SELECT 'One Time' AS name, 10 AS sort_order
    UNION ALL SELECT 'As and When Required', 20
    UNION ALL SELECT 'Daily', 30
    UNION ALL SELECT 'Weekly 6 Days', 40
    UNION ALL SELECT 'Weekly Thrice', 50
    UNION ALL SELECT 'Weekly Twice', 60
    UNION ALL SELECT 'Weekly Once', 70
    UNION ALL SELECT 'Fortnightly', 80
    UNION ALL SELECT 'Monthly Once', 90
    UNION ALL SELECT 'Quarterly (AMC)', 100
    UNION ALL SELECT 'Monthly Once (AMC)', 110
  ) o ON o.name = p.name
   SET p.sort_order = o.sort_order;

-- Verify
-- SELECT name, billing, visits_per_month, sort_order FROM crm_quote_plans ORDER BY sort_order;

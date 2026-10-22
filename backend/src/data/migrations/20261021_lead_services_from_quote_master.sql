-- Commercial lead services now come from the Quotation Master (crm_quote_services) instead of a
-- fixed list in the code. crm_leads.services_requested keeps the chosen services' ids,
-- comma-separated, so "Create quotation" can start with the services the customer asked for.
--
-- 1. Widens services_requested (an id is 36 characters; 255 held only six).
-- 2. Adds 'Ant Treatment' and 'Fly Control' to the master (the old lead form had them; no treatment
--    rows or prices yet - fill them in from Quotation Master).
-- 3. Converts leads saved with the old codes (gpc, rodent_control, ...) to the master's ids.
--
-- Safe to run more than once: the column change is the same each time, the services are only
-- added when missing, and only values still made of old codes are converted.
-- Run AFTER 20261020_quote_master_final_data.sql.

-- The quotation tables are utf8mb4_0900_ai_ci; without this, a connection that defaults to
-- another collation (phpMyAdmin: utf8mb4_unicode_ci) fails with "#1267 Illegal mix of collations".
SET NAMES utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------------
-- 1. Room for the ids
-- ---------------------------------------------------------------------------
ALTER TABLE `crm_leads` MODIFY COLUMN `services_requested` VARCHAR(1000) NULL;

-- ---------------------------------------------------------------------------
-- 2. The two services the old form had and the master did not
-- ---------------------------------------------------------------------------
INSERT INTO `crm_quote_services` (`id`, `name`, `sort_order`)
SELECT UUID(), s.name, s.sort_order FROM (
  SELECT 'Ant Treatment' AS name, 90 AS sort_order
  UNION ALL SELECT 'Fly Control', 100
) s
WHERE NOT EXISTS (SELECT 1 FROM `crm_quote_services` q WHERE q.name = s.name);

-- ---------------------------------------------------------------------------
-- 3. Old codes -> master ids, keeping their order. Only values made of old codes (lower-case
--    letters, _ and commas) are touched; ids contain digits and dashes.
-- ---------------------------------------------------------------------------
CREATE TEMPORARY TABLE `tmp_lead_service_codes` AS
  SELECT 'gpc' AS code, 'GPC' AS name
  UNION ALL SELECT 'rodent_control', 'Rat Control'
  UNION ALL SELECT 'cockroach_control', 'Cockroach Control'
  UNION ALL SELECT 'ant_treatment', 'Ant Treatment'
  UNION ALL SELECT 'honeybee_control', 'Honey Bee Removal'
  UNION ALL SELECT 'snake_control', 'Snake Control'
  UNION ALL SELECT 'fly_control', 'Fly Control';

UPDATE `crm_leads` l
JOIN (
  SELECT x.id, GROUP_CONCAT(DISTINCT x.service_id ORDER BY x.n SEPARATOR ',') AS ids
  FROM (
    SELECT l2.id, j.n, s.id AS service_id
    FROM `crm_leads` l2
    JOIN JSON_TABLE(
      CONCAT('["', REPLACE(l2.services_requested, ',', '","'), '"]'),
      '$[*]' COLUMNS (n FOR ORDINALITY, code VARCHAR(60) PATH '$')
    ) j
    JOIN `tmp_lead_service_codes` m ON m.code = j.code
    JOIN `crm_quote_services` s ON s.name = m.name
    WHERE l2.services_requested REGEXP '^[a-z_,]+$'
  ) x
  GROUP BY x.id
) conv ON conv.id = l.id
SET l.services_requested = conv.ids;

DROP TEMPORARY TABLE `tmp_lead_service_codes`;

-- Verify: every value should now be ids (no old codes left)
-- SELECT services_requested, COUNT(*) FROM crm_leads WHERE services_requested IS NOT NULL GROUP BY 1;
-- SELECT name, sort_order, is_active FROM crm_quote_services ORDER BY sort_order;

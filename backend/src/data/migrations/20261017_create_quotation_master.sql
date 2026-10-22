-- Quotation master for commercial leads: the services a commercial quotation offers, each
-- service's standard treatment rows, the plans (one-time / AMC visits per month), a price per
-- service and plan, and the standard value-added / terms clauses. Kept by the sales manager
-- (MANAGE_LEADS) on the web; read by the quotation builder in the Lead app and web.
--
-- Separate from crm_services / crm_service_prices: that is the residential price list
-- (priced by house type) used by the old CRM app, and is left untouched.
--
-- Nothing is ever deleted - rows are switched off (is_active = 0) instead.
-- Safe to run more than once: tables are IF NOT EXISTS and every seed row is only inserted
-- when it is missing. The prices are placeholders, to be replaced from the master screen.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `crm_quote_services` (
  `id` CHAR(36) NOT NULL,
  `name` VARCHAR(80) NOT NULL,
  `description` VARCHAR(500) NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cqs_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- The standard rows of a service's scope table (Defense Area / Material Used /
-- Location-Treatment Area / Frequency). A quotation copies them and may edit its copy.
CREATE TABLE IF NOT EXISTS `crm_quote_service_treatments` (
  `id` CHAR(36) NOT NULL,
  `service_id` CHAR(36) NOT NULL,
  `defense_area` VARCHAR(120) NOT NULL,
  `material_used` VARCHAR(160) NOT NULL,
  `treatment_area` VARCHAR(255) NOT NULL,
  `frequency` VARCHAR(60) NOT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_cqst_service` (`service_id`),
  CONSTRAINT `fk_cqst_service` FOREIGN KEY (`service_id`) REFERENCES `crm_quote_services` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- billing: ONE_TIME (a single charge) or MONTHLY (AMC, charged per month).
CREATE TABLE IF NOT EXISTS `crm_quote_plans` (
  `id` CHAR(36) NOT NULL,
  `name` VARCHAR(60) NOT NULL,
  `billing` VARCHAR(20) NOT NULL DEFAULT 'MONTHLY',
  `visits_per_month` INT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cqp_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- A missing row means the plan is not offered for that service.
CREATE TABLE IF NOT EXISTS `crm_quote_service_prices` (
  `service_id` CHAR(36) NOT NULL,
  `plan_id` CHAR(36) NOT NULL,
  `price` DECIMAL(12,2) NOT NULL,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`service_id`, `plan_id`),
  KEY `idx_cqsp_plan` (`plan_id`),
  CONSTRAINT `fk_cqsp_service` FOREIGN KEY (`service_id`) REFERENCES `crm_quote_services` (`id`),
  CONSTRAINT `fk_cqsp_plan` FOREIGN KEY (`plan_id`) REFERENCES `crm_quote_plans` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- kind: VALUE_ADDED or TERMS. is_default: ticked on a new quotation.
CREATE TABLE IF NOT EXISTS `crm_quote_clauses` (
  `id` CHAR(36) NOT NULL,
  `kind` VARCHAR(20) NOT NULL,
  `text` VARCHAR(500) NOT NULL,
  `is_default` TINYINT(1) NOT NULL DEFAULT 0,
  `sort_order` INT NOT NULL DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cqc_kind` (`kind`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------------
-- 2. Services
-- ---------------------------------------------------------------------------
INSERT INTO `crm_quote_services` (`id`, `name`, `sort_order`)
SELECT UUID(), s.name, s.sort_order FROM (
  SELECT 'Rat Control' AS name, 10 AS sort_order
  UNION ALL SELECT 'Ants / Flies / Other Insects', 20
  UNION ALL SELECT 'Cockroach Control', 30
  UNION ALL SELECT 'Mosquito Control', 40
  UNION ALL SELECT 'Bedbugs Treatment', 50
  UNION ALL SELECT 'Honey Bee Removal', 60
) s
WHERE NOT EXISTS (SELECT 1 FROM `crm_quote_services` q WHERE q.name = s.name);

-- ---------------------------------------------------------------------------
-- 3. Treatment rows - only for a service that has none yet
-- ---------------------------------------------------------------------------
INSERT INTO `crm_quote_service_treatments` (`id`, `service_id`, `defense_area`, `material_used`, `treatment_area`, `frequency`, `sort_order`)
SELECT UUID(), qs.id, t.defense_area, t.material_used, t.treatment_area, t.frequency, t.sort_order
FROM (
  SELECT 'Rat Control' AS service, 'First Line of Defense' AS defense_area, 'EBS - External Baiting Station' AS material_used,
         'Surrounding the compound wall or outer boundary' AS treatment_area, 'Daily' AS frequency, 10 AS sort_order
  UNION ALL SELECT 'Rat Control', 'Second Line of Defense', 'TRBS - Tamper Resistant Baiting Station',
         'Surrounding the building wall', 'Daily', 20
  UNION ALL SELECT 'Rat Control', 'Third Line of Defense', 'Break Back - Clip Board',
         'Sensitive areas like server room, electrical room, kitchen, parking, STP and other key common areas', 'Daily', 30
  UNION ALL SELECT 'Rat Control', 'Third Line of Defense', 'Glue Tray / Glue Pad / Glue Trap',
         'Sensitive areas like server room, electrical room, kitchen, parking, STP and other key common areas', 'Daily', 40
  UNION ALL SELECT 'Ants / Flies / Other Insects', 'Internal and External Premises', 'Residual Chemical Spray / Granules',
         'Entire internal and external premises, including fly-sensitive areas', 'Daily', 10
  UNION ALL SELECT 'Cockroach Control', 'Kitchen Premises', 'Residual Chemical Spray',
         'Kitchen and pantry areas on rotation basis', 'Weekly Once', 10
  UNION ALL SELECT 'Mosquito Control', 'Internal Premises', 'Residual Spray',
         'Entire internal common area', 'Daily', 10
  UNION ALL SELECT 'Mosquito Control', 'External Premises', 'Residual Spray / Residual Misting with natural oil',
         'External common area, parking and basement', 'Daily', 20
  UNION ALL SELECT 'Mosquito Control', 'Drainage and Stagnant Water Areas', 'Residual Spray',
         'Drainage and stagnant water in basement and garden', 'Fortnightly', 30
  UNION ALL SELECT 'Bedbugs Treatment', 'Rooms and Lobby Area', 'Chemical Spray',
         'Vacated rooms on rotation basis as per schedule', 'Daily', 10
  UNION ALL SELECT 'Honey Bee Removal', 'Required Area', 'Fogging',
         'Wherever formed in the premises and easily accessible', 'As and when required', 10
) t
JOIN `crm_quote_services` qs ON qs.name = t.service
WHERE NOT EXISTS (SELECT 1 FROM `crm_quote_service_treatments` x WHERE x.service_id = qs.id);

-- ---------------------------------------------------------------------------
-- 4. Plans
-- ---------------------------------------------------------------------------
INSERT INTO `crm_quote_plans` (`id`, `name`, `billing`, `visits_per_month`, `sort_order`)
SELECT UUID(), p.name, p.billing, p.visits, p.sort_order FROM (
  SELECT 'One-time Service' AS name, 'ONE_TIME' AS billing, NULL AS visits, 10 AS sort_order
  UNION ALL SELECT 'AMC - 1 Service / Month', 'MONTHLY', 1, 20
  UNION ALL SELECT 'AMC - 2 Services / Month', 'MONTHLY', 2, 30
  UNION ALL SELECT 'AMC - 4 Services / Month', 'MONTHLY', 4, 40
) p
WHERE NOT EXISTS (SELECT 1 FROM `crm_quote_plans` q WHERE q.name = p.name);

-- ---------------------------------------------------------------------------
-- 5. Placeholder prices (Rs.; AMC = per month). Only fills missing cells.
-- ---------------------------------------------------------------------------
INSERT INTO `crm_quote_service_prices` (`service_id`, `plan_id`, `price`)
SELECT qs.id, qp.id, x.price
FROM (
  SELECT 'Rat Control' AS service, 'One-time Service' AS plan, 3500 AS price
  UNION ALL SELECT 'Rat Control', 'AMC - 1 Service / Month', 2500
  UNION ALL SELECT 'Rat Control', 'AMC - 2 Services / Month', 4000
  UNION ALL SELECT 'Rat Control', 'AMC - 4 Services / Month', 7000
  UNION ALL SELECT 'Ants / Flies / Other Insects', 'One-time Service', 2500
  UNION ALL SELECT 'Ants / Flies / Other Insects', 'AMC - 1 Service / Month', 1800
  UNION ALL SELECT 'Ants / Flies / Other Insects', 'AMC - 2 Services / Month', 3000
  UNION ALL SELECT 'Ants / Flies / Other Insects', 'AMC - 4 Services / Month', 5500
  UNION ALL SELECT 'Cockroach Control', 'One-time Service', 2500
  UNION ALL SELECT 'Cockroach Control', 'AMC - 1 Service / Month', 1800
  UNION ALL SELECT 'Cockroach Control', 'AMC - 2 Services / Month', 3000
  UNION ALL SELECT 'Cockroach Control', 'AMC - 4 Services / Month', 5500
  UNION ALL SELECT 'Mosquito Control', 'One-time Service', 3000
  UNION ALL SELECT 'Mosquito Control', 'AMC - 1 Service / Month', 2200
  UNION ALL SELECT 'Mosquito Control', 'AMC - 2 Services / Month', 3800
  UNION ALL SELECT 'Mosquito Control', 'AMC - 4 Services / Month', 6500
  UNION ALL SELECT 'Bedbugs Treatment', 'One-time Service', 4000
  UNION ALL SELECT 'Bedbugs Treatment', 'AMC - 1 Service / Month', 3000
  UNION ALL SELECT 'Bedbugs Treatment', 'AMC - 2 Services / Month', 5000
  UNION ALL SELECT 'Bedbugs Treatment', 'AMC - 4 Services / Month', 9000
  UNION ALL SELECT 'Honey Bee Removal', 'One-time Service', 3000
) x
JOIN `crm_quote_services` qs ON qs.name = x.service
JOIN `crm_quote_plans` qp ON qp.name = x.plan
WHERE NOT EXISTS (SELECT 1 FROM `crm_quote_service_prices` p WHERE p.service_id = qs.id AND p.plan_id = qp.id);

-- ---------------------------------------------------------------------------
-- 6. Standard clauses
-- ---------------------------------------------------------------------------
INSERT INTO `crm_quote_clauses` (`id`, `kind`, `text`, `is_default`, `sort_order`)
SELECT UUID(), c.kind, c.text, c.is_default, c.sort_order FROM (
  SELECT 'VALUE_ADDED' AS kind, 'Time-to-time suggestions to prevent pest infestation.' AS text, 1 AS is_default, 10 AS sort_order
  UNION ALL SELECT 'VALUE_ADDED', 'A quality check report will be given every quarter.', 0, 20
  UNION ALL SELECT 'TERMS', 'All taxes extra as applicable.', 1, 10
  UNION ALL SELECT 'TERMS', 'All payments to be made in the name of Bestserve Pest Management Pvt. Ltd.', 1, 20
  UNION ALL SELECT 'TERMS', 'Any pest repellent machine will be installed at additional cost.', 0, 30
  UNION ALL SELECT 'TERMS', 'Any service to the staff room will be done at additional cost.', 0, 40
) c
WHERE NOT EXISTS (SELECT 1 FROM `crm_quote_clauses` q WHERE q.kind = c.kind AND q.text = c.text);

-- Verify
-- SELECT s.name, COUNT(t.id) AS treatment_rows FROM crm_quote_services s LEFT JOIN crm_quote_service_treatments t ON t.service_id = s.id GROUP BY s.id ORDER BY s.sort_order;
-- SELECT s.name, p.name AS plan, sp.price FROM crm_quote_service_prices sp JOIN crm_quote_services s ON s.id = sp.service_id JOIN crm_quote_plans p ON p.id = sp.plan_id ORDER BY s.sort_order, p.sort_order;
-- SELECT kind, text, is_default FROM crm_quote_clauses ORDER BY kind, sort_order;

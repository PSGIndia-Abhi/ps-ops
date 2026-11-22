-- Industry type master for commercial leads (crm_industry_types).
--
-- Until now the industry list (restaurant, apartment, hospital, it, qsr, builder, other) was
-- hard-coded in the backend, the web Leads app and the mobile app. This table holds it instead,
-- kept by whoever manages leads (sales manager, Managing Director, Personal Assistant - all with
-- MANAGE_LEADS - and admin) from "Industry Types" in the web Leads app.
--
--   code            what crm_leads.industry_type stores. Set once when a type is added and never
--                   changed, so renaming a type never touches the leads that use it.
--   name            the label people see ("Restaurant").
--   agreement_word  the word used for the customer in the agreement text
--                   ("the Apartment has agreed to accept ...").
--   sort_order      the order in the dropdowns.
--   is_active       a type is never deleted (leads keep its code); it is switched off instead.
--
-- New table + seed only. crm_leads is not changed: the seeded codes are exactly the ones its
-- industry_type column already holds. Safe to re-run.

CREATE TABLE IF NOT EXISTS `crm_industry_types` (
  `id` CHAR(36) NOT NULL,
  `code` VARCHAR(30) NOT NULL,
  `name` VARCHAR(60) NOT NULL,
  `agreement_word` VARCHAR(40) NOT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_crm_industry_types_code` (`code`),
  UNIQUE KEY `uq_crm_industry_types_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- The seven types the apps had built in, with the agreement words the backend used for them.
INSERT IGNORE INTO `crm_industry_types` (`id`, `code`, `name`, `agreement_word`, `sort_order`) VALUES
  (UUID(), 'restaurant', 'Restaurant', 'Restaurant', 10),
  (UUID(), 'apartment',  'Apartment',  'Apartment',  20),
  (UUID(), 'hospital',   'Hospital',   'Hospital',   30),
  (UUID(), 'it',         'IT',         'IT',         40),
  (UUID(), 'qsr',        'QSR',        'QSR',        50),
  (UUID(), 'builder',    'Builder',    'Builder',    60),
  (UUID(), 'other',      'Other',      'Company',    999);

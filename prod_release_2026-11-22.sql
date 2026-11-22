-- =====================================================================
-- PRODUCTION SQL - release of 2026-11-22
--
-- Run this BEFORE (or together with) deploying the new backend + web frontend.
-- Every part is additive and safe to re-run: new tables / new rows only.
-- No existing table, column or row is changed or removed (except the
-- optional designation in PART 4, which only fills an empty value).
--
--   PART 1  Industry Types master        (required)
--   PART 2  Personal quotation signatures (required)
--   PART 3  MD / PA lead-manager permissions (check; run only if missing)
--   PART 4  PA shown as "Sales Manager" on PDFs (optional - or do it in admin)
--   PART 5  Final checks
-- =====================================================================


-- =====================================================================
-- PART 1 - Industry Types master  (crm_industry_types)
-- Same as backend/src/data/migrations/20261122_create_crm_industry_types.sql
-- The 7 seeded codes are exactly the ones crm_leads.industry_type already holds.
-- =====================================================================
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

INSERT IGNORE INTO `crm_industry_types` (`id`, `code`, `name`, `agreement_word`, `sort_order`) VALUES
  (UUID(), 'restaurant', 'Restaurant', 'Restaurant', 10),
  (UUID(), 'apartment',  'Apartment',  'Apartment',  20),
  (UUID(), 'hospital',   'Hospital',   'Hospital',   30),
  (UUID(), 'it',         'IT',         'IT',         40),
  (UUID(), 'qsr',        'QSR',        'QSR',        50),
  (UUID(), 'builder',    'Builder',    'Builder',    60),
  (UUID(), 'other',      'Other',      'Company',    999);

-- Check 1a: 7 rows.
SELECT code, name, agreement_word, sort_order, is_active FROM crm_industry_types ORDER BY sort_order;

-- Check 1b: every industry code already used by leads must be in the master.
-- EXPECTED: no rows. (If any row appears, tell the developer before deploying.)
SELECT l.industry_type, COUNT(*) AS leads
  FROM crm_leads l
  LEFT JOIN crm_industry_types t ON t.code = l.industry_type
 WHERE l.industry_type IS NOT NULL AND t.code IS NULL
 GROUP BY l.industry_type;


-- =====================================================================
-- PART 2 - Personal quotation signatures  (user_signatures)
-- Same as backend/src/data/migrations/20261122b_create_user_signatures.sql
-- =====================================================================
CREATE TABLE IF NOT EXISTS `user_signatures` (
  `user_id` BIGINT NOT NULL,
  `object_key` VARCHAR(255) NOT NULL,
  `content_type` VARCHAR(40) NOT NULL,
  `uploaded_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  CONSTRAINT `fk_user_signatures_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Check 2: the table exists (empty until people upload their signature).
SELECT COUNT(*) AS signatures FROM user_signatures;


-- =====================================================================
-- PART 3 - MD / PA lead-manager permissions  (CHECK FIRST)
-- The Managing Director and Personal Assistant need MANAGE_LEADS to see
-- "Industry Types" (and to assign / convert leads). These come from the older
-- script crm_md_pa_sales_manager_permissions.sql - it may already be applied.
-- =====================================================================

-- Check 3: each of the two roles should list all three permissions.
SELECT r.name AS role, GROUP_CONCAT(p.name ORDER BY p.name) AS lead_permissions
  FROM roles r
  JOIN role_permissions rp ON rp.role_id = r.id
  JOIN permissions p ON p.id = rp.permission_id
 WHERE r.name IN ('Managing Director', 'Personal Assistant')
   AND p.name IN ('MANAGE_LEADS', 'CONVERT_LEAD', 'VIEW_TEAM_LEADS')
 GROUP BY r.name;

-- Only if Check 3 does NOT show "CONVERT_LEAD,MANAGE_LEADS,VIEW_TEAM_LEADS" for both
-- roles, run this (INSERT IGNORE = adds only what is missing):
-- INSERT IGNORE INTO role_permissions (role_id, permission_id)
-- SELECT r.id, p.id
--   FROM roles r
--   JOIN permissions p ON p.name IN ('MANAGE_LEADS', 'CONVERT_LEAD', 'VIEW_TEAM_LEADS')
--  WHERE r.name IN ('Managing Director', 'Personal Assistant');


-- =====================================================================
-- PART 4 - OPTIONAL: Personal Assistant shown as "Sales Manager" on the
-- quotation / agreement PDFs (designation). Skip this part if you set it from
-- Admin -> Departments -> Designations and Admin -> User Hierarchy instead.
-- The role "Personal Assistant" and its permissions are NOT changed.
-- =====================================================================

-- Check 4: what the PA has now. org_row_id NULL = not placed in the org hierarchy
-- (then the UPDATE below cannot set anything - place them in User Hierarchy first).
SELECT u.id, u.name, uo.id AS org_row_id, d.name AS current_designation
  FROM users u
  JOIN roles r ON r.id = u.role_id
  LEFT JOIN user_org_units uo ON uo.user_id = u.id
        AND (uo.effective_to IS NULL OR uo.effective_to >= CURDATE())
  LEFT JOIN designations d ON d.id = uo.designation_id
 WHERE r.name = 'Personal Assistant';

-- To apply, remove the "-- " in front of these lines:
-- START TRANSACTION;
-- INSERT IGNORE INTO designations (id, name, is_active) VALUES (UUID(), 'Sales Manager', 1);
-- UPDATE user_org_units uo
--   JOIN users u ON u.id = uo.user_id
--   JOIN roles r ON r.id = u.role_id
--    SET uo.designation_id = (SELECT id FROM designations WHERE name = 'Sales Manager')
--  WHERE r.name = 'Personal Assistant'
--    AND uo.designation_id IS NULL
--    AND (uo.effective_to IS NULL OR uo.effective_to >= CURDATE());
-- COMMIT;


-- =====================================================================
-- PART 5 - Final checks (all should return what is described)
-- =====================================================================
SELECT 'crm_industry_types' AS new_table, COUNT(*) AS rows_now FROM crm_industry_types   -- 7
UNION ALL
SELECT 'user_signatures', COUNT(*) FROM user_signatures;                                  -- 0 (or more)

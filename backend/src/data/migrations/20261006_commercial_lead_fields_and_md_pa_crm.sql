-- Commercial lead form changes + CRM access for Managing Director / Personal Assistant.
--
-- 1. New commercial-lead columns on crm_leads (all NULL-able, existing rows untouched):
--      industry_type        restaurant | apartment | hospital | it | qsr | builder | other
--      contact_designation  the contact person's designation (free text)
--      services_requested   comma-separated: gpc, rodent_control, cockroach_control,
--                           ant_treatment, honeybee_control, snake_control, fly_control
--      latitude, longitude  where the lead was taken (the phone's GPS). `location` keeps an
--                           address typed by hand when the GPS could not be read.
--
-- 2. New permission CRM_VIEW_ALL_LEADS. From now on a user WITHOUT it (sales, marketing) sees
--    only the leads they created themselves; a user WITH it sees every lead.
--
-- 3. "Managing Director" and "Personal Assistant" get the five CRM permissions (so they can
--    open the Sales app and add leads) plus CRM_VIEW_ALL_LEADS.
--
-- Additive only. Safe to re-run.
-- Run this BEFORE deploying the backend that reads these columns.

SET @has_col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_leads' AND COLUMN_NAME = 'industry_type'
);
SET @sql := IF(@has_col = 0,
  'ALTER TABLE `crm_leads` ADD COLUMN `industry_type` VARCHAR(30) NULL AFTER `company_name`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_leads' AND COLUMN_NAME = 'contact_designation'
);
SET @sql := IF(@has_col = 0,
  'ALTER TABLE `crm_leads` ADD COLUMN `contact_designation` VARCHAR(100) NULL AFTER `industry_type`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_leads' AND COLUMN_NAME = 'services_requested'
);
SET @sql := IF(@has_col = 0,
  'ALTER TABLE `crm_leads` ADD COLUMN `services_requested` VARCHAR(255) NULL AFTER `plan_type`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_leads' AND COLUMN_NAME = 'latitude'
);
SET @sql := IF(@has_col = 0,
  'ALTER TABLE `crm_leads` ADD COLUMN `latitude` DECIMAL(10,7) NULL AFTER `location`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_leads' AND COLUMN_NAME = 'longitude'
);
SET @sql := IF(@has_col = 0,
  'ALTER TABLE `crm_leads` ADD COLUMN `longitude` DECIMAL(10,7) NULL AFTER `latitude`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

INSERT INTO permissions (name)
SELECT 'CRM_VIEW_ALL_LEADS' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'CRM_VIEW_ALL_LEADS');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  JOIN permissions p
 WHERE r.name IN ('Managing Director', 'Personal Assistant')
   AND p.name IN ('CRM_ACCESS', 'CRM_VIEW_SERVICE_PRICE', 'CRM_CREATE_LEAD',
                  'CRM_VIEW_LEAD', 'CRM_COLLECT_PAYMENT', 'CRM_VIEW_ALL_LEADS')
   AND NOT EXISTS (
     SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
   );

-- Verify (expected: 2 roles x 6 permissions = 12 rows)
-- SELECT r.name AS role, p.name AS permission
--   FROM role_permissions rp
--   JOIN roles r ON r.id = rp.role_id
--   JOIN permissions p ON p.id = rp.permission_id
--  WHERE r.name IN ('Managing Director', 'Personal Assistant') AND p.name LIKE 'CRM_%'
--  ORDER BY r.name, p.name;

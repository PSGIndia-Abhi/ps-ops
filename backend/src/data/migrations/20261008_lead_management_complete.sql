-- Lead Management: the COMPLETE database setup, in one file.
--
-- Run this INSTEAD OF the three 20261007 files. It contains everything they do, plus the
-- pieces that were missing when the query was handed over, and it is SAFE TO RUN MORE THAN
-- ONCE: every column, index, table, row and grant is only added if it is not there yet. So it
-- also finishes the job on a database where part of the earlier query was already run.
--
--   1. New columns and indexes on crm_leads (commercial leads only; residential untouched)
--   2. Ten new crm_lead_* tables
--   3. The link from crm_leads.loss_reason_id to the reasons table
--   4. Number counters for LD-2026-000123 and QT-2026-000123
--      (without these, saving a commercial lead or a quotation fails)
--   5. Starter lead sources and loss reasons
--   6. Permissions, the three new roles, and who gets what
--   7. Commercial leads saved before today get a lead number and a pipeline stage
--
-- Nothing existing is altered or deleted.

-- ---------------------------------------------------------------------------
-- 1. crm_leads: new columns and indexes
-- ---------------------------------------------------------------------------
SET @x := (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_leads' AND COLUMN_NAME = 'lead_number');
SET @sql := IF(@x = 0, 'ALTER TABLE `crm_leads` ADD COLUMN `lead_number` VARCHAR(30) NULL AFTER `id`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @x := (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_leads' AND COLUMN_NAME = 'provider_id');
SET @sql := IF(@x = 0, 'ALTER TABLE `crm_leads` ADD COLUMN `provider_id` BIGINT NULL AFTER `created_by_user_id`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @x := (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_leads' AND COLUMN_NAME = 'pipeline_stage');
SET @sql := IF(@x = 0, 'ALTER TABLE `crm_leads` ADD COLUMN `pipeline_stage` VARCHAR(25) NULL AFTER `lead_status`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @x := (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_leads' AND COLUMN_NAME = 'assigned_telecaller_id');
SET @sql := IF(@x = 0, 'ALTER TABLE `crm_leads` ADD COLUMN `assigned_telecaller_id` BIGINT NULL AFTER `pipeline_stage`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @x := (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_leads' AND COLUMN_NAME = 'assigned_sales_employee_id');
SET @sql := IF(@x = 0, 'ALTER TABLE `crm_leads` ADD COLUMN `assigned_sales_employee_id` BIGINT NULL AFTER `assigned_telecaller_id`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @x := (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_leads' AND COLUMN_NAME = 'loss_reason_id');
SET @sql := IF(@x = 0, 'ALTER TABLE `crm_leads` ADD COLUMN `loss_reason_id` CHAR(36) NULL AFTER `assigned_sales_employee_id`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @x := (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_leads' AND COLUMN_NAME = 'row_version');
SET @sql := IF(@x = 0, 'ALTER TABLE `crm_leads` ADD COLUMN `row_version` INT NOT NULL DEFAULT 1 AFTER `loss_reason_id`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @x := (SELECT COUNT(*) FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_leads' AND INDEX_NAME = 'uq_crm_leads_number');
SET @sql := IF(@x = 0, 'ALTER TABLE `crm_leads` ADD UNIQUE KEY `uq_crm_leads_number` (`lead_number`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @x := (SELECT COUNT(*) FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_leads' AND INDEX_NAME = 'idx_crm_leads_telecaller');
SET @sql := IF(@x = 0, 'ALTER TABLE `crm_leads` ADD KEY `idx_crm_leads_telecaller` (`assigned_telecaller_id`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @x := (SELECT COUNT(*) FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_leads' AND INDEX_NAME = 'idx_crm_leads_sales_emp');
SET @sql := IF(@x = 0, 'ALTER TABLE `crm_leads` ADD KEY `idx_crm_leads_sales_emp` (`assigned_sales_employee_id`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @x := (SELECT COUNT(*) FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_leads' AND INDEX_NAME = 'idx_crm_leads_provider');
SET @sql := IF(@x = 0, 'ALTER TABLE `crm_leads` ADD KEY `idx_crm_leads_provider` (`provider_id`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- 2. New tables (definitions unchanged from 20261007_create_lead_management_tables.sql)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `crm_lead_sources` (
  `id` CHAR(36) NOT NULL,
  `name` VARCHAR(60) NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_crm_lead_sources_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `crm_lead_loss_reasons` (
  `id` CHAR(36) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_crm_lrr_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `crm_lead_provider_profiles` (
  `user_id` BIGINT NOT NULL,
  `organization_name` VARCHAR(150) NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  CONSTRAINT `fk_clpp_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `crm_lead_call_activities` (
  `id` CHAR(36) NOT NULL,
  `lead_id` CHAR(36) NOT NULL,
  `telecaller_id` BIGINT NOT NULL,
  `outcome` VARCHAR(20) NOT NULL,
  `qualification_status` VARCHAR(20) NULL,
  `comments` TEXT NULL,
  `next_follow_up_at` DATETIME NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_clca_lead` (`lead_id`),
  CONSTRAINT `fk_clca_lead` FOREIGN KEY (`lead_id`) REFERENCES `crm_leads` (`id`),
  CONSTRAINT `fk_clca_telecaller` FOREIGN KEY (`telecaller_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `crm_lead_meetings` (
  `id` CHAR(36) NOT NULL,
  `lead_id` CHAR(36) NOT NULL,
  `sales_employee_id` BIGINT NOT NULL,
  `scheduled_at` DATETIME NOT NULL,
  `meeting_type` VARCHAR(20) NOT NULL DEFAULT 'SITE_VISIT',
  `meeting_address` VARCHAR(255) NULL,
  `notes` TEXT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED',
  `check_in_at` DATETIME NULL,
  `check_in_lat` DECIMAL(10,7) NULL,
  `check_in_lng` DECIMAL(10,7) NULL,
  `check_out_at` DATETIME NULL,
  `check_out_lat` DECIMAL(10,7) NULL,
  `check_out_lng` DECIMAL(10,7) NULL,
  `outcome_notes` TEXT NULL,
  `task_id` CHAR(36) NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_clm_lead` (`lead_id`),
  KEY `idx_clm_sales_emp` (`sales_employee_id`, `scheduled_at`),
  CONSTRAINT `fk_clm_lead` FOREIGN KEY (`lead_id`) REFERENCES `crm_leads` (`id`),
  CONSTRAINT `fk_clm_sales_emp` FOREIGN KEY (`sales_employee_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_clm_task` FOREIGN KEY (`task_id`) REFERENCES `work_tasks` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `crm_lead_quotations` (
  `id` CHAR(36) NOT NULL,
  `lead_id` CHAR(36) NOT NULL,
  `quotation_number` VARCHAR(50) NOT NULL,
  `total_amount` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `status` VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  `pdf_object_key` VARCHAR(500) NULL,
  `sent_at` DATETIME NULL,
  `responded_at` DATETIME NULL,
  `created_by` BIGINT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_clq_number` (`quotation_number`),
  KEY `idx_clq_lead` (`lead_id`),
  CONSTRAINT `fk_clq_lead` FOREIGN KEY (`lead_id`) REFERENCES `crm_leads` (`id`),
  CONSTRAINT `fk_clq_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `crm_lead_quotation_items` (
  `id` CHAR(36) NOT NULL,
  `quotation_id` CHAR(36) NOT NULL,
  `description` VARCHAR(255) NOT NULL,
  `quantity` INT NOT NULL DEFAULT 1,
  `unit_price` DECIMAL(12,2) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_clqi_quotation` (`quotation_id`),
  CONSTRAINT `fk_clqi_quotation` FOREIGN KEY (`quotation_id`) REFERENCES `crm_lead_quotations` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `crm_lead_conversions` (
  `id` CHAR(36) NOT NULL,
  `lead_id` CHAR(36) NOT NULL,
  `company_id` CHAR(36) NOT NULL,
  `converted_by` BIGINT NULL,
  `converted_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `notes` VARCHAR(500) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_clc_lead` (`lead_id`),
  CONSTRAINT `fk_clc_lead` FOREIGN KEY (`lead_id`) REFERENCES `crm_leads` (`id`),
  CONSTRAINT `fk_clc_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_clc_converted_by` FOREIGN KEY (`converted_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `crm_lead_feedback` (
  `id` CHAR(36) NOT NULL,
  `lead_id` CHAR(36) NOT NULL,
  `message` VARCHAR(1000) NOT NULL,
  `created_by` BIGINT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_clf_lead` (`lead_id`),
  CONSTRAINT `fk_clf_lead` FOREIGN KEY (`lead_id`) REFERENCES `crm_leads` (`id`),
  CONSTRAINT `fk_clf_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `crm_lead_history` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `lead_id` CHAR(36) NOT NULL,
  `action` VARCHAR(50) NOT NULL,
  `note` VARCHAR(500) NULL,
  `changed_by` BIGINT NULL,
  `changed_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_clh_lead` (`lead_id`),
  CONSTRAINT `fk_clh_lead` FOREIGN KEY (`lead_id`) REFERENCES `crm_leads` (`id`),
  CONSTRAINT `fk_clh_changed_by` FOREIGN KEY (`changed_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------------
-- 3. crm_leads.loss_reason_id -> crm_lead_loss_reasons
-- ---------------------------------------------------------------------------
SET @x := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_leads' AND CONSTRAINT_NAME = 'fk_crm_leads_loss_reason');
SET @sql := IF(@x = 0,
  'ALTER TABLE `crm_leads` ADD CONSTRAINT `fk_crm_leads_loss_reason` FOREIGN KEY (`loss_reason_id`) REFERENCES `crm_lead_loss_reasons` (`id`)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- 4. Number counters (same `sequences` table the job codes use)
-- ---------------------------------------------------------------------------
INSERT INTO `sequences` (`name`, `value`) SELECT 'crm_lead_number', 0 FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `sequences` WHERE `name` = 'crm_lead_number');
INSERT INTO `sequences` (`name`, `value`) SELECT 'crm_quotation_number', 0 FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `sequences` WHERE `name` = 'crm_quotation_number');

-- ---------------------------------------------------------------------------
-- 5. Starter master data (the name is unique, so a re-run adds nothing)
-- ---------------------------------------------------------------------------
INSERT IGNORE INTO `crm_lead_sources` (`id`, `name`) VALUES
  (UUID(), 'Lead Provider'),
  (UUID(), 'Referral'),
  (UUID(), 'Website'),
  (UUID(), 'Google'),
  (UUID(), 'Field Visit'),
  (UUID(), 'Existing Client Reference'),
  (UUID(), 'Other');

INSERT IGNORE INTO `crm_lead_loss_reasons` (`id`, `name`) VALUES
  (UUID(), 'Not Interested'),
  (UUID(), 'Budget Issue'),
  (UUID(), 'Competitor Selected'),
  (UUID(), 'Duplicate'),
  (UUID(), 'Invalid Contact'),
  (UUID(), 'Already Have a Vendor'),
  (UUID(), 'Unreachable');

-- ---------------------------------------------------------------------------
-- 6. Permissions, roles and grants
--
--    lead_provider   no CRM permission at all: the provider portal is gated by the role itself.
--    telecaller      sees every commercial lead (the shared queue) and can add leads. It can act
--                    on a lead once it has claimed it.
--    sales_manager   sees and manages every lead, and can convert.
--    sales/marketing can convert their own leads (they already hold the CRM_* permissions).
--    Managing Director / Personal Assistant  see every lead, as agreed for the Sales app.
-- ---------------------------------------------------------------------------
INSERT INTO `permissions` (`name`) SELECT 'VIEW_TEAM_LEADS' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `name` = 'VIEW_TEAM_LEADS');
INSERT INTO `permissions` (`name`) SELECT 'MANAGE_LEADS' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `name` = 'MANAGE_LEADS');
INSERT INTO `permissions` (`name`) SELECT 'VIEW_ALL_LEADS' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `name` = 'VIEW_ALL_LEADS');
INSERT INTO `permissions` (`name`) SELECT 'CONVERT_LEAD' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `name` = 'CONVERT_LEAD');

INSERT INTO `roles` (`name`) SELECT 'lead_provider' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `roles` WHERE `name` = 'lead_provider');
INSERT INTO `roles` (`name`) SELECT 'telecaller' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `roles` WHERE `name` = 'telecaller');
INSERT INTO `roles` (`name`) SELECT 'sales_manager' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `roles` WHERE `name` = 'sales_manager');

INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `roles` r JOIN `permissions` p
 WHERE r.name IN ('telecaller')
   AND p.name IN ('CRM_ACCESS', 'CRM_VIEW_LEAD', 'CRM_CREATE_LEAD', 'VIEW_ALL_LEADS')
   AND NOT EXISTS (SELECT 1 FROM `role_permissions` rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `roles` r JOIN `permissions` p
 WHERE r.name IN ('sales_manager')
   AND p.name IN ('CRM_ACCESS', 'CRM_VIEW_SERVICE_PRICE', 'CRM_VIEW_LEAD', 'CRM_CREATE_LEAD',
                  'VIEW_ALL_LEADS', 'VIEW_TEAM_LEADS', 'MANAGE_LEADS', 'CONVERT_LEAD')
   AND NOT EXISTS (SELECT 1 FROM `role_permissions` rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `roles` r JOIN `permissions` p
 WHERE r.name IN ('sales', 'marketing')
   AND p.name IN ('CONVERT_LEAD')
   AND NOT EXISTS (SELECT 1 FROM `role_permissions` rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `roles` r JOIN `permissions` p
 WHERE r.name IN ('Managing Director', 'Personal Assistant')
   AND p.name IN ('VIEW_ALL_LEADS')
   AND NOT EXISTS (SELECT 1 FROM `role_permissions` rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

-- ---------------------------------------------------------------------------
-- 7. Commercial leads saved before today
--
--    They have no pipeline stage and no lead number, so the new screens could not move them
--    along. The stage is taken from the old status: new -> NEW, contacted -> QUALIFIED,
--    converted -> CONVERTED, lost -> LOST. Numbers are given oldest first and the counter is
--    left on the last one used. Only rows still missing a value are touched.
-- ---------------------------------------------------------------------------
UPDATE `crm_leads`
   SET `pipeline_stage` = CASE `lead_status`
                            WHEN 'contacted' THEN 'QUALIFIED'
                            WHEN 'converted' THEN 'CONVERTED'
                            WHEN 'lost' THEN 'LOST'
                            ELSE 'NEW'
                          END
 WHERE `lead_type` = 'commercial' AND `pipeline_stage` IS NULL;

SET @n := (SELECT `value` FROM `sequences` WHERE `name` = 'crm_lead_number');
UPDATE `crm_leads`
   SET `lead_number` = CONCAT('LD-', YEAR(`created_at`), '-', LPAD((@n := @n + 1), 6, '0'))
 WHERE `lead_type` = 'commercial' AND `lead_number` IS NULL
 ORDER BY `created_at`, `id`;
UPDATE `sequences` SET `value` = @n WHERE `name` = 'crm_lead_number';

-- Verify
-- SELECT pipeline_stage, COUNT(*) FROM crm_leads WHERE lead_type = 'commercial' GROUP BY pipeline_stage;
-- SELECT name, value FROM sequences;
-- SELECT r.name AS role, p.name AS permission FROM role_permissions rp
--   JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id
--  WHERE r.name IN ('telecaller', 'sales_manager', 'lead_provider') ORDER BY r.name, p.name;

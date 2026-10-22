-- Lead Management module, step 1 (DB schema): extends the existing crm_leads
-- table (commercial leads only -- the consumer flow and its separate mobile
-- app are untouched) and adds the new tables needed for the telecaller
-- workflow, meetings, quotations, conversion, provider portal and audit.
--
-- lead_status (existing: new/contacted/converted/lost) is left completely
-- alone, for backward compatibility with the live consumer-lead mobile app.
-- pipeline_stage is a new, separate column carrying the richer commercial
-- lifecycle (NEW/TO_CALL/QUALIFIED/MEETING_SCHEDULED/VISIT_COMPLETED/
-- QUOTATION_SENT/WON/CONVERTED/NEED_MORE_INFO/NOT_GENUINE/LOST/CANCELLED).

ALTER TABLE `crm_leads`
  ADD COLUMN `lead_number` VARCHAR(30) NULL AFTER `id`,
  ADD COLUMN `provider_id` BIGINT NULL AFTER `created_by_user_id`,
  ADD COLUMN `pipeline_stage` VARCHAR(25) NULL AFTER `lead_status`,
  ADD COLUMN `assigned_telecaller_id` BIGINT NULL AFTER `pipeline_stage`,
  ADD COLUMN `assigned_sales_employee_id` BIGINT NULL AFTER `assigned_telecaller_id`,
  ADD COLUMN `loss_reason_id` CHAR(36) NULL AFTER `assigned_sales_employee_id`,
  ADD COLUMN `row_version` INT NOT NULL DEFAULT 1 AFTER `loss_reason_id`,
  ADD UNIQUE KEY `uq_crm_leads_number` (`lead_number`),
  ADD KEY `idx_crm_leads_telecaller` (`assigned_telecaller_id`),
  ADD KEY `idx_crm_leads_sales_emp` (`assigned_sales_employee_id`),
  ADD KEY `idx_crm_leads_provider` (`provider_id`);

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

-- Now FK-able: loss_reason_id on crm_leads.
ALTER TABLE `crm_leads`
  ADD CONSTRAINT `fk_crm_leads_loss_reason` FOREIGN KEY (`loss_reason_id`) REFERENCES `crm_lead_loss_reasons` (`id`);

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

INSERT INTO `permissions` (`name`) SELECT 'VIEW_TEAM_LEADS' WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `name` = 'VIEW_TEAM_LEADS');
INSERT INTO `permissions` (`name`) SELECT 'MANAGE_LEADS' WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `name` = 'MANAGE_LEADS');
INSERT INTO `permissions` (`name`) SELECT 'VIEW_ALL_LEADS' WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `name` = 'VIEW_ALL_LEADS');
INSERT INTO `permissions` (`name`) SELECT 'CONVERT_LEAD' WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `name` = 'CONVERT_LEAD');
INSERT INTO `roles` (`name`) SELECT 'lead_provider' WHERE NOT EXISTS (SELECT 1 FROM `roles` WHERE `name` = 'lead_provider');

-- Sequence for the human-readable lead_number (LD-2026-000123), same
-- counter-table pattern already used for job codes.
INSERT INTO `sequences` (`name`, `value`) SELECT 'crm_lead_number', 0 WHERE NOT EXISTS (SELECT 1 FROM `sequences` WHERE `name` = 'crm_lead_number');

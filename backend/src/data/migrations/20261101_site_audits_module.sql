-- Site Audits module: tables, risk levels and permissions.
-- Safe to run more than once: tables use IF NOT EXISTS and the inserts skip rows
-- that already exist. Needs the users, companies and sites tables (already there).

CREATE TABLE IF NOT EXISTS `audit_risk_levels` (
  `code` varchar(20) NOT NULL,
  `label` varchar(50) NOT NULL,
  `severity_rank` tinyint NOT NULL,
  `default_days` int DEFAULT NULL,
  `timeline_bucket` varchar(30) NOT NULL,
  `color_hex` char(7) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by` bigint DEFAULT NULL,
  PRIMARY KEY (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `audits` (
  `id` char(36) NOT NULL,
  `audit_number` varchar(30) NOT NULL,
  `company_id` varchar(20) NOT NULL,
  `site_id` varchar(20) NOT NULL,
  `branch_id` char(36) DEFAULT NULL,
  `audit_date` date NOT NULL,
  `audit_type` varchar(50) NOT NULL,
  `target_pests` json NOT NULL,
  `auditor_user_id` bigint NOT NULL,
  `escort_name` varchar(150) NOT NULL,
  `escort_designation` varchar(100) DEFAULT NULL,
  `escort_contact` varchar(20) DEFAULT NULL,
  `customer_action_label` varchar(40) NOT NULL DEFAULT 'Customer action',
  `site_notes` text,
  `cover_photo_id` char(36) DEFAULT NULL,
  `report_options` json DEFAULT NULL,
  `overall_risk` varchar(20) DEFAULT NULL,
  `overall_risk_override` varchar(20) DEFAULT NULL,
  `override_reason` varchar(500) DEFAULT NULL,
  `override_by` bigint DEFAULT NULL,
  `status` enum('IN_PROGRESS','SUBMITTED','AMENDING','CANCELLED') NOT NULL DEFAULT 'IN_PROGRESS',
  `started_at` datetime NOT NULL,
  `submitted_at` datetime DEFAULT NULL,
  `submitted_by` bigint DEFAULT NULL,
  `current_report_id` char(36) DEFAULT NULL,
  `row_version` int NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_by` bigint NOT NULL,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_audits_number` (`audit_number`),
  KEY `idx_audits_site_date` (`site_id`,`audit_date`),
  KEY `idx_audits_company` (`company_id`),
  KEY `idx_audits_status` (`status`),
  KEY `idx_audits_auditor` (`auditor_user_id`),
  KEY `idx_audits_branch` (`branch_id`),
  KEY `fk_audits_created_by` (`created_by`),
  KEY `fk_audits_override_risk` (`overall_risk_override`),
  CONSTRAINT `fk_audits_auditor` FOREIGN KEY (`auditor_user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_audits_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_audits_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_audits_override_risk` FOREIGN KEY (`overall_risk_override`) REFERENCES `audit_risk_levels` (`code`),
  CONSTRAINT `fk_audits_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `audit_areas` (
  `id` char(36) NOT NULL,
  `audit_id` char(36) NOT NULL,
  `area_number` int NOT NULL,
  `area_name` varchar(200) NOT NULL,
  `zone_name` varchar(150) DEFAULT NULL,
  `notes` text,
  `status` enum('NOT_STARTED','IN_PROGRESS','COMPLETED') NOT NULL DEFAULT 'NOT_STARTED',
  `saved_at` datetime DEFAULT NULL,
  `row_version` int NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_by` bigint NOT NULL,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_audit_area_number` (`audit_id`,`area_number`),
  CONSTRAINT `fk_audit_areas_audit` FOREIGN KEY (`audit_id`) REFERENCES `audits` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `audit_findings` (
  `id` char(36) NOT NULL,
  `audit_id` char(36) NOT NULL,
  `area_id` char(36) NOT NULL,
  `finding_number` int NOT NULL,
  `title` varchar(250) NOT NULL,
  `risk_category` varchar(255) NOT NULL,
  `risk_type_text` varchar(250) DEFAULT NULL,
  `risk_level` varchar(20) NOT NULL,
  `action_within_days` int DEFAULT NULL,
  `action_due_date` date DEFAULT NULL,
  `observation_text` text,
  `customer_action_text` text,
  `bestserve_action_text` text,
  `no_photo_reason` varchar(500) DEFAULT NULL,
  `status` enum('OPEN','RESOLVED','CLOSED') NOT NULL DEFAULT 'OPEN',
  `follow_up_task_id` char(36) DEFAULT NULL,
  `row_version` int NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_by` bigint NOT NULL,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_audit_finding_number` (`audit_id`,`finding_number`),
  KEY `idx_audit_findings_area` (`area_id`),
  KEY `idx_audit_findings_risk` (`audit_id`,`risk_level`),
  KEY `fk_audit_findings_risk` (`risk_level`),
  KEY `fk_audit_findings_task` (`follow_up_task_id`),
  CONSTRAINT `fk_audit_findings_area` FOREIGN KEY (`area_id`) REFERENCES `audit_areas` (`id`),
  CONSTRAINT `fk_audit_findings_audit` FOREIGN KEY (`audit_id`) REFERENCES `audits` (`id`),
  CONSTRAINT `fk_audit_findings_risk` FOREIGN KEY (`risk_level`) REFERENCES `audit_risk_levels` (`code`),
  CONSTRAINT `fk_audit_findings_task` FOREIGN KEY (`follow_up_task_id`) REFERENCES `work_tasks` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `audit_finding_photos` (
  `id` char(36) NOT NULL,
  `audit_id` char(36) NOT NULL,
  `finding_id` char(36) NOT NULL,
  `object_key` varchar(500) NOT NULL,
  `file_name` varchar(255) DEFAULT NULL,
  `mime_type` varchar(100) NOT NULL,
  `size_bytes` int NOT NULL,
  `width` int DEFAULT NULL,
  `height` int DEFAULT NULL,
  `caption` varchar(500) DEFAULT NULL,
  `include_in_report` tinyint(1) NOT NULL DEFAULT '1',
  `display_order` int NOT NULL DEFAULT '1',
  `crop` json DEFAULT NULL,
  `latitude` decimal(10,7) DEFAULT NULL,
  `longitude` decimal(10,7) DEFAULT NULL,
  `captured_at` datetime DEFAULT NULL,
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `deleted_at` datetime DEFAULT NULL,
  `deleted_by` bigint DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_by` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_audit_photos_finding` (`finding_id`,`display_order`),
  KEY `idx_audit_photos_audit` (`audit_id`),
  CONSTRAINT `fk_audit_photos_audit` FOREIGN KEY (`audit_id`) REFERENCES `audits` (`id`),
  CONSTRAINT `fk_audit_photos_finding` FOREIGN KEY (`finding_id`) REFERENCES `audit_findings` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `audit_voice_notes` (
  `id` char(36) NOT NULL,
  `audit_id` char(36) NOT NULL,
  `finding_id` char(36) NOT NULL,
  `field_type` enum('OBSERVATION','CUSTOMER_ACTION','BESTSERVE_ACTION') NOT NULL,
  `object_key` varchar(500) NOT NULL,
  `file_name` varchar(255) DEFAULT NULL,
  `mime_type` varchar(100) NOT NULL,
  `size_bytes` int NOT NULL,
  `duration_seconds` int DEFAULT NULL,
  `source_language` varchar(10) DEFAULT NULL,
  `detected_language` varchar(10) DEFAULT NULL,
  `transcript` text,
  `english_draft` text,
  `accepted_text` text,
  `status` enum('UPLOADED','QUEUED','PROCESSING','REVIEW_REQUIRED','ACCEPTED','FAILED','MANUAL') NOT NULL DEFAULT 'UPLOADED',
  `attempts` tinyint NOT NULL DEFAULT '0',
  `model_name` varchar(100) DEFAULT NULL,
  `error_message` text,
  `is_current` tinyint(1) NOT NULL DEFAULT '1',
  `recorded_at` datetime DEFAULT NULL,
  `processed_at` datetime DEFAULT NULL,
  `accepted_by` bigint DEFAULT NULL,
  `accepted_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_by` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_audit_voice_finding_field` (`finding_id`,`field_type`,`is_current`),
  KEY `idx_audit_voice_status` (`status`),
  KEY `fk_audit_voice_audit` (`audit_id`),
  CONSTRAINT `fk_audit_voice_audit` FOREIGN KEY (`audit_id`) REFERENCES `audits` (`id`),
  CONSTRAINT `fk_audit_voice_finding` FOREIGN KEY (`finding_id`) REFERENCES `audit_findings` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `audit_signoffs` (
  `audit_id` char(36) NOT NULL,
  `received_by_name` varchar(150) NOT NULL,
  `received_by_designation` varchar(100) DEFAULT NULL,
  `received_at` datetime DEFAULT NULL,
  `next_audit_date` date DEFAULT NULL,
  `remarks` varchar(500) DEFAULT NULL,
  `recorded_by` bigint NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`audit_id`),
  CONSTRAINT `fk_audit_signoffs_audit` FOREIGN KEY (`audit_id`) REFERENCES `audits` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `audit_reports` (
  `id` char(36) NOT NULL,
  `audit_id` char(36) NOT NULL,
  `version` int NOT NULL,
  `status` enum('QUEUED','GENERATING','GENERATED','FAILED') NOT NULL DEFAULT 'QUEUED',
  `template_version` varchar(20) NOT NULL,
  `snapshot` json DEFAULT NULL,
  `object_key` varchar(500) DEFAULT NULL,
  `size_bytes` int DEFAULT NULL,
  `checksum_sha256` char(64) DEFAULT NULL,
  `page_count` int DEFAULT NULL,
  `reason` varchar(500) DEFAULT NULL,
  `attempts` tinyint NOT NULL DEFAULT '0',
  `error_message` text,
  `requested_by` bigint NOT NULL,
  `requested_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `generated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_audit_report_version` (`audit_id`,`version`),
  KEY `idx_audit_reports_status` (`status`),
  CONSTRAINT `fk_audit_reports_audit` FOREIGN KEY (`audit_id`) REFERENCES `audits` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `audit_recommendations` (
  `id` char(36) NOT NULL,
  `audit_id` char(36) NOT NULL,
  `bucket` enum('IMMEDIATE','WITHIN_7_DAYS','WITHIN_30_DAYS','ONGOING') NOT NULL,
  `owner` enum('CUSTOMER','BESTSERVE') NOT NULL,
  `text` varchar(500) NOT NULL,
  `finding_ids` json DEFAULT NULL,
  `source` enum('AUTO','MANUAL') NOT NULL DEFAULT 'MANUAL',
  `display_order` int NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_by` bigint NOT NULL,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_audit_recs_audit` (`audit_id`,`bucket`,`display_order`),
  CONSTRAINT `fk_audit_recs_audit` FOREIGN KEY (`audit_id`) REFERENCES `audits` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `audit_history` (
  `id` char(36) NOT NULL,
  `audit_id` char(36) NOT NULL,
  `entity_type` varchar(30) NOT NULL,
  `entity_id` char(36) DEFAULT NULL,
  `action` varchar(50) NOT NULL,
  `message` text,
  `old_value` json DEFAULT NULL,
  `new_value` json DEFAULT NULL,
  `created_by` bigint DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_audit_history_audit` (`audit_id`,`created_at`),
  CONSTRAINT `fk_audit_history_audit` FOREIGN KEY (`audit_id`) REFERENCES `audits` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Risk levels (CRITICAL 1 day, HIGH 7, MEDIUM 30, LOW = monitor).
INSERT IGNORE INTO audit_risk_levels (code, label, severity_rank, default_days, timeline_bucket, color_hex, is_active) VALUES
  ('CRITICAL', 'Critical', 4, 1, 'IMMEDIATE', '#8B1A1A', 1),
  ('HIGH', 'High', 3, 7, 'WITHIN_7_DAYS', '#C2410C', 1),
  ('MEDIUM', 'Medium', 2, 30, 'WITHIN_30_DAYS', '#F2C14E', 1),
  ('LOW', 'Low', 1, NULL, 'ONGOING', '#B9D94A', 1);

-- Permissions (added only if missing).
INSERT INTO permissions (name)
SELECT p.name FROM (
  SELECT 'VIEW_AUDIT' AS name UNION ALL SELECT 'CREATE_AUDIT' UNION ALL SELECT 'UPDATE_AUDIT' UNION ALL SELECT 'SUBMIT_AUDIT'
  UNION ALL SELECT 'AMEND_AUDIT' UNION ALL SELECT 'GENERATE_AUDIT_REPORT' UNION ALL SELECT 'OVERRIDE_AUDIT_RISK' UNION ALL SELECT 'MANAGE_AUDIT_SETTINGS'
) p
WHERE NOT EXISTS (SELECT 1 FROM permissions x WHERE x.name = p.name);

-- admin: every audit permission.
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
  ON p.name IN ('VIEW_AUDIT','CREATE_AUDIT','UPDATE_AUDIT','SUBMIT_AUDIT','AMEND_AUDIT','GENERATE_AUDIT_REPORT','OVERRIDE_AUDIT_RISK','MANAGE_AUDIT_SETTINGS')
WHERE r.name = 'admin';

-- supervisor: view, create, edit and submit audits.
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
  ON p.name IN ('VIEW_AUDIT','CREATE_AUDIT','UPDATE_AUDIT','SUBMIT_AUDIT')
WHERE r.name = 'supervisor';

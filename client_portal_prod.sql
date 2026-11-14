-- =====================================================================
-- CLIENT PORTAL - production database changes (run once, before deploying the new backend)
--
-- Combines these migrations, in order:
--   20261111_client_portal_01_role.sql
--   20261111_client_portal_02_ticket_site.sql
--   20261111_client_portal_03_documents.sql
--   20261111_client_portal_04_service_requests.sql
--
-- What it does:
--   1. Adds the "client" role if it is missing (data only).
--   2. Adds job_tickets.site_id + index (complaints raised against an outlet).
--   3. Creates the new table client_documents (files shared with clients).
--   4. Creates the new table client_service_requests (Request a Service).
--
-- Safe to re-run: every step checks first (IF NOT EXISTS / information_schema),
-- so running it twice changes nothing. No existing data is changed or deleted.
--
-- IMPORTANT: run this BEFORE the new backend goes live - Admin > Tickets reads
-- job_tickets.site_id. Take a database backup first, as with any production change.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) "client" role
-- ---------------------------------------------------------------------
INSERT INTO roles (name)
SELECT 'client'
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'client');


-- ---------------------------------------------------------------------
-- 2) job_tickets.site_id (+ index)
-- ---------------------------------------------------------------------
SET @has_site_id := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'job_tickets' AND COLUMN_NAME = 'site_id'
);
SET @sql := IF(@has_site_id = 0,
  'ALTER TABLE `job_tickets` ADD COLUMN `site_id` VARCHAR(20) NULL AFTER `priority`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_site_idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'job_tickets' AND INDEX_NAME = 'idx_job_tickets_site'
);
SET @sql := IF(@has_site_idx = 0,
  'ALTER TABLE `job_tickets` ADD INDEX `idx_job_tickets_site` (`site_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ---------------------------------------------------------------------
-- 3) client_documents
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `client_documents` (
  `id`           CHAR(36)      NOT NULL,
  `company_id`   VARCHAR(20)   NOT NULL,
  `site_id`      VARCHAR(20)   NULL,
  `title`        VARCHAR(200)  NOT NULL,
  `doc_type`     VARCHAR(30)   NOT NULL DEFAULT 'OTHER',
  `object_key`   VARCHAR(500)  NOT NULL,
  `file_name`    VARCHAR(255)  NOT NULL,
  `file_type`    VARCHAR(120)  NULL,
  `size_bytes`   INT UNSIGNED  NULL,
  `valid_until`  DATE          NULL,
  `notes`        VARCHAR(500)  NULL,
  `is_active`    TINYINT(1)    NOT NULL DEFAULT 1,
  `uploaded_by`  BIGINT        NULL,
  `created_at`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_client_documents_company` (`company_id`, `is_active`),
  KEY `idx_client_documents_site` (`site_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- ---------------------------------------------------------------------
-- 4) client_service_requests
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `client_service_requests` (
  `id`              CHAR(36)      NOT NULL,
  `company_id`      VARCHAR(20)   NOT NULL,
  `site_id`         VARCHAR(20)   NOT NULL,
  `requested_by`    BIGINT        NOT NULL,
  `service_type`    VARCHAR(20)   NOT NULL,
  `sub_services`    JSON          NOT NULL,
  `preferred_date`  DATE          NULL,
  `preferred_slot`  VARCHAR(20)   NULL,
  `notes`           VARCHAR(1000) NULL,
  `status`          ENUM('NEW','ASSIGNED','REJECTED','CANCELLED') NOT NULL DEFAULT 'NEW',
  `booking_id`      CHAR(36)      NULL,
  `staff_note`      VARCHAR(500)  NULL,
  `handled_by`      BIGINT        NULL,
  `handled_at`      DATETIME      NULL,
  `created_at`      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_csr_status` (`status`, `created_at`),
  KEY `idx_csr_company` (`company_id`),
  KEY `idx_csr_site` (`site_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- ---------------------------------------------------------------------
-- Check (expected: 1 role row, site_id column present, both tables present)
-- ---------------------------------------------------------------------
SELECT 'client role'               AS item, COUNT(*) AS found FROM roles WHERE name = 'client'
UNION ALL
SELECT 'job_tickets.site_id',       COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'job_tickets' AND COLUMN_NAME = 'site_id'
UNION ALL
SELECT 'client_documents table',    COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'client_documents'
UNION ALL
SELECT 'client_service_requests',   COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'client_service_requests';

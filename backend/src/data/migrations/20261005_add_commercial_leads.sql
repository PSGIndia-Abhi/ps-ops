-- Commercial leads for the CRM (Sales & Marketing) lead app.
--
-- A lead is now either 'consumer' (the existing kind: house type + service +
-- plan + payment) or 'commercial' (a business enquiry: company, address,
-- approximate quote, photos - no payment).
--
--   crm_leads.lead_type        'consumer' | 'commercial'. Every existing row
--                              becomes 'consumer' through the column default.
--   crm_leads.company_name     commercial only.
--   crm_leads.alternate_phone  commercial only.
--   crm_lead_photos            photos attached to a commercial lead. The file
--                              itself lives in MinIO; this row is metadata.
--
-- A commercial lead reuses `location` for its address and `amount` for the
-- approximate quote. Its house_type / service_name / plan_type are stored as
-- '' and its payment_method / payment_status as 'none' / 'na', so no existing
-- column is altered.
--
-- Additive only: no existing column or row is changed. Safe to re-run - each
-- column / index is only added if it's missing.
-- Run this BEFORE deploying the backend that reads crm_leads.lead_type.

SET @has_lead_type := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_leads' AND COLUMN_NAME = 'lead_type'
);
SET @sql := IF(@has_lead_type = 0,
  'ALTER TABLE `crm_leads` ADD COLUMN `lead_type` VARCHAR(12) NOT NULL DEFAULT ''consumer'' AFTER `id`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_company_name := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_leads' AND COLUMN_NAME = 'company_name'
);
SET @sql := IF(@has_company_name = 0,
  'ALTER TABLE `crm_leads` ADD COLUMN `company_name` VARCHAR(150) NULL AFTER `customer_name`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_alternate_phone := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_leads' AND COLUMN_NAME = 'alternate_phone'
);
SET @sql := IF(@has_alternate_phone = 0,
  'ALTER TABLE `crm_leads` ADD COLUMN `alternate_phone` VARCHAR(15) NULL AFTER `phone`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_lead_type_idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_leads' AND INDEX_NAME = 'idx_crm_leads_type_created'
);
SET @sql := IF(@has_lead_type_idx = 0,
  'ALTER TABLE `crm_leads` ADD INDEX `idx_crm_leads_type_created` (`lead_type`, `created_at`)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS `crm_lead_photos` (
  `id` CHAR(36) NOT NULL,
  `lead_id` CHAR(36) NOT NULL,
  `object_key` VARCHAR(255) NOT NULL,
  `file_name` VARCHAR(255) NOT NULL,
  `file_type` VARCHAR(100) NOT NULL,
  `file_size` INT NOT NULL,
  `client_ref` VARCHAR(40) NULL,
  `uploaded_by` BIGINT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_crm_lead_photos_lead` (`lead_id`),
  UNIQUE KEY `uq_crm_lead_photos_ref` (`lead_id`, `client_ref`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Photos attached to commercial CRM leads';

-- Verify
-- SELECT lead_type, COUNT(*) FROM crm_leads GROUP BY lead_type;
-- SHOW CREATE TABLE crm_lead_photos;

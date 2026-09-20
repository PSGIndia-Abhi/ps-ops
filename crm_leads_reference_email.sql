-- =====================================================================
-- CRM leads: add "Reference By" and customer email (additive, nullable).
-- Safe to re-run (checks information_schema first). Run on local, then production,
-- BEFORE deploying the matching backend/app - the new backend writes these columns.
-- =====================================================================

SET @has_email := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_leads' AND COLUMN_NAME = 'customer_email'
);
SET @ddl := IF(@has_email = 0,
  'ALTER TABLE crm_leads ADD COLUMN customer_email VARCHAR(150) NULL AFTER phone',
  'SELECT ''customer_email already exists'' AS message');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_ref := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_leads' AND COLUMN_NAME = 'reference_by'
);
SET @ddl := IF(@has_ref = 0,
  'ALTER TABLE crm_leads ADD COLUMN reference_by VARCHAR(100) NULL AFTER lead_source',
  'SELECT ''reference_by already exists'' AS message');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

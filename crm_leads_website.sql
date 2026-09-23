-- =====================================================================
-- CRM leads: remember which website booking a lead came from (additive, nullable).
-- external_ref = the website's booking reference (e.g. BS-20260920-12345). It is UNIQUE so the
-- website's "booking confirmed" call and its Razorpay webhook can both report the same booking
-- without creating two leads. Safe to re-run. Run on local, then production, BEFORE deploying
-- the matching backend (the new /api/public/leads route writes this column).
-- =====================================================================

SET @has_col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_leads' AND COLUMN_NAME = 'external_ref'
);
SET @ddl := IF(@has_col = 0,
  'ALTER TABLE crm_leads ADD COLUMN external_ref VARCHAR(40) NULL AFTER created_by_user_id',
  'SELECT ''external_ref already exists'' AS message');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_leads' AND INDEX_NAME = 'uq_crm_leads_external_ref'
);
SET @ddl := IF(@has_idx = 0,
  'ALTER TABLE crm_leads ADD UNIQUE KEY uq_crm_leads_external_ref (external_ref)',
  'SELECT ''uq_crm_leads_external_ref already exists'' AS message');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

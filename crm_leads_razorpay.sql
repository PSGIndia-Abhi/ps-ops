-- =====================================================================
-- Razorpay columns for crm_leads (additive - adds 3 nullable columns + 1 index).
-- Run this ONCE on every database that already has crm_leads (local, then production).
-- Safe to run again: it checks first and does nothing if the columns already exist.
-- (crm_leads.sql now creates these columns itself for a brand-new install.)
-- =====================================================================

SET @already := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_leads' AND COLUMN_NAME = 'razorpay_order_id'
);

SET @ddl := IF(@already = 0,
  'ALTER TABLE crm_leads
     ADD COLUMN razorpay_order_id   VARCHAR(40) NULL AFTER lead_status,
     ADD COLUMN razorpay_payment_id VARCHAR(40) NULL AFTER razorpay_order_id,
     ADD COLUMN paid_at             TIMESTAMP   NULL AFTER razorpay_payment_id,
     ADD KEY idx_crm_leads_rzp_order (razorpay_order_id)',
  'SELECT ''crm_leads already has the Razorpay columns - nothing to do'' AS message');

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Verify (expected: razorpay_order_id, razorpay_payment_id, paid_at)
-- SHOW COLUMNS FROM crm_leads LIKE 'razorpay%';
-- SHOW COLUMNS FROM crm_leads LIKE 'paid_at';

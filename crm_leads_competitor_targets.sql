-- =====================================================================
-- Lead Management: competitor details on commercial leads, and monthly sales targets.
-- Additive only (new nullable columns + one new table). Safe to re-run (checks first).
-- Run on local, then production, BEFORE deploying the matching backend - it reads these.
-- =====================================================================

-- 1. Competitor details on a lead: who serves the customer now, their price, when the contract ends.
SET @c1 := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_leads' AND COLUMN_NAME = 'competitor_name');
SET @ddl := IF(@c1 = 0, 'ALTER TABLE crm_leads ADD COLUMN competitor_name VARCHAR(150) NULL', 'SELECT ''competitor_name already exists'' AS message');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c2 := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_leads' AND COLUMN_NAME = 'competitor_amount');
SET @ddl := IF(@c2 = 0, 'ALTER TABLE crm_leads ADD COLUMN competitor_amount DECIMAL(12,2) NULL', 'SELECT ''competitor_amount already exists'' AS message');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c3 := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_leads' AND COLUMN_NAME = 'competitor_contract_end');
SET @ddl := IF(@c3 = 0, 'ALTER TABLE crm_leads ADD COLUMN competitor_contract_end DATE NULL', 'SELECT ''competitor_contract_end already exists'' AS message');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c4 := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_leads' AND COLUMN_NAME = 'competitor_notes');
SET @ddl := IF(@c4 = 0, 'ALTER TABLE crm_leads ADD COLUMN competitor_notes VARCHAR(500) NULL', 'SELECT ''competitor_notes already exists'' AS message');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. Monthly sales targets: what a sales executive should convert in a month (set by the sales manager).
CREATE TABLE IF NOT EXISTS crm_sales_targets (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  month CHAR(7) NOT NULL,              -- 'YYYY-MM'
  target_amount DECIMAL(12,2) NOT NULL,
  set_by BIGINT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sales_target_user_month (user_id, month)
);

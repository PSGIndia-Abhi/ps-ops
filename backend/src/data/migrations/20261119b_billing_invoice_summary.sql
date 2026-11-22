-- Invoice generation: services and chemicals on a contract, and invoice line summaries.
--
--   billing_chemicals                     the chemicals billed to customers. There is no screen to
--                                         manage it: a chemical typed on a contract (Services and prices
--                                         > Chemicals) is added here, and can be picked for other customers.
--   billing_contract_lines.item_kind      SERVICE (from the service list, as before) or CHEMICAL.
--   billing_contract_lines.invoice_group  optional summary: lines with the same text are printed on the
--                                         invoice as ONE line (item name = the text, amount = their total).
--   billing_invoice_lines.invoice_group   copied onto each draft line from its contract line.
--
-- The lines stay separate inside the invoice (services done, shortfall and checks work as before);
-- only the printed invoice merges a group. No group = one printed line each, as before.
-- New table and optional columns only; nothing existing changes. Invoices already issued keep their
-- printed copy. Run once (after 20261116_billing_module.sql). Safe to re-run.
-- In phpMyAdmin, select the ps_ops database in the left panel first (or keep the USE line).

USE ps_ops;

CREATE TABLE IF NOT EXISTS billing_chemicals (
  id          CHAR(36)     NOT NULL,
  name        VARCHAR(255) NOT NULL,
  is_active   TINYINT(1)   NOT NULL DEFAULT 1,
  created_by  BIGINT       NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bchem_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Invoice generation: chemicals that can be billed on a contract';

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_contract_lines' AND COLUMN_NAME = 'item_kind');
SET @sql := IF(@has = 0,
  'ALTER TABLE billing_contract_lines ADD COLUMN item_kind ENUM(''SERVICE'',''CHEMICAL'') NOT NULL DEFAULT ''SERVICE'' AFTER item_name',
  'SELECT ''billing_contract_lines.item_kind already exists'' AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_contract_lines' AND COLUMN_NAME = 'invoice_group');
SET @sql := IF(@has = 0,
  'ALTER TABLE billing_contract_lines ADD COLUMN invoice_group VARCHAR(255) NULL DEFAULT NULL AFTER item_kind',
  'SELECT ''billing_contract_lines.invoice_group already exists'' AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_invoice_lines' AND COLUMN_NAME = 'invoice_group');
SET @sql := IF(@has = 0,
  'ALTER TABLE billing_invoice_lines ADD COLUMN invoice_group VARCHAR(255) NULL DEFAULT NULL AFTER item_name',
  'SELECT ''billing_invoice_lines.invoice_group already exists'' AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Chemicals already typed on contracts (none before this step; kept for re-runs).
INSERT IGNORE INTO billing_chemicals (id, name)
SELECT UUID(), d.item_name
  FROM (SELECT DISTINCT TRIM(item_name) AS item_name FROM billing_contract_lines
         WHERE item_kind = 'CHEMICAL' AND TRIM(item_name) <> '') AS d;

-- Invoice generation: group based contracts.
--
-- New contract asks first: "Group based" or "Service based" (as before).
-- A group based contract covers several companies of one group (companies.group_id -> group_name)
-- with ONE Bill To for the group, and is billed as one invoice.
--
--   billing_contracts.contract_kind   SERVICE (one customer, as before) or GROUP
--   billing_contracts.group_id        the group of a GROUP contract (NULL for SERVICE)
--   billing_contract_companies        the companies a GROUP contract covers (company_id on the contract
--                                     stays the first of them, so existing screens keep working)
--   billing_contract_lines.company_id the ticked company a line is for (group based: one invoice line
--                                     per company - item name, bill value, quantity; NULL otherwise)
--   billing_group_profiles            the group's Bill To: billing name, address, GSTIN, state,
--                                     payment terms (like billing_profiles, but for a group)
--
-- New table / optional columns only; existing contracts are SERVICE and unchanged.
-- Run once (after 20261116_billing_module.sql). Safe to re-run.
-- In phpMyAdmin, select the ps_ops database in the left panel first (or keep the USE line).

USE ps_ops;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_contracts' AND COLUMN_NAME = 'contract_kind');
SET @sql := IF(@has = 0,
  'ALTER TABLE billing_contracts
     ADD COLUMN contract_kind ENUM(''SERVICE'',''GROUP'') NOT NULL DEFAULT ''SERVICE'' AFTER contract_code,
     ADD COLUMN group_id CHAR(36) NULL DEFAULT NULL AFTER company_id,
     ADD KEY idx_bc_group (group_id)',
  'SELECT ''billing_contracts.contract_kind already exists'' AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS billing_contract_companies (
  contract_id  CHAR(36)    NOT NULL,
  company_id   VARCHAR(20) NOT NULL,
  created_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (contract_id, company_id),
  KEY idx_bcc_company (company_id),
  CONSTRAINT fk_bcc_contract FOREIGN KEY (contract_id) REFERENCES billing_contracts (id) ON DELETE CASCADE,
  CONSTRAINT fk_bcc_company  FOREIGN KEY (company_id)  REFERENCES companies (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Invoice generation: the companies a group based contract covers';

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_contract_lines' AND COLUMN_NAME = 'company_id');
SET @sql := IF(@has = 0,
  'ALTER TABLE billing_contract_lines
     ADD COLUMN company_id VARCHAR(20) NULL DEFAULT NULL AFTER contract_id,
     ADD KEY idx_bcl_company (company_id),
     ADD CONSTRAINT fk_bcl_company FOREIGN KEY (company_id) REFERENCES companies (id)',
  'SELECT ''billing_contract_lines.company_id already exists'' AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS billing_group_profiles (
  group_id            CHAR(36)     NOT NULL,
  billing_name        VARCHAR(255) NOT NULL,
  billing_address     TEXT         NOT NULL,
  state_code          CHAR(2)      NOT NULL DEFAULT '29',
  state_name          VARCHAR(50)  NOT NULL DEFAULT 'Karnataka',
  gst_number          VARCHAR(15)  NULL,
  payment_terms_days  INT          NOT NULL DEFAULT 30,
  is_active           TINYINT(1)   NOT NULL DEFAULT 1,
  created_by          BIGINT       NULL,
  updated_by          BIGINT       NULL,
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (group_id),
  CONSTRAINT fk_bgp_group FOREIGN KEY (group_id) REFERENCES group_name (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Invoice generation: one Bill To for a group (group based contracts)';

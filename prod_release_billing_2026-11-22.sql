-- =====================================================================
-- PRODUCTION SQL - Billing / Invoice Generation release (2026-11-22)
--
-- Run this on the production database BEFORE deploying the new backend + web frontend.
-- Select the production database first (phpMyAdmin: click it in the left panel), then run the
-- whole file. It is in order and every step is safe to re-run: a table, column or key that is
-- already there is skipped, so it does not matter which of these steps production already has.
-- Nothing existing is removed, except PART 11, which moves the single PO file on customer_pos into
-- customer_po_files and then drops those two old columns (only while they still exist).
--
-- Do NOT add BILLING_ACCOUNTS_LINK=true to the production backend .env yet: billing invoices stay
-- out of the Accountant Panel until billing is set up there.
--
-- Parts:
--   PART  1  TDS on the invoice amount or the taxable value (companies, invoices, invoice_tds)
--   PART  2  Billing module: contracts, POs, service plans, invoices, sequences, permissions
--   PART  3  TDS in whole rupees on invoices with no TDS deducted yet
--   PART  4  Contract: GST applicable
--   PART  5  Service plan lines for the whole customer
--   PART  6  GST rate on contracts and invoices
--   PART  7  Invoice descriptions master
--   PART  8  Billing frequencies master
--   PART  9  Invoice line summaries
--   PART 10  Service months
--   PART 11  Brigade-ready billing tables (PO files, invoice source, job on lines)
--   PART 12  Accounts Executive: full billing permissions
--   PART 13  Customer profile: print copies, invoice emails, outlet settings
--   PART 14  Monthly SOS (Service Coordinator)
--   PART 15  Late billing alerts
--   PART 16  Email invoices automatically
--   PART 17  Payments recorded in Billing
--   PART 18  Group based contracts
--   PART 19  Description wordings: service / chemical / termite
--   PART 20  Termite daily / weekly / monthly
--   PART 21  Termite treated area on the SOS
--   PART 22  Separate bills (services / chemicals)
--   PART 23  Manual invoices (Generate Invoice)
--   PART 24  Separate bills: two invoices per period
--   PART 25  Files attached to the monthly SOS (sent with the invoice email)
--   PART 26  Print copies: 0 allowed, no 1-4 limit
--   PART 27  Rate per service with 4 decimals
--   PART 28  Service Offered To address on the billing details
--   PART 29  Final checks
-- =====================================================================


-- =====================================================================
-- PART 1 - TDS on the invoice amount or the taxable value (companies, invoices, invoice_tds)
-- Same as backend/src/data/migrations/20261116_add_tds_basis.sql (made safe to re-run)
-- =====================================================================
SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companies' AND COLUMN_NAME = 'tds_basis') = 0,
  'ALTER TABLE companies ADD COLUMN tds_basis ENUM(''INVOICE'',''TAXABLE'') NOT NULL DEFAULT ''INVOICE'' AFTER tds_rate', 'DO 0');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;
SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invoices' AND COLUMN_NAME = 'taxable_amount') = 0,
  'ALTER TABLE invoices ADD COLUMN taxable_amount DECIMAL(15,2) NULL AFTER invoice_amount', 'DO 0');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;
SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invoice_tds' AND COLUMN_NAME = 'tds_basis') = 0,
  'ALTER TABLE invoice_tds ADD COLUMN tds_basis ENUM(''INVOICE'',''TAXABLE'') NOT NULL DEFAULT ''INVOICE'' AFTER tds_rate', 'DO 0');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;


-- =====================================================================
-- PART 2 - Billing module: contracts, POs, service plans, invoices, sequences, permissions
-- Same as backend/src/data/migrations/20261116_billing_module.sql
-- =====================================================================
-- Invoice Generation (Billing) module: all tables, permissions and role grants.
-- Same content as PARTS A-G of docs/Invoice Generation - All SQL.sql.
-- Safe to re-run: every statement skips what already exists.
-- Run once against ps_ops (take a mysqldump backup first). In phpMyAdmin, select the
-- ps_ops database in the left panel before running.

SET NAMES utf8mb4;


-- =====================================================================
-- PART A. MASTERS – billing profile, contracts, price list
-- =====================================================================

CREATE TABLE IF NOT EXISTS billing_profiles (
  company_id          VARCHAR(20)  NOT NULL,
  billing_name        VARCHAR(255) NOT NULL,
  billing_address     TEXT         NOT NULL,
  state_code          CHAR(2)      NOT NULL DEFAULT '29',
  state_name          VARCHAR(50)  NOT NULL DEFAULT 'Karnataka',
  payment_terms_days  INT          NOT NULL DEFAULT 0,
  is_active           TINYINT(1)   NOT NULL DEFAULT 1,
  created_by          BIGINT       NULL,
  updated_by          BIGINT       NULL,
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (company_id),
  CONSTRAINT fk_bprof_company    FOREIGN KEY (company_id) REFERENCES companies (id),
  CONSTRAINT fk_bprof_created_by FOREIGN KEY (created_by) REFERENCES users (id),
  CONSTRAINT fk_bprof_updated_by FOREIGN KEY (updated_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Invoice generation: billing details of a customer';

CREATE TABLE IF NOT EXISTS billing_contracts (
  id                   CHAR(36)      NOT NULL,
  contract_code        VARCHAR(30)   NOT NULL,
  company_id           VARCHAR(20)   NOT NULL,
  billing_type         ENUM('AMC','ONE_TIME','TERMITE','CHEMICAL') NOT NULL,
  frequency_months     TINYINT       NULL,
  cycle_start_day      TINYINT       NOT NULL DEFAULT 1,
  bill_timing          ENUM('ARREARS','ADVANCE') NOT NULL DEFAULT 'ARREARS',
  start_date           DATE          NOT NULL,
  end_date             DATE          NULL,
  next_period_start    DATE          NOT NULL,
  invoice_grouping     ENUM('PER_CUSTOMER','PER_SITE') NOT NULL DEFAULT 'PER_CUSTOMER',
  site_id              VARCHAR(20)   NULL,
  po_required          TINYINT(1)    NOT NULL DEFAULT 0,
  shortfall_billing    ENUM('PRO_RATA','FULL') NOT NULL DEFAULT 'PRO_RATA',
  description_template VARCHAR(500)  NOT NULL,
  status               ENUM('ACTIVE','PAUSED','ENDED') NOT NULL DEFAULT 'ACTIVE',
  status_reason        VARCHAR(500)  NULL,
  notes                VARCHAR(1000) NULL,
  created_by           BIGINT        NULL,
  updated_by           BIGINT        NULL,
  created_at           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME      NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bcon_code (contract_code),
  KEY idx_bcon_company (company_id),
  KEY idx_bcon_due (status, next_period_start),
  CONSTRAINT chk_bcon_freq CHECK (frequency_months IS NULL OR frequency_months IN (1,3,4,6,12)),
  CONSTRAINT chk_bcon_day  CHECK (cycle_start_day BETWEEN 1 AND 31),
  CONSTRAINT fk_bcon_company    FOREIGN KEY (company_id) REFERENCES companies (id),
  CONSTRAINT fk_bcon_site       FOREIGN KEY (site_id)    REFERENCES sites (id),
  CONSTRAINT fk_bcon_created_by FOREIGN KEY (created_by) REFERENCES users (id),
  CONSTRAINT fk_bcon_updated_by FOREIGN KEY (updated_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Invoice generation: how a customer is billed';

CREATE TABLE IF NOT EXISTS billing_contract_lines (
  id                CHAR(36)      NOT NULL,
  contract_id       CHAR(36)      NOT NULL,
  site_id           VARCHAR(20)   NULL,
  item_name         VARCHAR(255)  NOT NULL,
  sac_code          VARCHAR(10)   NULL,
  service_id        CHAR(36)      NULL,
  plan_service_type VARCHAR(50)   NULL,   -- links the line to a service-plan line
  plan_sub_service  VARCHAR(100)  NULL,   -- (same values as jobs.service_type / sub_service)
  pricing_basis     ENUM('FIXED','PER_SERVICE','PER_UNIT') NOT NULL,
  unit              VARCHAR(20)   NOT NULL DEFAULT 'nos',
  rate              DECIMAL(12,2) NOT NULL,
  default_qty       DECIMAL(12,3) NULL,
  effective_from    DATE          NOT NULL,
  effective_to      DATE          NULL,
  sort_order        INT           NOT NULL DEFAULT 0,
  is_active         TINYINT(1)    NOT NULL DEFAULT 1,
  created_by        BIGINT        NULL,
  updated_by        BIGINT        NULL,
  created_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME      NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_bcl_contract (contract_id, is_active),
  KEY idx_bcl_plan (site_id, plan_service_type, plan_sub_service),
  CONSTRAINT chk_bcl_rate       CHECK (rate >= 0),
  CONSTRAINT fk_bcl_contract    FOREIGN KEY (contract_id) REFERENCES billing_contracts (id),
  CONSTRAINT fk_bcl_site        FOREIGN KEY (site_id)     REFERENCES sites (id),
  CONSTRAINT fk_bcl_service     FOREIGN KEY (service_id)  REFERENCES crm_quote_services (id),
  CONSTRAINT fk_bcl_created_by  FOREIGN KEY (created_by)  REFERENCES users (id),
  CONSTRAINT fk_bcl_updated_by  FOREIGN KEY (updated_by)  REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Invoice generation: per-customer price list';

-- Running number for contract codes (AMC-0012 …), using the existing sequences table.
INSERT INTO sequences (name, value)
SELECT 'billing_contract', 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sequences WHERE name = 'billing_contract');


-- =====================================================================
-- PART B. SERVICE PLANS – fixed services per month, print copies,
--         invoices per month (set by the Service Coordinator)
-- =====================================================================

CREATE TABLE IF NOT EXISTS billing_service_plans (
  id                      CHAR(36)     NOT NULL,
  company_id              VARCHAR(20)  NOT NULL,
  version                 INT          NOT NULL,
  effective_from          DATE         NOT NULL,           -- always the 1st of a month
  status                  ENUM('SCHEDULED','ACTIVE','ENDED') NOT NULL DEFAULT 'SCHEDULED',
  print_copies            TINYINT      NOT NULL DEFAULT 1, -- 1 Original, 2 Duplicate, 3 Triplicate, 4 Extra
  invoice_split           ENUM('ALL_OUTLETS','PER_OUTLET') NOT NULL DEFAULT 'ALL_OUTLETS',
  invoices_per_month      TINYINT      NOT NULL DEFAULT 1,
  shortfall_highlight_day TINYINT      NOT NULL DEFAULT 25,
  notes                   VARCHAR(500) NULL,
  created_by              BIGINT       NULL,
  updated_by              BIGINT       NULL,
  created_at              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              DATETIME     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bsp_version   (company_id, version),
  UNIQUE KEY uq_bsp_effective (company_id, effective_from),
  KEY idx_bsp_status (status, effective_from),
  CONSTRAINT chk_bsp_copies   CHECK (print_copies BETWEEN 1 AND 4),
  CONSTRAINT chk_bsp_invoices CHECK (invoices_per_month BETWEEN 1 AND 50),
  CONSTRAINT chk_bsp_day      CHECK (shortfall_highlight_day BETWEEN 1 AND 31),
  CONSTRAINT chk_bsp_first    CHECK (DAY(effective_from) = 1),
  CONSTRAINT fk_bsp_company    FOREIGN KEY (company_id) REFERENCES companies (id),
  CONSTRAINT fk_bsp_created_by FOREIGN KEY (created_by) REFERENCES users (id),
  CONSTRAINT fk_bsp_updated_by FOREIGN KEY (updated_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Invoice generation: service plan (one row per version)';

CREATE TABLE IF NOT EXISTS billing_service_plan_lines (
  id               CHAR(36)     NOT NULL,
  plan_id          CHAR(36)     NOT NULL,
  site_id          VARCHAR(20)  NOT NULL,
  service_type     VARCHAR(50)  NOT NULL,   -- matches jobs.service_type
  sub_service      VARCHAR(100) NOT NULL,   -- matches jobs.sub_service
  visits_per_month TINYINT      NOT NULL,
  sort_order       INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bspl_service (plan_id, site_id, service_type, sub_service),
  KEY idx_bspl_site (site_id, service_type, sub_service),
  CONSTRAINT chk_bspl_visits CHECK (visits_per_month BETWEEN 1 AND 31),
  CONSTRAINT fk_bspl_plan FOREIGN KEY (plan_id) REFERENCES billing_service_plans (id) ON DELETE CASCADE,
  CONSTRAINT fk_bspl_site FOREIGN KEY (site_id) REFERENCES sites (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Invoice generation: planned visits per outlet and service each month';


-- =====================================================================
-- PART C. PURCHASE ORDERS – POs, Open POs, Termite advances, expiry alerts
-- =====================================================================

CREATE TABLE IF NOT EXISTS customer_pos (
  id              CHAR(36)      NOT NULL,
  company_id      VARCHAR(20)   NOT NULL,
  contract_id     CHAR(36)      NULL,
  po_number       VARCHAR(100)  NOT NULL,
  po_date         DATE          NOT NULL,
  valid_from      DATE          NULL,
  expiry_date     DATE          NULL,          -- NULL = Open PO (no end date)
  po_amount       DECIMAL(15,2) NULL,          -- incl. GST; NULL = no limit
  po_kind         ENUM('STANDARD','ADVANCE') NOT NULL DEFAULT 'STANDARD',
  status          ENUM('ACTIVE','CLOSED')    NOT NULL DEFAULT 'ACTIVE',
  file_object_key TEXT          NULL,          -- MinIO key of the PO copy
  file_name       VARCHAR(255)  NULL,
  remarks         VARCHAR(1000) NULL,
  created_by      BIGINT        NULL,
  updated_by      BIGINT        NULL,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cpo_number (company_id, po_number),
  KEY idx_cpo_expiry (status, expiry_date),
  CONSTRAINT fk_cpo_company    FOREIGN KEY (company_id)  REFERENCES companies (id),
  CONSTRAINT fk_cpo_contract   FOREIGN KEY (contract_id) REFERENCES billing_contracts (id),
  CONSTRAINT fk_cpo_created_by FOREIGN KEY (created_by)  REFERENCES users (id),
  CONSTRAINT fk_cpo_updated_by FOREIGN KEY (updated_by)  REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Invoice generation: customer purchase orders';

CREATE TABLE IF NOT EXISTS customer_po_advances (
  id          CHAR(36) NOT NULL,
  po_id       CHAR(36) NOT NULL,
  payment_id  CHAR(36) NOT NULL,
  created_by  BIGINT   NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cpoa_payment (payment_id),
  KEY idx_cpoa_po (po_id),
  CONSTRAINT fk_cpoa_po         FOREIGN KEY (po_id)      REFERENCES customer_pos (id) ON DELETE CASCADE,
  CONSTRAINT fk_cpoa_payment    FOREIGN KEY (payment_id) REFERENCES payments (id),
  CONSTRAINT fk_cpoa_created_by FOREIGN KEY (created_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Invoice generation: advance payments behind an advance (Termite) PO';

CREATE TABLE IF NOT EXISTS billing_po_alerts (
  po_id      CHAR(36) NOT NULL,
  alert_kind ENUM('D15','D7','D0') NOT NULL,
  sent_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (po_id, alert_kind),
  CONSTRAINT fk_bpa_po FOREIGN KEY (po_id) REFERENCES customer_pos (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Invoice generation: PO expiry alerts already sent';


-- =====================================================================
-- PART D. INVOICES – bill runs, invoices, lines, POs on invoice,
--         Termite advance adjustments
-- =====================================================================

-- Shared invoice number counter (already created by the Brigade module;
-- same definition, so this is a no-op where it exists).
CREATE TABLE IF NOT EXISTS brigade_invoice_sequences (
  fy          CHAR(5)   NOT NULL,              -- financial year, e.g. 26-27
  last_number INT       NOT NULL,              -- last number handed out in that year
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (fy)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Brigade invoice running number per financial year';

CREATE TABLE IF NOT EXISTS billing_runs (
  id                 CHAR(36) NOT NULL,
  period_month       CHAR(7)  NOT NULL,          -- YYYY-MM
  contracts_selected INT      NOT NULL DEFAULT 0,
  drafts_created     INT      NOT NULL DEFAULT 0,
  skipped            JSON     NULL,
  run_by             BIGINT   NULL,
  run_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_brun_month (period_month),
  CONSTRAINT fk_brun_user FOREIGN KEY (run_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Invoice generation: bill run history';

CREATE TABLE IF NOT EXISTS billing_invoices (
  id                    CHAR(36)      NOT NULL,
  contract_id           CHAR(36)      NOT NULL,
  company_id            VARCHAR(20)   NOT NULL,
  site_id               VARCHAR(20)   NULL,           -- set when one invoice per outlet
  bill_run_id           CHAR(36)      NULL,
  billing_type          ENUM('AMC','ONE_TIME','TERMITE','CHEMICAL') NOT NULL,
  customer_category     ENUM('COMMERCIAL','RESIDENTIAL') NOT NULL,
  tax_mode              ENUM('CGST_SGST','IGST','NONE')   NOT NULL,
  place_of_supply       VARCHAR(50)   NOT NULL,
  ship_to_site_id       VARCHAR(20)   NULL,
  period_start          DATE          NOT NULL,
  period_end            DATE          NOT NULL,
  invoice_date          DATE          NOT NULL,
  due_date              DATE          NULL,
  invoice_number        VARCHAR(30)   NULL,           -- given on issue, e.g. BSPMPL26-27/1215
  fy                    CHAR(5)       NULL,
  seq                   INT           NULL,
  subtotal              DECIMAL(15,2) NOT NULL DEFAULT 0,
  cgst                  DECIMAL(15,2) NOT NULL DEFAULT 0,
  sgst                  DECIMAL(15,2) NOT NULL DEFAULT 0,
  igst                  DECIMAL(15,2) NOT NULL DEFAULT 0,
  round_off             DECIMAL(6,2)  NOT NULL DEFAULT 0,
  total                 DECIMAL(15,2) NOT NULL DEFAULT 0,
  advance_adjusted      DECIMAL(15,2) NOT NULL DEFAULT 0,
  print_copies          TINYINT       NOT NULL DEFAULT 1,  -- copied from the service plan
  description           VARCHAR(1000) NOT NULL,
  status                ENUM('DRAFT','ISSUED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
  receivable_invoice_id CHAR(36)      NULL,           -- row created in the existing invoices table
  content               JSON          NULL,           -- frozen print content on issue
  period_key            VARCHAR(120) GENERATED ALWAYS AS (
                          IF(status <> 'CANCELLED',
                             CONCAT(contract_id, '|', IFNULL(site_id, '-'), '|', period_start), NULL)
                        ) STORED,
  issued_by             BIGINT        NULL,
  issued_at             DATETIME      NULL,
  cancelled_by          BIGINT        NULL,
  cancelled_at          DATETIME      NULL,
  cancel_reason         VARCHAR(500)  NULL,
  created_by            BIGINT        NULL,
  updated_by            BIGINT        NULL,
  created_at            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME      NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_binv_number (invoice_number),
  UNIQUE KEY uq_binv_period (period_key),               -- a period can't be billed twice
  UNIQUE KEY uq_binv_receivable (receivable_invoice_id),
  KEY idx_binv_status_date (status, invoice_date),
  KEY idx_binv_company (company_id),
  KEY idx_binv_contract (contract_id),
  KEY idx_binv_run (bill_run_id),
  CONSTRAINT chk_binv_copies CHECK (print_copies BETWEEN 1 AND 4),
  CONSTRAINT fk_binv_contract     FOREIGN KEY (contract_id)     REFERENCES billing_contracts (id),
  CONSTRAINT fk_binv_company      FOREIGN KEY (company_id)      REFERENCES companies (id),
  CONSTRAINT fk_binv_site         FOREIGN KEY (site_id)         REFERENCES sites (id),
  CONSTRAINT fk_binv_ship_to      FOREIGN KEY (ship_to_site_id) REFERENCES sites (id),
  CONSTRAINT fk_binv_run          FOREIGN KEY (bill_run_id)     REFERENCES billing_runs (id),
  CONSTRAINT fk_binv_receivable   FOREIGN KEY (receivable_invoice_id) REFERENCES invoices (id),
  CONSTRAINT fk_binv_issued_by    FOREIGN KEY (issued_by)    REFERENCES users (id),
  CONSTRAINT fk_binv_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES users (id),
  CONSTRAINT fk_binv_created_by   FOREIGN KEY (created_by)   REFERENCES users (id),
  CONSTRAINT fk_binv_updated_by   FOREIGN KEY (updated_by)   REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Invoice generation: generated invoices';

CREATE TABLE IF NOT EXISTS billing_invoice_lines (
  id                CHAR(36)      NOT NULL,
  invoice_id        CHAR(36)      NOT NULL,
  contract_line_id  CHAR(36)      NULL,
  site_id           VARCHAR(20)   NULL,
  item_name         VARCHAR(255)  NOT NULL,
  sac_code          VARCHAR(10)   NULL,
  unit              VARCHAR(20)   NOT NULL,
  pricing_basis     ENUM('FIXED','PER_SERVICE','PER_UNIT') NOT NULL,
  rate              DECIMAL(12,2) NOT NULL,
  quantity          DECIMAL(12,3) NOT NULL DEFAULT 1,
  adjustment_type   ENUM('NONE','SERVICES','FULL_DESPITE_SHORTFALL','DAYS','PERCENT','MANUAL')
                    NOT NULL DEFAULT 'NONE',
  services_planned  TINYINT       NULL,      -- from the service plan
  services_done     TINYINT       NULL,      -- completed visits in the period
  missed_dates      JSON          NULL,      -- e.g. ["2026-11-21"]
  days_worked       DECIMAL(5,1)  NULL,
  days_in_period    DECIMAL(5,1)  NULL,
  percent           DECIMAL(6,2)  NULL,
  manual_amount     DECIMAL(15,2) NULL,
  adjustment_reason VARCHAR(255)  NULL,      -- required for FULL_DESPITE_SHORTFALL and MANUAL
  amount            DECIMAL(15,2) NOT NULL,
  job_ids           JSON          NULL,      -- jobs counted for this line
  sort_order        INT           NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_binl_invoice (invoice_id),
  CONSTRAINT fk_binl_invoice FOREIGN KEY (invoice_id)       REFERENCES billing_invoices (id) ON DELETE CASCADE,
  CONSTRAINT fk_binl_cline   FOREIGN KEY (contract_line_id) REFERENCES billing_contract_lines (id),
  CONSTRAINT fk_binl_site    FOREIGN KEY (site_id)          REFERENCES sites (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Invoice generation: invoice lines';

CREATE TABLE IF NOT EXISTS billing_invoice_pos (
  invoice_id CHAR(36) NOT NULL,
  po_id      CHAR(36) NOT NULL,
  PRIMARY KEY (invoice_id, po_id),
  KEY idx_binp_po (po_id),
  CONSTRAINT fk_binp_invoice FOREIGN KEY (invoice_id) REFERENCES billing_invoices (id) ON DELETE CASCADE,
  CONSTRAINT fk_binp_po      FOREIGN KEY (po_id)      REFERENCES customer_pos (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Invoice generation: POs printed on an invoice';

CREATE TABLE IF NOT EXISTS billing_advance_adjustments (
  id                    CHAR(36)      NOT NULL,
  invoice_id            CHAR(36)      NOT NULL,
  po_id                 CHAR(36)      NOT NULL,
  payment_id            CHAR(36)      NOT NULL,
  payment_allocation_id CHAR(36)      NULL,
  amount                DECIMAL(15,2) NOT NULL,
  is_reversed           TINYINT(1)    NOT NULL DEFAULT 0,
  created_by            BIGINT        NULL,
  created_at            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_baa_invoice (invoice_id),
  KEY idx_baa_po (po_id),
  CONSTRAINT fk_baa_invoice    FOREIGN KEY (invoice_id) REFERENCES billing_invoices (id),
  CONSTRAINT fk_baa_po         FOREIGN KEY (po_id)      REFERENCES customer_pos (id),
  CONSTRAINT fk_baa_payment    FOREIGN KEY (payment_id) REFERENCES payments (id),
  CONSTRAINT fk_baa_alloc      FOREIGN KEY (payment_allocation_id) REFERENCES payment_allocations (id) ON DELETE SET NULL,
  CONSTRAINT fk_baa_created_by FOREIGN KEY (created_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Invoice generation: Termite advance used on an invoice';


-- =====================================================================
-- PART E. PRINT AND SHARE – every print, email, WhatsApp, link, other
-- =====================================================================

CREATE TABLE IF NOT EXISTS billing_invoice_shares (
  id                 CHAR(36)      NOT NULL,
  billing_invoice_id CHAR(36)      NOT NULL,
  channel            ENUM('EMAIL','WHATSAPP','LINK','PRINT','OTHER') NOT NULL,
  recipients         JSON          NULL,     -- emails or phone numbers
  cc                 JSON          NULL,
  subject            VARCHAR(255)  NULL,
  attach             ENUM('ORIGINAL','ALL_COPIES') NULL,
  copies             TINYINT       NULL,     -- for PRINT
  note               VARCHAR(255)  NULL,     -- for OTHER (e.g. "Shared via Teams")
  token_hash         CHAR(64)      NULL,     -- SHA-256 of the public link token (never the token)
  expires_at         DATETIME      NULL,
  revoked_at         DATETIME      NULL,
  open_count         INT           NOT NULL DEFAULT 0,
  last_opened_at     DATETIME      NULL,
  status             ENUM('SENT','FAILED','LOGGED') NOT NULL DEFAULT 'LOGGED',
  error_message      VARCHAR(500)  NULL,
  created_by         BIGINT        NULL,
  created_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bis_token (token_hash),
  KEY idx_bis_invoice (billing_invoice_id, created_at),
  CONSTRAINT chk_bis_copies CHECK (copies IS NULL OR copies BETWEEN 1 AND 4),
  CONSTRAINT fk_bis_invoice    FOREIGN KEY (billing_invoice_id) REFERENCES billing_invoices (id),
  CONSTRAINT fk_bis_created_by FOREIGN KEY (created_by)         REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Invoice generation: prints and shares of an issued invoice';


-- =====================================================================
-- PART F. PERMISSIONS
-- (CANCEL_INVOICE already exists – it is only granted, not created)
-- =====================================================================

INSERT INTO permissions (name)
SELECT n.name FROM (
            SELECT 'VIEW_BILLING' AS name
  UNION ALL SELECT 'MANAGE_BILLING_MASTERS'
  UNION ALL SELECT 'GENERATE_INVOICE'
  UNION ALL SELECT 'ISSUE_INVOICE'
  UNION ALL SELECT 'SHARE_INVOICE'
  UNION ALL SELECT 'MANAGE_SERVICE_PLANS'
  UNION ALL SELECT 'VIEW_SERVICE_TRACKER'
) n
WHERE NOT EXISTS (SELECT 1 FROM permissions p WHERE p.name = n.name);


-- =====================================================================
-- PART G. ROLE GRANTS (admin passes every check already)
-- =====================================================================

-- Accounts Head: everything in Billing, including issue and cancel.
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r, permissions p
 WHERE r.name = 'Accounts Head'
   AND p.name IN ('VIEW_BILLING', 'MANAGE_BILLING_MASTERS', 'GENERATE_INVOICE', 'ISSUE_INVOICE',
                  'CANCEL_INVOICE', 'SHARE_INVOICE', 'VIEW_SERVICE_TRACKER');

-- Accounts Executive: prepares and shares invoices. ISSUE_INVOICE is left out
-- until it is confirmed that executives may issue (open point).
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r, permissions p
 WHERE r.name = 'Accounts Executive'
   AND p.name IN ('VIEW_BILLING', 'MANAGE_BILLING_MASTERS', 'GENERATE_INVOICE',
                  'SHARE_INVOICE', 'VIEW_SERVICE_TRACKER');

-- Service Coordinator: sets the service plans and watches the tracker.
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r, permissions p
 WHERE r.name = 'Service Coordinator'
   AND p.name IN ('MANAGE_SERVICE_PLANS', 'VIEW_SERVICE_TRACKER');

-- To let Accounts Executive issue invoices later, run:
-- INSERT IGNORE INTO role_permissions (role_id, permission_id)
-- SELECT r.id, p.id FROM roles r, permissions p
--  WHERE r.name = 'Accounts Executive' AND p.name = 'ISSUE_INVOICE';


-- =====================================================================
-- PART 3 - TDS in whole rupees on invoices with no TDS deducted yet
-- Same as backend/src/data/migrations/20261116b_round_tds_to_rupee.sql
-- =====================================================================
-- TDS is now kept in whole rupees, rounded to the nearest rupee (services/Tds.service.js roundRupee).
--
-- Rounds the TDS already saved on invoices that have no TDS deducted yet (271.40 -> 271,
-- 9976.92 -> 9977). Invoices where some TDS was already deducted keep the exact amounts they
-- were settled with: rounding those would leave a few paise pending, or more deducted than due.
--
-- Safe to re-run: only rows that still have paise are touched.

UPDATE invoice_tds
   SET expected_tds = ROUND(expected_tds, 0),
       pending_tds  = ROUND(expected_tds, 0)
 WHERE tds_applicable = 1
   AND deducted_tds = 0
   AND expected_tds <> ROUND(expected_tds, 0);


-- =====================================================================
-- PART 4 - Contract: GST applicable
-- Same as backend/src/data/migrations/20261117_billing_contract_gst.sql (made safe to re-run)
-- =====================================================================
SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_contracts' AND COLUMN_NAME = 'gst_applicable') = 0,
  'ALTER TABLE billing_contracts ADD COLUMN gst_applicable TINYINT(1) NOT NULL DEFAULT 1 AFTER po_required', 'DO 0');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;


-- =====================================================================
-- PART 5 - Service plan lines for the whole customer
-- Same as backend/src/data/migrations/20261117b_service_plan_whole_customer.sql (made safe to re-run)
-- =====================================================================
ALTER TABLE billing_service_plan_lines
  MODIFY COLUMN site_id      VARCHAR(20) NULL,
  MODIFY COLUMN service_type VARCHAR(50) NULL;


-- =====================================================================
-- PART 6 - GST rate on contracts and invoices
-- Same as backend/src/data/migrations/20261118_billing_gst_rate.sql (made safe to re-run)
-- =====================================================================
SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_contracts' AND COLUMN_NAME = 'gst_rate') = 0,
  'ALTER TABLE billing_contracts ADD COLUMN gst_rate DECIMAL(5,2) NOT NULL DEFAULT 18.00 AFTER gst_applicable', 'DO 0');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;
SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_invoices' AND COLUMN_NAME = 'gst_rate') = 0,
  'ALTER TABLE billing_invoices ADD COLUMN gst_rate DECIMAL(5,2) NOT NULL DEFAULT 18.00 AFTER tax_mode', 'DO 0');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;


-- =====================================================================
-- PART 7 - Invoice descriptions master
-- Same as backend/src/data/migrations/20261118b_billing_invoice_descriptions.sql
-- =====================================================================
-- Invoice generation: "Description on invoice" becomes a master list (Masters > Invoice Descriptions).
-- A contract picks its description from the active entries; {month}, {period}, {from_month} and
-- {to_month} are filled in on each invoice as before (billing_contracts.description_template keeps
-- the chosen text, so contracts and invoices are unchanged).
--
-- Starts with the three standard wordings and every description already used on a contract.
-- Run once (after 20261116_billing_module.sql). Safe to re-run: the text is unique.

CREATE TABLE IF NOT EXISTS billing_invoice_descriptions (
  id          CHAR(36)     NOT NULL,
  text        VARCHAR(500) NOT NULL,
  is_active   TINYINT(1)   NOT NULL DEFAULT 1,
  sort_order  INT          NOT NULL DEFAULT 0,
  created_by  BIGINT       NULL,
  updated_by  BIGINT       NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bid_text (text)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Invoice generation: the descriptions a contract can print on its invoices';

INSERT IGNORE INTO billing_invoice_descriptions (id, text, sort_order) VALUES
  (UUID(), 'Pest control services for the month of {month}', 1),
  (UUID(), 'Pest control services for {from_month} to {to_month}', 2),
  (UUID(), 'Pest control service carried out on {period}', 3);

INSERT IGNORE INTO billing_invoice_descriptions (id, text, sort_order)
SELECT UUID(), d.description_template, 10
  FROM (SELECT DISTINCT description_template FROM billing_contracts
         WHERE description_template IS NOT NULL AND description_template <> '') AS d;


-- =====================================================================
-- PART 8 - Billing frequencies master
-- Same as backend/src/data/migrations/20261119_billing_frequencies.sql
-- =====================================================================
-- Invoice generation: "Billing frequency" becomes a master list (Masters > Billing Frequencies).
-- A contract picks its frequency (every N months, 1 to 12) from the active entries; contracts keep
-- the frequency they already have even if that entry is switched off later.
--
-- Starts with 1, 3, 4, 5, 6 and 12 months and every frequency already used on a contract.
-- New table only; nothing existing is changed. Run once (after 20261116_billing_module.sql).
-- Safe to re-run: the months value is the key.

CREATE TABLE IF NOT EXISTS billing_frequencies (
  months      TINYINT     NOT NULL,
  is_active   TINYINT(1)  NOT NULL DEFAULT 1,
  created_by  BIGINT      NULL,
  updated_by  BIGINT      NULL,
  created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME    NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (months),
  CONSTRAINT chk_bfreq_months CHECK (months BETWEEN 1 AND 12)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Invoice generation: the billing frequencies (every N months) a contract can pick';

INSERT IGNORE INTO billing_frequencies (months) VALUES (1), (3), (4), (5), (6), (12);

INSERT IGNORE INTO billing_frequencies (months)
SELECT DISTINCT frequency_months FROM billing_contracts
 WHERE frequency_months BETWEEN 1 AND 12;


-- =====================================================================
-- PART 9 - Invoice line summaries
-- Same as backend/src/data/migrations/20261119b_billing_invoice_summary.sql
-- =====================================================================
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

-- (USE line removed: select the production database first)
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


-- =====================================================================
-- PART 10 - Service months
-- Same as backend/src/data/migrations/20261119c_billing_service_months.sql
-- =====================================================================
-- Invoice generation: services assigned and completed per month, typed by the Service Coordinator
-- (Service Plans > the customer > This month).
--
--   billing_service_months  one row per customer, calendar month and planned service:
--     assigned   how many were assigned that month (starts from the plan's "per month" number)
--     completed  how many were completed that month; NULL = not entered yet
--
-- The Service Tracker, the Bill Run and the draft invoices use these numbers (planned = assigned,
-- done = completed) instead of counting completed jobs. A draft whose period has a month without
-- the completed number cannot be issued until the Service Coordinator enters it.
-- A billing period uses the calendar month(s) it starts in (a monthly period 16 Nov - 15 Dec uses
-- November; a quarterly one uses its 3 months from the start month).
-- New table only; nothing existing changes. Run once (after 20261116_billing_module.sql). Safe to re-run.
-- In phpMyAdmin, select the ps_ops database in the left panel first (or keep the USE line).

-- (USE line removed: select the production database first)
CREATE TABLE IF NOT EXISTS billing_service_months (
  company_id   VARCHAR(20)  NOT NULL,
  month        DATE         NOT NULL,              -- first day of the month
  sub_service  VARCHAR(100) NOT NULL,              -- the plan's service name (same as jobs.sub_service)
  assigned     INT          NOT NULL,
  completed    INT          NULL DEFAULT NULL,     -- NULL = not entered yet
  updated_by   BIGINT       NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (company_id, month, sub_service),
  CONSTRAINT chk_bsm_assigned  CHECK (assigned BETWEEN 0 AND 999),
  CONSTRAINT chk_bsm_completed CHECK (completed IS NULL OR completed BETWEEN 0 AND 999),
  CONSTRAINT fk_bsm_company    FOREIGN KEY (company_id) REFERENCES companies (id),
  CONSTRAINT fk_bsm_updated_by FOREIGN KEY (updated_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Invoice generation: services assigned and completed per customer, month and service (typed)';


-- =====================================================================
-- PART 11 - Brigade-ready billing tables (PO files, invoice source, job on lines)
-- Same as backend/src/data/migrations/20261120_billing_brigade_ready.sql (made safe to re-run)
-- =====================================================================
SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_pos' AND COLUMN_NAME = 'source') = 0,
  'ALTER TABLE customer_pos ADD COLUMN source ENUM(''BILLING'',''BRIGADE'') NOT NULL DEFAULT ''BILLING'' AFTER id', 'DO 0');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_pos' AND COLUMN_NAME = 'po_source') = 0,
  'ALTER TABLE customer_pos ADD COLUMN po_source VARCHAR(255) NULL AFTER po_kind', 'DO 0');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

CREATE TABLE IF NOT EXISTS customer_po_files (
  id          CHAR(36)     NOT NULL,
  po_id       CHAR(36)     NOT NULL,
  object_key  VARCHAR(500) NOT NULL,              -- where the file is in MinIO
  file_name   VARCHAR(255) NOT NULL,
  file_type   VARCHAR(100) NULL,                  -- application/pdf, image/png, image/jpeg
  file_size   INT          NOT NULL DEFAULT 0,    -- bytes
  uploaded_by BIGINT       NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cpof_po (po_id, created_at),
  CONSTRAINT fk_cpof_po   FOREIGN KEY (po_id)       REFERENCES customer_pos (id) ON DELETE CASCADE,
  CONSTRAINT fk_cpof_user FOREIGN KEY (uploaded_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Invoice generation: files (PO copies) attached to a customer PO';

-- Copy the single PO file kept on customer_pos into customer_po_files (only while those columns still exist).
SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_pos' AND COLUMN_NAME = 'file_object_key') = 1,
  'INSERT INTO customer_po_files (id, po_id, object_key, file_name, file_type, file_size, uploaded_by, created_at)
   SELECT UUID(), po.id, po.file_object_key, COALESCE(NULLIF(po.file_name, ''''), ''po''),
          CASE LOWER(SUBSTRING_INDEX(po.file_name, ''.'', -1))
            WHEN ''pdf'' THEN ''application/pdf'' WHEN ''png'' THEN ''image/png''
            WHEN ''jpg'' THEN ''image/jpeg'' WHEN ''jpeg'' THEN ''image/jpeg'' ELSE NULL END,
          0, po.updated_by, COALESCE(po.updated_at, po.created_at)
     FROM customer_pos po
    WHERE po.file_object_key IS NOT NULL AND po.file_object_key <> ''''
      AND NOT EXISTS (SELECT 1 FROM customer_po_files f WHERE f.po_id = po.id AND f.object_key = po.file_object_key)', 'DO 0');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_pos' AND COLUMN_NAME = 'file_object_key') = 1,
  'ALTER TABLE customer_pos DROP COLUMN file_object_key', 'DO 0');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_pos' AND COLUMN_NAME = 'file_name') = 1,
  'ALTER TABLE customer_pos DROP COLUMN file_name', 'DO 0');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_invoices' AND COLUMN_NAME = 'source') = 0,
  'ALTER TABLE billing_invoices ADD COLUMN source ENUM(''BILLING'',''BRIGADE'') NOT NULL DEFAULT ''BILLING'' AFTER id', 'DO 0');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

ALTER TABLE billing_invoices
  MODIFY COLUMN contract_id  CHAR(36) NULL,
  MODIFY COLUMN billing_type ENUM('AMC','ONE_TIME','TERMITE','CHEMICAL') NULL,
  MODIFY COLUMN period_start DATE NULL,
  MODIFY COLUMN period_end   DATE NULL;

SET @s := IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_invoices' AND INDEX_NAME = 'idx_binv_source') = 0,
  'ALTER TABLE billing_invoices ADD KEY idx_binv_source (source, status)', 'DO 0');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_invoice_lines' AND COLUMN_NAME = 'job_id') = 0,
  'ALTER TABLE billing_invoice_lines ADD COLUMN job_id CHAR(36) NULL AFTER contract_line_id', 'DO 0');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

SET @s := IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_invoice_lines' AND INDEX_NAME = 'idx_bil_job') = 0,
  'ALTER TABLE billing_invoice_lines ADD KEY idx_bil_job (job_id)', 'DO 0');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;


-- =====================================================================
-- PART 12 - Accounts Executive: full billing permissions
-- Same as backend/src/data/migrations/20261120b_accounts_executive_full_billing.sql
-- =====================================================================
-- =====================================================================
-- Accounts Executive does all of Billing (there is no Accounts Head doing it separately):
--   ISSUE_INVOICE   issue drafts (final, numbered)
--   CANCEL_INVOICE  cancel an issued invoice
--   VIEW_INVOICE    see invoices - also lets them use notifications (the bell gave 403 without it)
-- The other billing permissions were given in 20261116_billing_module.sql.
-- Safe to run again (INSERT IGNORE). Run after 20261116 ... 20261120.
-- =====================================================================

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r, permissions p
 WHERE r.name = 'Accounts Executive'
   AND p.name IN ('ISSUE_INVOICE', 'CANCEL_INVOICE', 'VIEW_INVOICE');

-- Check: Accounts Executive should now list all of these
-- VIEW_BILLING, MANAGE_BILLING_MASTERS, GENERATE_INVOICE, ISSUE_INVOICE, CANCEL_INVOICE,
-- SHARE_INVOICE, VIEW_SERVICE_TRACKER, VIEW_INVOICE (+ VIEW_HIERARCHY from before)
SELECT r.name AS role, GROUP_CONCAT(p.name ORDER BY p.name) AS permissions
  FROM roles r
  JOIN role_permissions rp ON rp.role_id = r.id
  JOIN permissions p ON p.id = rp.permission_id
 WHERE r.name = 'Accounts Executive'
 GROUP BY r.name;


-- =====================================================================
-- PART 13 - Customer profile: print copies, invoice emails, outlet settings
-- Same as backend/src/data/migrations/20261121_billing_customer_profile.sql (made safe to re-run)
-- =====================================================================
SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_profiles' AND COLUMN_NAME = 'print_copies') = 0,
  'ALTER TABLE billing_profiles ADD COLUMN print_copies TINYINT NOT NULL DEFAULT 1 AFTER payment_terms_days', 'DO 0');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_profiles' AND COLUMN_NAME = 'invoice_emails') = 0,
  'ALTER TABLE billing_profiles ADD COLUMN invoice_emails VARCHAR(1000) NULL AFTER print_copies', 'DO 0');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_profiles' AND COLUMN_NAME = 'bill_by_day') = 0,
  'ALTER TABLE billing_profiles ADD COLUMN bill_by_day TINYINT NULL AFTER invoice_emails', 'DO 0');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

CREATE TABLE IF NOT EXISTS billing_outlet_settings (
  company_id   VARCHAR(20)   NOT NULL,
  site_id      VARCHAR(20)   NOT NULL,
  print_copies TINYINT       NOT NULL DEFAULT 1,     -- 1 to 4
  emails       VARCHAR(1000) NULL,                   -- comma separated; issued invoices are emailed here
  updated_by   BIGINT        NULL,
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME      NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (company_id, site_id),
  CONSTRAINT fk_bos_company FOREIGN KEY (company_id) REFERENCES companies (id),
  CONSTRAINT fk_bos_site    FOREIGN KEY (site_id)    REFERENCES sites (id),
  CONSTRAINT fk_bos_user    FOREIGN KEY (updated_by) REFERENCES users (id),
  CONSTRAINT chk_bos_copies CHECK (print_copies BETWEEN 1 AND 4)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Invoice generation: prints and email for each outlet of a customer';


-- =====================================================================
-- PART 14 - Monthly SOS (Service Coordinator)
-- Same as backend/src/data/migrations/20261122_billing_sos.sql
-- =====================================================================
-- =====================================================================
-- Invoice Generation: SOS - the monthly Statement of Service from the Service Coordinator.
--
-- Every month the Service Coordinator opens each customer: the services agreed in the customer's
-- billing profile come up per outlet (assigned = services per month), they enter how many were
-- completed, add any EXTRA services done beyond the agreement, and submit. Accounts bills from it:
--   Fixed amount contract   -> bills the assigned number (agreed), even if fewer were completed
--   Service based contract  -> bills the completed number
--   Extra services          -> billed on top, at the customer's rate for that service (profile);
--                              no rate in the profile = Accounts enters it on the draft
-- A submitted SOS is locked. Reopening it (Service Coordinator, or Accounts "send back") removes
-- the drafts made from it, so an invoice is always made from the latest numbers; it cannot be
-- reopened once the month is invoiced.
--
--   billing_sos         one per customer and calendar month (status DRAFT / SUBMITTED)
--   billing_sos_lines   one per outlet + service: assigned, completed, extra or not
--
-- Replaces billing_service_months (typed numbers per customer, not per outlet), which is no longer
-- read. New tables only. Run once, after 20261121_billing_customer_profile.sql.
-- =====================================================================

CREATE TABLE IF NOT EXISTS billing_sos (
  id            CHAR(36)      NOT NULL,
  company_id    VARCHAR(20)   NOT NULL,
  month         DATE          NOT NULL,                 -- first day of the month
  status        ENUM('DRAFT','SUBMITTED') NOT NULL DEFAULT 'DRAFT',
  notes         VARCHAR(1000) NULL,
  submitted_by  BIGINT        NULL,
  submitted_at  DATETIME      NULL,
  reopened_by   BIGINT        NULL,
  reopened_at   DATETIME      NULL,
  reopen_reason VARCHAR(500)  NULL,
  created_by    BIGINT        NULL,
  updated_by    BIGINT        NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sos_month (company_id, month),
  KEY idx_sos_month_status (month, status),
  CONSTRAINT fk_sos_company   FOREIGN KEY (company_id)   REFERENCES companies (id),
  CONSTRAINT fk_sos_submitted FOREIGN KEY (submitted_by) REFERENCES users (id),
  CONSTRAINT fk_sos_created   FOREIGN KEY (created_by)   REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Invoice generation: monthly statement of service (SOS) per customer';

CREATE TABLE IF NOT EXISTS billing_sos_lines (
  id               CHAR(36)      NOT NULL,
  sos_id           CHAR(36)      NOT NULL,
  contract_line_id CHAR(36)      NULL,                  -- the agreed service; NULL for an extra service
  contract_id      CHAR(36)      NULL,                  -- the contract that bills it (extras too)
  site_id          VARCHAR(20)   NULL,                  -- the outlet; NULL = whole customer
  service          VARCHAR(255)  NOT NULL,
  assigned         INT           NOT NULL DEFAULT 0,    -- agreed services this month (0 for an extra)
  completed        INT           NULL,                  -- done this month; NULL = not entered
  is_extra         TINYINT(1)    NOT NULL DEFAULT 0,
  rate             DECIMAL(12,2) NULL,                  -- extra: the profile rate found; NULL = Accounts enters it
  remarks          VARCHAR(255)  NULL,
  sort_order       INT           NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_sosl_sos (sos_id),
  KEY idx_sosl_line (contract_line_id),
  CONSTRAINT fk_sosl_sos      FOREIGN KEY (sos_id)           REFERENCES billing_sos (id) ON DELETE CASCADE,
  CONSTRAINT fk_sosl_line     FOREIGN KEY (contract_line_id) REFERENCES billing_contract_lines (id),
  CONSTRAINT fk_sosl_contract FOREIGN KEY (contract_id)      REFERENCES billing_contracts (id),
  CONSTRAINT fk_sosl_site     FOREIGN KEY (site_id)          REFERENCES sites (id),
  CONSTRAINT chk_sosl_assigned  CHECK (assigned BETWEEN 0 AND 999),
  CONSTRAINT chk_sosl_completed CHECK (completed IS NULL OR completed BETWEEN 0 AND 999)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Invoice generation: SOS lines - outlet + service, assigned and completed';

-- Rollback: DROP TABLE billing_sos_lines; DROP TABLE billing_sos;


-- =====================================================================
-- PART 15 - Late billing alerts
-- Same as backend/src/data/migrations/20261123_billing_late_alerts.sql
-- =====================================================================
-- =====================================================================
-- Invoice Generation: late-billing alerts.
-- A customer whose billing profile has a bill-by day (billing_profiles.bill_by_day) and is still not
-- invoiced after that day of the month: Accounts get one notification per customer per month.
-- This table remembers which were sent (so the daily job sends each only once, on any server).
-- New table only. Run once, after 20261122_billing_sos.sql.
-- =====================================================================

CREATE TABLE IF NOT EXISTS billing_late_alerts (
  company_id VARCHAR(20) NOT NULL,
  month      DATE        NOT NULL,              -- first day of the month alerted for
  sent_at    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (company_id, month),
  CONSTRAINT fk_bla_company FOREIGN KEY (company_id) REFERENCES companies (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Invoice generation: late-billing alerts sent (one per customer and month)';

-- Rollback: DROP TABLE billing_late_alerts;


-- =====================================================================
-- PART 16 - Email invoices automatically
-- Same as backend/src/data/migrations/20261124_billing_auto_email.sql (made safe to re-run)
-- =====================================================================
SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_profiles' AND COLUMN_NAME = 'auto_email') = 0,
  'ALTER TABLE billing_profiles ADD COLUMN auto_email TINYINT(1) NOT NULL DEFAULT 0 AFTER invoice_emails', 'DO 0');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;


-- =====================================================================
-- PART 17 - Payments recorded in Billing
-- Same as backend/src/data/migrations/20261125_billing_payments.sql
-- =====================================================================
-- =====================================================================
-- Invoice Generation: payments received against issued invoices, recorded in Billing.
--
-- For now Billing keeps its own record of what each customer paid (not the Accountant Panel's
-- payments): the Accounts Executive records every payment - part payments too - on the invoice
-- page with how it was paid (NEFT / RTGS / IMPS / UPI / cheque / DD / cash / other, typed in),
-- the UTR or cheque details, optional TDS, and an optional proof file. An invoice is Pending,
-- Partially paid or Paid from these rows (plus any termite advance adjusted on it).
-- A wrong entry is removed with a reason (soft delete: the row stays, marked deleted).
-- Later these can be connected to the Collection Executive's dashboard.
--
-- New table only: nothing existing changes. Run once, after 20261124_billing_auto_email.sql.
-- =====================================================================

CREATE TABLE IF NOT EXISTS billing_invoice_payments (
  id                 CHAR(36)      NOT NULL,
  billing_invoice_id CHAR(36)      NOT NULL,
  amount             DECIMAL(15,2) NOT NULL DEFAULT 0,      -- money received
  tds_amount         DECIMAL(15,2) NOT NULL DEFAULT 0,      -- TDS deducted by the customer (counts towards the invoice)
  paid_on            DATE          NOT NULL,
  mode               VARCHAR(10)   NOT NULL,                -- NEFT RTGS IMPS UPI CHEQUE DD CASH OTHER
  mode_other         VARCHAR(60)   NULL,                    -- typed when mode = OTHER
  reference_no       VARCHAR(60)   NULL,                    -- UTR / transaction id (NEFT, RTGS, IMPS, UPI)
  cheque_no          VARCHAR(30)   NULL,                    -- cheque or DD number
  cheque_date        DATE          NULL,
  bank_name          VARCHAR(100)  NULL,                    -- the customer's bank (cheque / DD)
  received_in        VARCHAR(100)  NULL,                    -- our account it came into
  remarks            VARCHAR(500)  NULL,
  proof_object_key   VARCHAR(500)  NULL,                    -- receipt / screenshot / cheque photo in object storage
  proof_file_name    VARCHAR(255)  NULL,
  proof_file_type    VARCHAR(100)  NULL,
  created_by         BIGINT        NULL,
  created_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_by         BIGINT        NULL,
  deleted_at         DATETIME      NULL,
  delete_reason      VARCHAR(500)  NULL,
  PRIMARY KEY (id),
  KEY idx_bip_invoice (billing_invoice_id, deleted_at),
  KEY idx_bip_reference (reference_no),
  CONSTRAINT fk_bip_invoice FOREIGN KEY (billing_invoice_id) REFERENCES billing_invoices (id),
  CONSTRAINT fk_bip_created FOREIGN KEY (created_by) REFERENCES users (id),
  CONSTRAINT fk_bip_deleted FOREIGN KEY (deleted_by) REFERENCES users (id),
  CONSTRAINT chk_bip_amounts CHECK (amount >= 0 AND tds_amount >= 0 AND amount + tds_amount > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Invoice generation: payments received against issued invoices (recorded in Billing)';


-- =====================================================================
-- PART 18 - Group based contracts
-- Same as backend/src/data/migrations/20261125_billing_group_contracts.sql
-- =====================================================================
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

-- (USE line removed: select the production database first)
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


-- =====================================================================
-- PART 19 - Description wordings: service / chemical / termite
-- Same as backend/src/data/migrations/20261125_billing_descriptions_service_chemical.sql
-- =====================================================================
-- Invoice generation: description wordings for services, chemicals and termite.
--
-- "Chemical" is no longer a billing type on New Contract: an AMC / One-time / Termite contract
-- bills Service, Chemical or both ("What is billed"), and the description is suggested from that.
-- Services and chemicals each have their own wording (never one combined line):
--   Service    Towards charges for the Pest control service carried out for the month of {month}
--   Chemical   Towards charges for the chemical charges for the month of {month}
--   Termite    Termite Treatment
-- Both ticked + "separate bills": two contracts, one per wording, sharing the same PO.
-- (One-time uses {period}; every 2+ months uses {from_month} to {to_month}.)
--
-- Adds these wordings to Masters > Invoice Descriptions so they show in the dropdown.
-- Data only: nothing existing is changed. Safe to re-run (text is unique -> INSERT IGNORE).
-- Run after 20261118b_billing_invoice_descriptions.sql.

INSERT IGNORE INTO billing_invoice_descriptions (id, text, sort_order) VALUES
  (UUID(), 'Towards charges for the Pest control service carried out for the month of {month}', 4),
  (UUID(), 'Towards charges for the chemical charges for the month of {month}', 5),
  (UUID(), 'Towards charges for the Pest control service carried out for {from_month} to {to_month}', 7),
  (UUID(), 'Towards charges for the chemical charges for {from_month} to {to_month}', 8),
  (UUID(), 'Towards charges for the chemical charges for {period}', 10),
  (UUID(), 'Termite Treatment', 12);


-- =====================================================================
-- PART 20 - Termite daily / weekly / monthly
-- Same as backend/src/data/migrations/20261126_billing_termite_frequency_unit.sql
-- =====================================================================
-- Invoice generation: Termite contracts billed daily, weekly or monthly.
--
--   billing_contracts.frequency_unit   MONTH (every frequency_months months, as before),
--                                      WEEK  (every week: 7-day periods from the first bill date),
--                                      DAY   (every day: one-day periods)
--
-- Only Termite contracts can be WEEK or DAY; frequency_months stays 1 for them. Every existing
-- contract is MONTH and bills exactly as before. A weekly / daily contract gets one invoice per
-- period: the month's Bill Run drafts every period of it that is due in that month.
--
-- One new column only: nothing existing changes. Run once (after 20261125_billing_group_contracts.sql).
-- Safe to re-run. In phpMyAdmin, select the ps_ops database in the left panel first (or keep the USE line).

-- (USE line removed: select the production database first)
SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_contracts' AND COLUMN_NAME = 'frequency_unit');
SET @sql := IF(@has = 0,
  'ALTER TABLE billing_contracts
     ADD COLUMN frequency_unit ENUM(''MONTH'',''WEEK'',''DAY'') NOT NULL DEFAULT ''MONTH'' AFTER frequency_months',
  'SELECT ''billing_contracts.frequency_unit already exists'' AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- =====================================================================
-- PART 21 - Termite treated area on the SOS
-- Same as backend/src/data/migrations/20261127_billing_sos_termite_area.sql
-- =====================================================================
-- Invoice generation: Termite treated area on the monthly SOS.
--
-- A Termite contract fixes only the rate per sq. m / sq. ft. The Service Coordinator enters the area
-- completed on the customer's monthly SOS - one row per billing period that the month bills (each
-- week of a weekly contract, each day of a daily one, the month of a monthly one). The Bill Run then
-- bills each period: that row's area x the rate.
--
--   billing_sos_lines.kind          SERVICE (services counted per service, as before) or AREA (termite)
--   billing_sos_lines.period_start  AREA: the billing period the area is for
--   billing_sos_lines.period_end
--   billing_sos_lines.area          AREA: the treated area completed (NULL = not entered)
--   billing_sos_lines.unit          AREA: sq.m or sq.ft (the contract line's unit)
--
-- New optional columns only: every existing SOS line is SERVICE and unchanged.
-- Run once (after 20261126_billing_termite_frequency_unit.sql). Safe to re-run.
-- In phpMyAdmin, select the ps_ops database in the left panel first (or keep the USE line).

-- (USE line removed: select the production database first)
SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_sos_lines' AND COLUMN_NAME = 'kind');
SET @sql := IF(@has = 0,
  'ALTER TABLE billing_sos_lines
     ADD COLUMN kind         ENUM(''SERVICE'',''AREA'') NOT NULL DEFAULT ''SERVICE'' AFTER sos_id,
     ADD COLUMN period_start DATE          NULL DEFAULT NULL AFTER service,
     ADD COLUMN period_end   DATE          NULL DEFAULT NULL AFTER period_start,
     ADD COLUMN area         DECIMAL(12,2) NULL DEFAULT NULL AFTER completed,
     ADD COLUMN unit         VARCHAR(20)   NULL DEFAULT NULL AFTER area,
     ADD KEY idx_sosl_line_period (contract_line_id, period_start)',
  'SELECT ''billing_sos_lines.kind already exists'' AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- =====================================================================
-- PART 22 - Separate bills (services / chemicals)
-- Same as backend/src/data/migrations/20261128_billing_contract_separate_bills.sql
-- =====================================================================
-- Invoice generation: one contract per customer, with pest control and chemicals on separate bills.
--
-- A customer has only ONE contract (any type). When it bills both services and chemicals, the
-- contract can say "separate bills": every period the Bill Run then makes TWO invoices from it -
-- the service lines with description_template, the chemical lines with chemical_description_template
-- (same PO on both). Otherwise one invoice carries everything, as before.
--
--   billing_contracts.separate_bills                 1 = services and chemicals invoiced separately
--   billing_contracts.chemical_description_template  description on the chemical invoice
--
-- Additive: existing contracts get separate_bills = 0 and keep billing exactly as before.
-- Safe to re-run (each column is added only if missing). Run after 20261127_billing_sos_termite_area.sql.

SET @has := (SELECT COUNT(*) FROM information_schema.columns
              WHERE table_schema = DATABASE() AND table_name = 'billing_contracts' AND column_name = 'separate_bills');
SET @sql := IF(@has = 0,
  'ALTER TABLE billing_contracts ADD COLUMN separate_bills TINYINT(1) NOT NULL DEFAULT 0 AFTER description_template',
  'SELECT ''separate_bills already exists''');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @has := (SELECT COUNT(*) FROM information_schema.columns
              WHERE table_schema = DATABASE() AND table_name = 'billing_contracts' AND column_name = 'chemical_description_template');
SET @sql := IF(@has = 0,
  'ALTER TABLE billing_contracts ADD COLUMN chemical_description_template VARCHAR(500) NULL AFTER separate_bills',
  'SELECT ''chemical_description_template already exists''');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;


-- =====================================================================
-- PART 23 - Manual invoices (Generate Invoice)
-- Same as backend/src/data/migrations/20261129_billing_manual_invoices.sql
-- =====================================================================
-- Invoice generation: manual invoices.
--
-- Accounts can generate an invoice by hand (Draft Invoices > New manual invoice): pick the customer,
-- tick services from its contract (the rate comes from the contract), enter the quantity, Generate.
-- It is issued at once, as an extra one-off bill: the contract's Bill Run period does not move, and
-- the regular monthly bill still comes.
--
--   billing_invoices.is_manual   1 = generated by hand (period_start = period_end = the invoice date)
--
-- period_key (one regular invoice per contract + outlet + period) now leaves manual invoices out, so a
-- manual invoice can sit in a month that also has its regular bill.
--
-- Additive: every existing invoice gets is_manual = 0 and its period_key stays exactly the same.
-- Safe to re-run. Run after 20261128_billing_contract_separate_bills.sql.
-- In phpMyAdmin, select the ps_ops database in the left panel first.

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_invoices' AND COLUMN_NAME = 'is_manual');
SET @sql := IF(@has = 0,
  'ALTER TABLE billing_invoices ADD COLUMN is_manual TINYINT(1) NOT NULL DEFAULT 0 AFTER source',
  'SELECT ''billing_invoices.is_manual already exists'' AS info');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- Rebuild period_key with "and not manual" (a generated column cannot be altered in place).
SET @done := (SELECT COUNT(*) FROM information_schema.COLUMNS
               WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_invoices' AND COLUMN_NAME = 'period_key'
                 AND GENERATION_EXPRESSION LIKE '%is_manual%');
SET @sql := IF(@done = 0,
  'ALTER TABLE billing_invoices
     DROP INDEX uq_binv_period,
     DROP COLUMN period_key,
     ADD COLUMN period_key VARCHAR(120)
       GENERATED ALWAYS AS (IF(status <> ''CANCELLED'' AND is_manual = 0,
                               CONCAT(contract_id, ''|'', IFNULL(site_id, ''-''), ''|'', period_start), NULL)) STORED AFTER content,
     ADD UNIQUE KEY uq_binv_period (period_key)',
  'SELECT ''period_key already leaves manual invoices out'' AS info');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;


-- =====================================================================
-- PART 24 - Separate bills: two invoices per period
-- Same as backend/src/data/migrations/20261130_billing_invoice_bill_kind.sql
-- =====================================================================
-- Invoice generation: separate bills (pest control + chemicals) for the same period.
--
-- A contract with "separate bills" makes TWO invoices every period from one contract: one with the
-- service lines and one with the chemical lines. period_key allowed only one regular invoice per
-- contract + outlet + period, so the second invoice failed ("Already drafted for this period") and the
-- Bill Run made no draft for that contract.
--
--   billing_invoices.bill_kind   '' = the whole contract on one invoice (every invoice so far)
--                                'SERVICE' / 'CHEMICAL' = that half of a "separate bills" contract
--
-- period_key now also carries bill_kind when it is set, so the two halves of a period no longer
-- clash, while the same bill can still not be made twice for a period.
--
-- Additive: every existing invoice gets bill_kind = '' and its period_key stays exactly the same.
-- Safe to re-run. Run after 20261129_billing_manual_invoices.sql.
-- In phpMyAdmin, select the ps_ops database in the left panel first.

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_invoices' AND COLUMN_NAME = 'bill_kind');
SET @sql := IF(@has = 0,
  'ALTER TABLE billing_invoices ADD COLUMN bill_kind VARCHAR(10) NOT NULL DEFAULT '''' AFTER is_manual',
  'SELECT ''billing_invoices.bill_kind already exists'' AS info');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- Rebuild period_key with bill_kind (a generated column cannot be altered in place).
SET @done := (SELECT COUNT(*) FROM information_schema.COLUMNS
               WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_invoices' AND COLUMN_NAME = 'period_key'
                 AND GENERATION_EXPRESSION LIKE '%bill_kind%');
SET @sql := IF(@done = 0,
  'ALTER TABLE billing_invoices
     DROP INDEX uq_binv_period,
     DROP COLUMN period_key,
     ADD COLUMN period_key VARCHAR(130)
       GENERATED ALWAYS AS (IF(status <> ''CANCELLED'' AND is_manual = 0,
                               CONCAT(contract_id, ''|'', IFNULL(site_id, ''-''), ''|'', period_start,
                                      IF(bill_kind = '''', '''', CONCAT(''|'', bill_kind))), NULL)) STORED AFTER content,
     ADD UNIQUE KEY uq_binv_period (period_key)',
  'SELECT ''period_key already includes bill_kind'' AS info');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;


-- =====================================================================
-- PART 25 - Files attached to the monthly SOS (sent with the invoice email)
-- Same as backend/src/data/migrations/20261130_billing_sos_files.sql
-- =====================================================================
-- Invoice generation: files attached to the monthly SOS.
--
-- The Service Coordinator can attach files (service reports, signed job sheets, photos) to a
-- customer's SOS for a month - optional, up to 10 files of 10 MB each, any file format.
-- Accounts see them on the SOS, on the draft invoice and on the issued invoice, and they are
-- attached to the invoice email (manual "Email" and the automatic email on issue) for every month
-- the invoice period covers.
--
--   billing_sos_files   one row per file; the file itself is in MinIO (object_key)
--
-- Keyed by customer + month (not by billing_sos.id) so files can be attached before the SOS is saved.
-- New table only. Safe to re-run. Run after 20261129_billing_manual_invoices.sql.
-- In phpMyAdmin, select the ps_ops database in the left panel first.

CREATE TABLE IF NOT EXISTS billing_sos_files (
  id           CHAR(36)      NOT NULL,
  company_id   VARCHAR(20)   NOT NULL,
  month        DATE          NOT NULL,                 -- first day of the month
  object_key   VARCHAR(500)  NOT NULL,
  file_name    VARCHAR(255)  NOT NULL,
  file_type    VARCHAR(150)  NULL,
  file_size    INT           NOT NULL DEFAULT 0,
  uploaded_by  BIGINT        NULL,
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sosf_month (company_id, month),
  CONSTRAINT fk_sosf_company  FOREIGN KEY (company_id)  REFERENCES companies (id),
  CONSTRAINT fk_sosf_uploaded FOREIGN KEY (uploaded_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Invoice generation: files attached to the monthly SOS (sent with the invoice email)';

-- Rollback: DROP TABLE billing_sos_files;  (the files stay in MinIO under billing/sos/)


-- =====================================================================
-- PART 26 - Print copies: 0 allowed, no 1-4 limit
-- Same as backend/src/data/migrations/20261201_billing_print_copies_zero.sql
-- =====================================================================
-- Invoice generation: print copies - 0 allowed, and no small upper limit.
--
-- 0 copies = nothing is printed automatically when an invoice is issued (Print on the invoice page
-- still prints one copy by hand). Any number of copies can be typed: the columns were TINYINT (at
-- most 127) with a rule of 1 to 4; they become SMALLINT UNSIGNED (0 to 65535) with no 1-4 rule.
--
--   billing_profiles.print_copies         TINYINT -> SMALLINT UNSIGNED
--   billing_outlet_settings.print_copies  TINYINT -> SMALLINT UNSIGNED, CHECK 1-4 dropped
--   billing_invoices.print_copies         TINYINT -> SMALLINT UNSIGNED, CHECK 1-4 dropped
--
-- Existing values are kept as they are (all 1 or more). Default stays 1.
-- Run once. Safe to re-run. In phpMyAdmin, select the ps_ops database in the left panel first (or
-- keep the USE line).

-- (USE line removed: select the production database first)
-- the old 1-4 rules (a CHECK must go before its column can change)
SET @has := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
              WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_invoices' AND CONSTRAINT_NAME = 'chk_binv_copies');
SET @sql := IF(@has > 0, 'ALTER TABLE billing_invoices DROP CHECK chk_binv_copies', 'SELECT ''chk_binv_copies already removed'' AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
              WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_outlet_settings' AND CONSTRAINT_NAME = 'chk_bos_copies');
SET @sql := IF(@has > 0, 'ALTER TABLE billing_outlet_settings DROP CHECK chk_bos_copies', 'SELECT ''chk_bos_copies already removed'' AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- the columns: 0 to 65535 copies
ALTER TABLE billing_profiles        MODIFY COLUMN print_copies SMALLINT UNSIGNED NOT NULL DEFAULT 1;
ALTER TABLE billing_outlet_settings MODIFY COLUMN print_copies SMALLINT UNSIGNED NOT NULL DEFAULT 1;
ALTER TABLE billing_invoices        MODIFY COLUMN print_copies SMALLINT UNSIGNED NOT NULL DEFAULT 1;


-- =====================================================================
-- PART 27 - Rate per service with 4 decimals
-- Same as backend/src/data/migrations/20261202_billing_rate_4_decimals.sql
-- =====================================================================
-- Invoice generation: rate per service with 4 decimals.
--
-- New contract › Services: a month amount can be typed; it is divided by the services per month into
-- the rate per service. 18,500 a month for 12 services is 1,541.6667 per service; with 2 decimals
-- (1,541.67) the month came to 18,500.04. With 4 decimals: 1,541.6667 x 12 = 18,500.00.
--
--   billing_contract_lines.rate  DECIMAL(12,2) -> DECIMAL(14,4)
--   billing_invoice_lines.rate   DECIMAL(12,2) -> DECIMAL(14,4)   (copied from the contract line)
--
-- Only the rate gets more decimals. Amounts, GST and totals stay at 2 decimals (rupees and paise);
-- screens and invoices show the rate with 2 decimals. Existing rates keep their value (e.g. 896.00
-- becomes 896.0000). NOT NULL and the "rate >= 0" rule are kept.
-- Run once. Safe to re-run. In phpMyAdmin, select the ps_ops database in the left panel first (or
-- keep the USE line).

-- (USE line removed: select the production database first)
ALTER TABLE billing_contract_lines MODIFY COLUMN rate DECIMAL(14,4) NOT NULL;
ALTER TABLE billing_invoice_lines  MODIFY COLUMN rate DECIMAL(14,4) NOT NULL;


-- =====================================================================
-- PART 28 - Service Offered To address on the billing details
-- Same as backend/src/data/migrations/20261203_billing_service_offered_to.sql
-- =====================================================================
-- Invoice generation: "Service Offered To" address on the customer's billing details.
--
-- New Contract step 1 / Billing details: ticking "Service Offered To" lets a different address be typed;
-- the invoices then print it under "Service Offered To" instead of the outlet / billing address.
--
--   billing_profiles.service_offered_to   VARCHAR(1000) NULL  (NULL = not used: as before)
--
-- New optional column only; every existing profile gets NULL, so existing invoices are unchanged.
-- Run once. Safe to re-run. In phpMyAdmin, select the ps_ops database in the left panel first (or
-- keep the USE line).

-- (USE line removed: select the production database first)
SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_profiles' AND COLUMN_NAME = 'service_offered_to');
SET @sql := IF(@has = 0,
  'ALTER TABLE billing_profiles ADD COLUMN service_offered_to VARCHAR(1000) NULL DEFAULT NULL AFTER billing_address',
  'SELECT ''billing_profiles.service_offered_to already exists'' AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- =====================================================================
-- PART 29 - Final checks (every row should say OK)
-- =====================================================================
SELECT t.object, IF(t.found > 0, 'OK', 'MISSING - tell the developer') AS result FROM (
  SELECT 'table billing_contracts' AS object, (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_contracts') AS found
  UNION ALL SELECT 'table billing_invoices', (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_invoices')
  UNION ALL SELECT 'table billing_invoice_payments', (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_invoice_payments')
  UNION ALL SELECT 'table billing_sos', (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_sos')
  UNION ALL SELECT 'table billing_group_profiles', (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_group_profiles')
  UNION ALL SELECT 'table customer_po_files', (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_po_files')
  UNION ALL SELECT 'table billing_outlet_settings', (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_outlet_settings')
  UNION ALL SELECT 'column billing_profiles.auto_email', (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_profiles' AND COLUMN_NAME = 'auto_email')
  UNION ALL SELECT 'column billing_contracts.contract_kind', (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_contracts' AND COLUMN_NAME = 'contract_kind')
  UNION ALL SELECT 'column billing_contracts.frequency_unit', (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_contracts' AND COLUMN_NAME = 'frequency_unit')
  UNION ALL SELECT 'column billing_contracts.separate_bills', (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_contracts' AND COLUMN_NAME = 'separate_bills')
  UNION ALL SELECT 'column billing_sos_lines.area', (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_sos_lines' AND COLUMN_NAME = 'area')
  UNION ALL SELECT 'column billing_invoices.is_manual', (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_invoices' AND COLUMN_NAME = 'is_manual')
  UNION ALL SELECT 'column billing_invoices.bill_kind', (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_invoices' AND COLUMN_NAME = 'bill_kind')
  UNION ALL SELECT 'period_key includes bill_kind', (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_invoices' AND COLUMN_NAME = 'period_key' AND GENERATION_EXPRESSION LIKE '%bill_kind%')
  UNION ALL SELECT 'column invoices.taxable_amount', (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invoices' AND COLUMN_NAME = 'taxable_amount')
  UNION ALL SELECT 'table billing_sos_files', (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_sos_files')
  UNION ALL SELECT 'print copies allow 0 (no 1-4 rule)', (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_invoices' AND COLUMN_NAME = 'print_copies' AND COLUMN_TYPE LIKE 'smallint%')
  UNION ALL SELECT 'rate with 4 decimals', (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_contract_lines' AND COLUMN_NAME = 'rate' AND NUMERIC_SCALE = 4)
  UNION ALL SELECT 'column billing_profiles.service_offered_to', (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_profiles' AND COLUMN_NAME = 'service_offered_to')
  UNION ALL SELECT 'permission VIEW_BILLING', (SELECT COUNT(*) FROM permissions WHERE name = 'VIEW_BILLING')
) t;

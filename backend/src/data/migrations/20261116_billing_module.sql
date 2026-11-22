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

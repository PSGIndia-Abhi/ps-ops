-- =====================================================================
-- BestServe – Invoice Generation (Billing) module
-- ALL SQL IN ONE FILE
--
-- Source documents:
--   Invoice Generation – Database Design   (11 tables, permissions)
--   Invoice Generation – API Payloads      (service plans, shares,
--                                            new columns, new permissions)
--
-- Database : MySQL 8 (ps_ops)
-- Status   : PROPOSED – for review. Not yet added to backend migrations.
--
-- HOW TO RUN
--   1. Take a full backup first:  mysqldump ps_ops > ps_ops_before_billing.sql
--   2. Run PART A to PART G in order (the whole file can be run at once:
--      mysql ps_ops < "Invoice Generation - All SQL.sql").
--      Every statement is safe to re-run (IF NOT EXISTS / NOT EXISTS).
--   3. Run the checks in PART H.
--   PART I (application queries) and PART J (rollback) are inside comments
--   and are NOT executed. They are reference SQL for the backend code.
--
-- ID TYPES (checked against the live migrations, not the stale Prisma file)
--   companies.id, sites.id  -> VARCHAR(20)  (COMP1, SITE1 … since
--                              20260922b_companies_sites_readable_ids.sql)
--   users.id                -> BIGINT
--   roles.id, permissions.id-> INT
--   invoices / payments / payment_allocations.id -> CHAR(36)
--   jobs.company_id holds a SITE id (legacy naming)
--
-- Changes from the Database Design document:
--   * company_id / site_id are VARCHAR(20) (the design said CHAR(36),
--     which would fail on the foreign keys).
--   * New: billing_service_plans, billing_service_plan_lines,
--     billing_invoice_shares.
--   * New columns: billing_contracts.shortfall_billing,
--     billing_contract_lines.sac_code / plan_service_type / plan_sub_service,
--     billing_invoice_lines.services_planned / services_done / missed_dates,
--     billing_invoices.print_copies.
--   * adjustment_type adds SERVICES and FULL_DESPITE_SHORTFALL.
--   * Permissions go to Accounts Head / Accounts Executive /
--     Service Coordinator (not the old 'accountant' role).
-- =====================================================================

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
-- PART H. CHECKS AFTER RUNNING (read-only)
-- =====================================================================

-- 1. Expect 14 rows (one per new table, 0 records each on a fresh install).
--    An error here names the table that is missing.
--    (Deliberately does not use information_schema: phpMyAdmin switches the
--     current database to information_schema after such a query, which then
--     breaks the next statements with "#1109 Unknown table … in information_schema".)
SELECT 'billing_profiles'            AS table_name, COUNT(*) AS records FROM billing_profiles
UNION ALL SELECT 'billing_contracts',           COUNT(*) FROM billing_contracts
UNION ALL SELECT 'billing_contract_lines',      COUNT(*) FROM billing_contract_lines
UNION ALL SELECT 'billing_service_plans',       COUNT(*) FROM billing_service_plans
UNION ALL SELECT 'billing_service_plan_lines',  COUNT(*) FROM billing_service_plan_lines
UNION ALL SELECT 'customer_pos',                COUNT(*) FROM customer_pos
UNION ALL SELECT 'customer_po_advances',        COUNT(*) FROM customer_po_advances
UNION ALL SELECT 'billing_po_alerts',           COUNT(*) FROM billing_po_alerts
UNION ALL SELECT 'billing_runs',                COUNT(*) FROM billing_runs
UNION ALL SELECT 'billing_invoices',            COUNT(*) FROM billing_invoices
UNION ALL SELECT 'billing_invoice_lines',       COUNT(*) FROM billing_invoice_lines
UNION ALL SELECT 'billing_invoice_pos',         COUNT(*) FROM billing_invoice_pos
UNION ALL SELECT 'billing_advance_adjustments', COUNT(*) FROM billing_advance_adjustments
UNION ALL SELECT 'billing_invoice_shares',      COUNT(*) FROM billing_invoice_shares;

-- 2. Expect 8 rows (7 new + CANCEL_INVOICE).
SELECT id, name FROM permissions
 WHERE name IN ('VIEW_BILLING','MANAGE_BILLING_MASTERS','GENERATE_INVOICE','ISSUE_INVOICE',
                'CANCEL_INVOICE','SHARE_INVOICE','MANAGE_SERVICE_PLANS','VIEW_SERVICE_TRACKER');

-- 3. Grants per role.
SELECT r.name AS role, GROUP_CONCAT(p.name ORDER BY p.name) AS permissions
  FROM role_permissions rp
  JOIN roles r       ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
 WHERE r.name IN ('Accounts Head','Accounts Executive','Service Coordinator')
   AND p.name IN ('VIEW_BILLING','MANAGE_BILLING_MASTERS','GENERATE_INVOICE','ISSUE_INVOICE',
                  'CANCEL_INVOICE','SHARE_INVOICE','MANAGE_SERVICE_PLANS','VIEW_SERVICE_TRACKER')
 GROUP BY r.name;

-- 4. Current invoice number per financial year (agree the starting number before go-live).
SELECT * FROM brigade_invoice_sequences ORDER BY fy;


/* =====================================================================
   PART I. APPLICATION QUERIES  (reference for the backend – NOT executed)
   Placeholders use mysql2 style "?" in the order written. Names in the
   comment on each query say what each ? is.
   =====================================================================

-- ---------------------------------------------------------------------
-- I-1  Billing customers list                          GET /customers
--      ? = search text (or NULL)
-- ---------------------------------------------------------------------
SELECT c.id AS company_id, c.name, c.type AS customer_type,
       CASE WHEN c.type = 'CORPORATE' THEN 'COMMERCIAL'
            WHEN c.type IN ('INDIVIDUAL','RWA') THEN 'RESIDENTIAL' END AS category,
       c.gst_number,
       (bp.company_id IS NOT NULL AND bp.is_active = 1)            AS profile_complete,
       EXISTS (SELECT 1 FROM billing_service_plans sp
                WHERE sp.company_id = c.id AND sp.status = 'ACTIVE') AS has_service_plan,
       (SELECT COUNT(*) FROM billing_contracts bc
         WHERE bc.company_id = c.id AND bc.status = 'ACTIVE')       AS active_contracts
  FROM companies c
  LEFT JOIN billing_profiles bp ON bp.company_id = c.id
 WHERE (? IS NULL OR c.name LIKE CONCAT('%', ?, '%'))
 ORDER BY c.name;

-- ---------------------------------------------------------------------
-- I-2  Save billing profile                            PUT /profiles/:companyId
-- ---------------------------------------------------------------------
INSERT INTO billing_profiles
       (company_id, billing_name, billing_address, state_code, state_name,
        payment_terms_days, is_active, created_by, updated_by)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
ON DUPLICATE KEY UPDATE
       billing_name = VALUES(billing_name), billing_address = VALUES(billing_address),
       state_code = VALUES(state_code), state_name = VALUES(state_name),
       payment_terms_days = VALUES(payment_terms_days), is_active = VALUES(is_active),
       updated_by = VALUES(updated_by);

-- ---------------------------------------------------------------------
-- I-3  Service options for a customer               GET /service-options
--      ? = company_id (twice)
-- ---------------------------------------------------------------------
SELECT s.id AS site_id, s.name FROM sites s WHERE s.company_id = ? ORDER BY s.name;

SELECT DISTINCT j.service_type, j.sub_service
  FROM jobs j
  JOIN sites s ON s.id = j.company_id          -- jobs.company_id holds a site id
 WHERE s.company_id = ?
   AND j.is_archived = 0
 ORDER BY j.service_type, j.sub_service;

-- ---------------------------------------------------------------------
-- I-4  Service plan in force for a customer and month
--      ? = company_id, month start (YYYY-MM-01)
-- ---------------------------------------------------------------------
SELECT sp.*
  FROM billing_service_plans sp
 WHERE sp.company_id = ?
   AND sp.effective_from <= ?
 ORDER BY sp.effective_from DESC
 LIMIT 1;

SELECT l.*, s.name AS site
  FROM billing_service_plan_lines l
  JOIN sites s ON s.id = l.site_id
 WHERE l.plan_id = ?
 ORDER BY l.sort_order;

-- ---------------------------------------------------------------------
-- I-5  Service plans list with totals                 GET /service-plans
--      ? = month start (twice)
-- ---------------------------------------------------------------------
SELECT c.id AS company_id, c.name AS customer,
       (SELECT COUNT(*) FROM sites s WHERE s.company_id = c.id) AS outlets,
       sp.id AS plan_id, sp.version, sp.effective_from, sp.print_copies,
       sp.invoices_per_month, sp.invoice_split,
       (SELECT SUM(l.visits_per_month) FROM billing_service_plan_lines l
         WHERE l.plan_id = sp.id)                                AS services_per_month,
       (SELECT GROUP_CONCAT(CONCAT(l.sub_service, ' ', l.visits_per_month) SEPARATOR ' · ')
          FROM billing_service_plan_lines l WHERE l.plan_id = sp.id) AS services_summary,
       u.name AS updated_by
  FROM companies c
  JOIN billing_contracts bc ON bc.company_id = c.id AND bc.status = 'ACTIVE'
  LEFT JOIN billing_service_plans sp
         ON sp.company_id = c.id
        AND sp.effective_from = (SELECT MAX(x.effective_from) FROM billing_service_plans x
                                  WHERE x.company_id = c.id AND x.effective_from <= ?)
  LEFT JOIN users u ON u.id = sp.updated_by
 GROUP BY c.id, sp.id
 ORDER BY (sp.id IS NULL) DESC, c.name;

-- ---------------------------------------------------------------------
-- I-6  Save a new service plan version        PUT /service-plans/:companyId
--      Run in one transaction.
-- ---------------------------------------------------------------------
SELECT COALESCE(MAX(version), 0) + 1 AS next_version
  FROM billing_service_plans WHERE company_id = ? FOR UPDATE;

-- Replace a not-yet-started version with the same effective date, if any.
DELETE FROM billing_service_plans
 WHERE company_id = ? AND effective_from = ? AND status = 'SCHEDULED';

INSERT INTO billing_service_plans
       (id, company_id, version, effective_from, status, print_copies, invoice_split,
        invoices_per_month, shortfall_highlight_day, created_by, updated_by)
VALUES (UUID(), ?, ?, ?, IF(? <= CURDATE(), 'ACTIVE', 'SCHEDULED'), ?, ?, ?, ?, ?, ?);

INSERT INTO billing_service_plan_lines
       (id, plan_id, site_id, service_type, sub_service, visits_per_month, sort_order)
VALUES (UUID(), ?, ?, ?, ?, ?, ?);           -- one row per line

-- When the new version starts today, end the previous one.
UPDATE billing_service_plans
   SET status = 'ENDED'
 WHERE company_id = ? AND status = 'ACTIVE' AND id <> ? AND ? <= CURDATE();

-- ---------------------------------------------------------------------
-- I-7  Daily job (00:05): start scheduled plans whose date has come
-- ---------------------------------------------------------------------
UPDATE billing_service_plans old_p
  JOIN billing_service_plans new_p
    ON new_p.company_id = old_p.company_id
   AND new_p.status = 'SCHEDULED' AND new_p.effective_from <= CURDATE()
   SET old_p.status = 'ENDED'
 WHERE old_p.status = 'ACTIVE' AND old_p.effective_from < new_p.effective_from;

UPDATE billing_service_plans
   SET status = 'ACTIVE'
 WHERE status = 'SCHEDULED' AND effective_from <= CURDATE();

-- ---------------------------------------------------------------------
-- I-8  SERVICE TRACKER – planned vs done for a month  GET /service-tracker
--      ? = month start, month start, next month start,
--          month start, next month start, next month start
-- ---------------------------------------------------------------------
WITH plan AS (
  SELECT sp.company_id, sp.shortfall_highlight_day, l.site_id, l.service_type,
         l.sub_service, l.visits_per_month AS planned
    FROM billing_service_plans sp
    JOIN billing_service_plan_lines l ON l.plan_id = sp.id
   WHERE sp.effective_from = (SELECT MAX(x.effective_from) FROM billing_service_plans x
                               WHERE x.company_id = sp.company_id AND x.effective_from <= ?)
),
done AS (
  SELECT j.company_id AS site_id, j.service_type, j.sub_service,
         COUNT(*) AS done, MAX(DATE(v.completed_at)) AS last_visit,
         JSON_ARRAYAGG(v.id) AS visit_ids
    FROM job_visits v
    JOIN jobs j ON j.id = v.job_id
   WHERE v.status = 'COMPLETED'
     AND v.completed_at >= ? AND v.completed_at < ?
     AND j.is_archived = 0
   GROUP BY j.company_id, j.service_type, j.sub_service
),
upcoming AS (
  SELECT j.company_id AS site_id, j.service_type, j.sub_service,
         COUNT(*) AS scheduled_after_today, MIN(DATE(v.scheduled_date)) AS next_visit
    FROM job_visits v
    JOIN jobs j ON j.id = v.job_id
   WHERE v.status IN ('SCHEDULED','IN_PROGRESS','AWAITING_APPROVAL')
     AND v.scheduled_date >= CURDATE() AND v.scheduled_date < ?
     AND j.is_archived = 0
   GROUP BY j.company_id, j.service_type, j.sub_service
)
SELECT p.company_id, c.name AS customer, p.site_id, s.name AS site,
       p.service_type, p.sub_service, p.planned,
       COALESCE(d.done, 0)                               AS done,
       GREATEST(p.planned - COALESCE(d.done, 0), 0)      AS pending,
       COALESCE(u.scheduled_after_today, 0)              AS scheduled_after_today,
       d.last_visit, u.next_visit, d.visit_ids,
       CASE
         WHEN COALESCE(d.done, 0) > p.planned  THEN 'EXTRA'
         WHEN COALESCE(d.done, 0) = p.planned  THEN 'COMPLETED'
         WHEN COALESCE(d.done, 0) + COALESCE(u.scheduled_after_today, 0) >= p.planned
              AND CURDATE() < ?                THEN 'SCHEDULED'
         ELSE 'SHORT'
       END AS status,
       (COALESCE(d.done, 0) < p.planned AND DAY(CURDATE()) >= p.shortfall_highlight_day) AS highlight
  FROM plan p
  JOIN companies c ON c.id = p.company_id
  JOIN sites s     ON s.id = p.site_id
  LEFT JOIN done d     ON d.site_id = p.site_id AND d.service_type = p.service_type AND d.sub_service = p.sub_service
  LEFT JOIN upcoming u ON u.site_id = p.site_id AND u.service_type = p.service_type AND u.sub_service = p.sub_service
 ORDER BY FIELD(status, 'SHORT', 'SCHEDULED', 'EXTRA', 'COMPLETED'), c.name, s.name;

-- ---------------------------------------------------------------------
-- I-9  Visits behind one tracker row          GET /service-tracker/jobs
--      ? = site_id, service_type, sub_service, month start, next month start
-- ---------------------------------------------------------------------
SELECT j.id AS job_id, j.code AS job_code, v.visit_number, DATE(v.scheduled_date) AS scheduled_date,
       v.status, v.completed_at
  FROM job_visits v
  JOIN jobs j ON j.id = v.job_id
 WHERE j.company_id = ? AND j.service_type = ? AND j.sub_service = ?
   AND j.is_archived = 0
   AND COALESCE(v.completed_at, v.scheduled_date) >= ?
   AND COALESCE(v.completed_at, v.scheduled_date) <  ?
 ORDER BY COALESCE(v.completed_at, v.scheduled_date);

-- ---------------------------------------------------------------------
-- I-10 Notify Operations about short services    POST /service-tracker/notify
--      One row per user; users = Operations Manager + Service Coordinator.
-- ---------------------------------------------------------------------
SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
 WHERE r.name IN ('Operations Manager', 'Service Coordinator') AND u.is_active = 1;

INSERT INTO notifications (id, user_id, type, title, message, entity_type, entity_id, is_read)
VALUES (UUID(), ?, 'SERVICE_SHORTFALL', 'Services pending this month', ?, 'billing_service_plan', ?, 0);

-- ---------------------------------------------------------------------
-- I-11 Contracts list                                  GET /contracts
--      ? = company_id|NULL (x2), type|NULL (x2), status|NULL (x2)
-- ---------------------------------------------------------------------
SELECT bc.*, c.name AS customer,
       (SELECT bi.invoice_number FROM billing_invoices bi
         WHERE bi.contract_id = bc.id AND bi.status = 'ISSUED'
         ORDER BY bi.issued_at DESC LIMIT 1) AS last_invoice_number
  FROM billing_contracts bc
  JOIN companies c ON c.id = bc.company_id
 WHERE (? IS NULL OR bc.company_id = ?)
   AND (? IS NULL OR bc.billing_type = ?)
   AND (? IS NULL OR bc.status = ?)
 ORDER BY c.name, bc.contract_code;

-- ---------------------------------------------------------------------
-- I-12 Create contract                                 POST /contracts
--      Run in one transaction.
-- ---------------------------------------------------------------------
UPDATE sequences SET value = LAST_INSERT_ID(value + 1) WHERE name = 'billing_contract';
SELECT LAST_INSERT_ID() AS n;           -- contract_code = CONCAT(prefix, '-', LPAD(n, 4, '0'))

INSERT INTO billing_contracts
       (id, contract_code, company_id, billing_type, frequency_months, cycle_start_day,
        bill_timing, start_date, end_date, next_period_start, invoice_grouping, site_id,
        po_required, shortfall_billing, description_template, notes, created_by, updated_by)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);

INSERT INTO billing_contract_lines
       (id, contract_id, site_id, item_name, sac_code, service_id, plan_service_type,
        plan_sub_service, pricing_basis, unit, rate, default_qty, effective_from,
        sort_order, created_by, updated_by)
VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);   -- one row per line

-- ---------------------------------------------------------------------
-- I-13 Update contract header (optimistic lock)        PUT /contracts/:id
--      ? = fields…, updated_by, id, updated_at sent by the browser
--      affectedRows = 0  ->  409 "changed by someone else"
-- ---------------------------------------------------------------------
UPDATE billing_contracts
   SET bill_timing = ?, po_required = ?, description_template = ?, shortfall_billing = ?,
       end_date = ?, notes = ?, updated_by = ?
 WHERE id = ? AND updated_at = ?;

-- ---------------------------------------------------------------------
-- I-14 Pause / resume / end contract             POST /contracts/:id/status
-- ---------------------------------------------------------------------
UPDATE billing_contracts SET status = ?, status_reason = ?, updated_by = ? WHERE id = ?;

-- ---------------------------------------------------------------------
-- I-15 Change a rate from a date          PUT /contracts/:id/lines/:lineId
--      Transaction: end the old line the day before, add the new one.
-- ---------------------------------------------------------------------
UPDATE billing_contract_lines
   SET effective_to = DATE_SUB(?, INTERVAL 1 DAY), is_active = 0, updated_by = ?
 WHERE id = ? AND contract_id = ? AND effective_to IS NULL;

INSERT INTO billing_contract_lines
       (id, contract_id, site_id, item_name, sac_code, service_id, plan_service_type,
        plan_sub_service, pricing_basis, unit, rate, default_qty, effective_from,
        sort_order, created_by, updated_by)
SELECT UUID(), contract_id, site_id, item_name, sac_code, service_id, plan_service_type,
       plan_sub_service, pricing_basis, unit, ?, default_qty, ?, sort_order, ?, ?
  FROM billing_contract_lines WHERE id = ?;

-- Price list in force on a date:  ? = contract_id, date, date
SELECT * FROM billing_contract_lines
 WHERE contract_id = ? AND effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?)
 ORDER BY sort_order;

-- ---------------------------------------------------------------------
-- I-16 PO list with balance and expiry                 GET /pos
--      ? = expiring_in_days|NULL (x2), kind|NULL (x2)
-- ---------------------------------------------------------------------
SELECT po.*, c.name AS customer,
       (po.expiry_date IS NULL) AS is_open_po,
       DATEDIFF(po.expiry_date, CURDATE()) AS expires_in_days,
       COALESCE(SUM(bi.total), 0) AS invoiced,
       po.po_amount - COALESCE(SUM(bi.total), 0) AS balance
  FROM customer_pos po
  JOIN companies c ON c.id = po.company_id
  LEFT JOIN billing_invoice_pos bp ON bp.po_id = po.id
  LEFT JOIN billing_invoices bi    ON bi.id = bp.invoice_id AND bi.status = 'ISSUED'
 WHERE (? IS NULL OR (po.expiry_date IS NOT NULL AND po.expiry_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)))
   AND (? IS NULL OR po.po_kind = ?)
 GROUP BY po.id
 ORDER BY po.expiry_date IS NULL, po.expiry_date;

-- PO dashboard numbers
SELECT SUM(status = 'ACTIVE')                                            AS active,
       SUM(status = 'ACTIVE' AND expiry_date IS NULL)                     AS open_po,
       SUM(status = 'ACTIVE' AND expiry_date BETWEEN CURDATE()
                                    AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)) AS expiring_30_days,
       SUM(status = 'ACTIVE' AND expiry_date < CURDATE())                 AS expired
  FROM customer_pos;

-- ---------------------------------------------------------------------
-- I-17 Create PO / link advance        POST /pos, POST /pos/:id/advances
-- ---------------------------------------------------------------------
INSERT INTO customer_pos
       (id, company_id, contract_id, po_number, po_date, valid_from, expiry_date,
        po_amount, po_kind, remarks, created_by, updated_by)
VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);

-- payment must be POSTED, same customer, not linked elsewhere: ? = payment_id, company_id
SELECT p.id FROM payments p
 WHERE p.id = ? AND p.customer_id = ? AND p.status = 'POSTED'
   AND NOT EXISTS (SELECT 1 FROM customer_po_advances a WHERE a.payment_id = p.id);

INSERT INTO customer_po_advances (id, po_id, payment_id, created_by) VALUES (UUID(), ?, ?, ?);

-- ---------------------------------------------------------------------
-- I-18 Advance remaining on a Termite PO (inside the issue transaction)
-- ---------------------------------------------------------------------
SELECT p.id AS payment_id, p.received_amount,
       p.received_amount - COALESCE((SELECT SUM(pa.allocated_amount)
                                       FROM payment_allocations pa
                                      WHERE pa.payment_id = p.id), 0) AS remaining
  FROM customer_po_advances a
  JOIN payments p ON p.id = a.payment_id AND p.status = 'POSTED'
 WHERE a.po_id = ?
 ORDER BY p.payment_date
   FOR UPDATE;

-- ---------------------------------------------------------------------
-- I-19 PO expiry alerts (daily 07:00 cron)
-- ---------------------------------------------------------------------
SELECT po.id, po.po_number, c.name AS customer, po.expiry_date,
       CASE DATEDIFF(po.expiry_date, CURDATE()) WHEN 15 THEN 'D15' WHEN 7 THEN 'D7' WHEN 0 THEN 'D0' END AS alert_kind
  FROM customer_pos po
  JOIN companies c ON c.id = po.company_id
 WHERE po.status = 'ACTIVE'
   AND DATEDIFF(po.expiry_date, CURDATE()) IN (15, 7, 0)
   AND NOT EXISTS (SELECT 1 FROM billing_po_alerts a
                    WHERE a.po_id = po.id
                      AND a.alert_kind = CASE DATEDIFF(po.expiry_date, CURDATE())
                                           WHEN 15 THEN 'D15' WHEN 7 THEN 'D7' ELSE 'D0' END);

INSERT IGNORE INTO billing_po_alerts (po_id, alert_kind) VALUES (?, ?);

-- ---------------------------------------------------------------------
-- I-20 BILL RUN – contracts due for a month             GET /due
--      ? = month end.  Period end / ARREARS timing is worked out in Node.
-- ---------------------------------------------------------------------
SELECT bc.*, c.name AS customer, c.type AS customer_type, c.gst_number,
       (bp.company_id IS NOT NULL) AS has_profile,
       EXISTS (SELECT 1 FROM customer_pos po
                WHERE po.company_id = bc.company_id AND po.status = 'ACTIVE'
                  AND (po.expiry_date IS NULL OR po.expiry_date >= bc.next_period_start)) AS has_valid_po,
       EXISTS (SELECT 1 FROM billing_invoices bi
                WHERE bi.contract_id = bc.id AND bi.period_start = bc.next_period_start
                  AND bi.status = 'DRAFT') AS already_drafted
  FROM billing_contracts bc
  JOIN companies c ON c.id = bc.company_id
  LEFT JOIN billing_profiles bp ON bp.company_id = bc.company_id AND bp.is_active = 1
 WHERE bc.status = 'ACTIVE'
   AND (bc.end_date IS NULL OR bc.next_period_start <= bc.end_date)
   AND bc.next_period_start <= ?
   AND NOT EXISTS (SELECT 1 FROM billing_invoices bi
                    WHERE bi.contract_id = bc.id AND bi.period_start = bc.next_period_start
                      AND bi.status = 'ISSUED');
-- Services planned/done per contract for the "Services (done / plan)" column: run I-8
-- for the month and sum by company_id.

-- ---------------------------------------------------------------------
-- I-21 Generate drafts                                   POST /runs
--      Transaction per contract. Duplicate period -> uq_binv_period error -> 409.
-- ---------------------------------------------------------------------
INSERT INTO billing_runs (id, period_month, contracts_selected, run_by) VALUES (?, ?, ?, ?);

INSERT INTO billing_invoices
       (id, contract_id, company_id, site_id, bill_run_id, billing_type, customer_category,
        tax_mode, place_of_supply, ship_to_site_id, period_start, period_end, invoice_date,
        due_date, subtotal, cgst, sgst, igst, round_off, total, print_copies, description,
        status, created_by, updated_by)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?);

INSERT INTO billing_invoice_lines
       (id, invoice_id, contract_line_id, site_id, item_name, sac_code, unit, pricing_basis,
        rate, quantity, adjustment_type, services_planned, services_done, missed_dates,
        amount, job_ids, sort_order)
VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);   -- one row per line

UPDATE billing_runs SET drafts_created = ?, skipped = ? WHERE id = ?;

-- ---------------------------------------------------------------------
-- I-22 Invoice list                                      GET /invoices
--      ? = status, month start, next month start
-- ---------------------------------------------------------------------
SELECT bi.id, bi.status, bi.invoice_number, bi.invoice_date, c.name AS customer,
       bi.billing_type, bi.period_start, bi.period_end, bi.subtotal, bi.total,
       bi.advance_adjusted, bi.print_copies,
       inv.status AS receivable_status,
       (SELECT COUNT(*) FROM billing_invoice_lines l
         WHERE l.invoice_id = bi.id AND l.services_done < l.services_planned) AS service_shortfall_lines,
       (SELECT GROUP_CONCAT(po.po_number SEPARATOR ', ')
          FROM billing_invoice_pos bp JOIN customer_pos po ON po.id = bp.po_id
         WHERE bp.invoice_id = bi.id) AS po_numbers,
       (SELECT JSON_OBJECT('channel', s.channel, 'at', s.created_at, 'by', u.name)
          FROM billing_invoice_shares s LEFT JOIN users u ON u.id = s.created_by
         WHERE s.billing_invoice_id = bi.id ORDER BY s.created_at DESC LIMIT 1) AS last_shared
  FROM billing_invoices bi
  JOIN companies c ON c.id = bi.company_id
  LEFT JOIN invoices inv ON inv.id = bi.receivable_invoice_id
 WHERE bi.status = ?
   AND bi.invoice_date >= ? AND bi.invoice_date < ?
 ORDER BY bi.invoice_date DESC, bi.invoice_number DESC;

-- ---------------------------------------------------------------------
-- I-23 Save draft (optimistic lock)                    PUT /invoices/:id
--      Transaction. affectedRows = 0 on the UPDATE -> 409.
-- ---------------------------------------------------------------------
UPDATE billing_invoices
   SET invoice_date = ?, due_date = ?, ship_to_site_id = ?, description = ?,
       subtotal = ?, cgst = ?, sgst = ?, igst = ?, round_off = ?, total = ?, updated_by = ?
 WHERE id = ? AND status = 'DRAFT' AND updated_at = ?;

DELETE FROM billing_invoice_lines WHERE invoice_id = ?;
INSERT INTO billing_invoice_lines
       (id, invoice_id, contract_line_id, site_id, item_name, sac_code, unit, pricing_basis,
        rate, quantity, adjustment_type, services_planned, services_done, missed_dates,
        days_worked, days_in_period, percent, manual_amount, adjustment_reason, amount,
        job_ids, sort_order)
VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);

DELETE FROM billing_invoice_pos WHERE invoice_id = ?;
INSERT INTO billing_invoice_pos (invoice_id, po_id) VALUES (?, ?);

-- Delete draft                                          DELETE /invoices/:id
DELETE FROM billing_invoices WHERE id = ? AND status = 'DRAFT';

-- ---------------------------------------------------------------------
-- I-24 ISSUE – one transaction per invoice, lock order:
--      invoice -> number counter -> advance payments (I-18)
-- ---------------------------------------------------------------------
SELECT * FROM billing_invoices WHERE id = ? AND status = 'DRAFT' FOR UPDATE;

SELECT last_number FROM brigade_invoice_sequences WHERE fy = ? FOR UPDATE;
-- no row for a new year:
INSERT INTO brigade_invoice_sequences (fy, last_number) VALUES (?, ?);   -- agreed start number
UPDATE brigade_invoice_sequences SET last_number = last_number + 1 WHERE fy = ?;

-- receivable in the existing table (shows in the Accountant Panel)
INSERT INTO invoices
       (id, invoice_number, customer_id, site_id, invoice_date, due_date, invoice_amount,
        paid_amount, pending_amount, status, remarks, created_by)
VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 'PENDING', CONCAT('Generated – ', ?), ?);
-- then call the existing insertInvoiceTds(connection, invoiceId, companyId, total)

-- Termite advance: allocate from the oldest advance payment first
INSERT INTO payment_allocations (id, payment_id, invoice_id, allocated_amount, created_by)
VALUES (?, ?, ?, ?, ?);
INSERT INTO billing_advance_adjustments
       (id, invoice_id, po_id, payment_id, payment_allocation_id, amount, created_by)
VALUES (UUID(), ?, ?, ?, ?, ?, ?);
UPDATE invoices
   SET paid_amount = paid_amount + ?, pending_amount = invoice_amount - (paid_amount + ?),
       status = IF(invoice_amount - (paid_amount + ?) <= 0, 'PAID', 'PARTIAL')
 WHERE id = ?;

UPDATE billing_invoices
   SET status = 'ISSUED', invoice_number = ?, fy = ?, seq = ?, receivable_invoice_id = ?,
       advance_adjusted = ?, content = ?, issued_by = ?, issued_at = NOW()
 WHERE id = ? AND status = 'DRAFT';

-- move the contract to its next period
UPDATE billing_contracts SET next_period_start = ? WHERE id = ?;

-- ---------------------------------------------------------------------
-- I-25 CANCEL                                   POST /invoices/:id/cancel
--      Blocked if any customer payment (not the advance) is allocated.
-- ---------------------------------------------------------------------
SELECT COUNT(*) AS customer_payments
  FROM payment_allocations pa
 WHERE pa.invoice_id = ?
   AND pa.id NOT IN (SELECT payment_allocation_id FROM billing_advance_adjustments
                      WHERE invoice_id = ? AND payment_allocation_id IS NOT NULL);

DELETE pa FROM payment_allocations pa
  JOIN billing_advance_adjustments baa ON baa.payment_allocation_id = pa.id
 WHERE baa.invoice_id = ?;
UPDATE billing_advance_adjustments SET is_reversed = 1 WHERE invoice_id = ?;

UPDATE invoices SET status = 'CANCELLED', paid_amount = 0, pending_amount = 0, updated_by = ?
 WHERE id = ?;
UPDATE billing_invoices
   SET status = 'CANCELLED', cancelled_by = ?, cancelled_at = NOW(), cancel_reason = ?
 WHERE id = ? AND status = 'ISSUED';
UPDATE billing_invoice_shares SET revoked_at = NOW()
 WHERE billing_invoice_id = ? AND token_hash IS NOT NULL AND revoked_at IS NULL;
-- If it was the contract's latest period, move next_period_start back to bi.period_start.

-- ---------------------------------------------------------------------
-- I-26 PRINT / SHARE
-- ---------------------------------------------------------------------
-- Share options: copies + customer contacts (existing customer contacts table)
SELECT bi.invoice_number, bi.total, bi.due_date, bi.print_copies, c.name AS customer
  FROM billing_invoices bi JOIN companies c ON c.id = bi.company_id
 WHERE bi.id = ? AND bi.status = 'ISSUED';
-- contacts come from the existing GET /api/invoices/customers/:customerId/contact logic

-- Log a print / email / WhatsApp / other share
INSERT INTO billing_invoice_shares
       (id, billing_invoice_id, channel, recipients, cc, subject, attach, copies, note,
        status, error_message, created_by)
VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);

-- Create a public link: the token is random; only its SHA-256 is stored
INSERT INTO billing_invoice_shares
       (id, billing_invoice_id, channel, token_hash, expires_at, status, created_by)
VALUES (UUID(), ?, 'LINK', SHA2(?, 256), DATE_ADD(NOW(), INTERVAL ? DAY), 'LOGGED', ?);

-- Open a public link            GET /api/public/billing/invoices/:token
SELECT s.id AS share_id, s.billing_invoice_id, s.expires_at, s.revoked_at, bi.status
  FROM billing_invoice_shares s
  JOIN billing_invoices bi ON bi.id = s.billing_invoice_id
 WHERE s.token_hash = SHA2(?, 256);
-- 404 if no row, 410 if expires_at < NOW() or revoked_at IS NOT NULL or status = 'CANCELLED'
UPDATE billing_invoice_shares
   SET open_count = open_count + 1, last_opened_at = NOW()
 WHERE id = ?;

-- Share history                 GET /invoices/:id/shares
SELECT s.id, s.channel, s.recipients AS `to`, s.copies, s.status, s.open_count,
       u.name AS `by`, s.created_at AS `at`
  FROM billing_invoice_shares s
  LEFT JOIN users u ON u.id = s.created_by
 WHERE s.billing_invoice_id = ?
 ORDER BY s.created_at DESC;

===================================================================== */


/* =====================================================================
   PART J. ROLLBACK  (NOT executed – only before any invoice is issued)
   =====================================================================

DELETE rp FROM role_permissions rp
  JOIN permissions p ON p.id = rp.permission_id
 WHERE p.name IN ('VIEW_BILLING','MANAGE_BILLING_MASTERS','GENERATE_INVOICE','ISSUE_INVOICE',
                  'SHARE_INVOICE','MANAGE_SERVICE_PLANS','VIEW_SERVICE_TRACKER');
DELETE rp FROM role_permissions rp
  JOIN permissions p ON p.id = rp.permission_id
  JOIN roles r ON r.id = rp.role_id
 WHERE p.name = 'CANCEL_INVOICE' AND r.name = 'Accounts Head';
DELETE FROM permissions
 WHERE name IN ('VIEW_BILLING','MANAGE_BILLING_MASTERS','GENERATE_INVOICE','ISSUE_INVOICE',
                'SHARE_INVOICE','MANAGE_SERVICE_PLANS','VIEW_SERVICE_TRACKER');

DROP TABLE IF EXISTS billing_invoice_shares;
DROP TABLE IF EXISTS billing_advance_adjustments;
DROP TABLE IF EXISTS billing_invoice_pos;
DROP TABLE IF EXISTS billing_invoice_lines;
DROP TABLE IF EXISTS billing_invoices;
DROP TABLE IF EXISTS billing_runs;
DROP TABLE IF EXISTS billing_po_alerts;
DROP TABLE IF EXISTS customer_po_advances;
DROP TABLE IF EXISTS customer_pos;
DROP TABLE IF EXISTS billing_service_plan_lines;
DROP TABLE IF EXISTS billing_service_plans;
DROP TABLE IF EXISTS billing_contract_lines;
DROP TABLE IF EXISTS billing_contracts;
DROP TABLE IF EXISTS billing_profiles;
DELETE FROM sequences WHERE name = 'billing_contract';
-- brigade_invoice_sequences is shared with Brigade – never drop it.

===================================================================== */

-- =====================================================================
-- Accountant Panel audit log
-- Adds 2 NEW tables only. No existing table, column or row is changed.
-- Safe to run more than once.
--
-- Until this has been run, the app keeps working as before: audit writes are
-- skipped, and the Audit Log page says it is not set up yet.
-- =====================================================================

-- One row per action (payment recorded, invoice edited, TDS changed, export...)
CREATE TABLE IF NOT EXISTS audit_logs (
  id            CHAR(36)      NOT NULL,
  created_at    DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  -- who (copied at the time, so the entry stays correct if the user is renamed or deleted)
  user_id       BIGINT        NULL,
  user_name     VARCHAR(150)  NULL,
  user_role     VARCHAR(100)  NULL,
  branch_id     CHAR(36)      NULL,

  -- what
  module        VARCHAR(30)   NOT NULL,   -- INVOICE, PAYMENT, TDS, IMPORT, CONTACT, EXPORT
  action        VARCHAR(50)   NOT NULL,   -- e.g. INVOICE_EDITED, PAYMENT_RECORDED, TDS_SETTING_CHANGED

  -- the main record it was done to
  entity_type   VARCHAR(30)   NULL,       -- INVOICE, PAYMENT, CUSTOMER, IMPORT, CONTACT, REPORT
  entity_id     VARCHAR(64)   NULL,
  entity_label  VARCHAR(255)  NULL,       -- e.g. BSPMPL26-27/971, COMP567
  customer_id   VARCHAR(64)   NULL,

  -- the change
  summary       VARCHAR(500)  NULL,       -- one line shown in the table
  changes       JSON          NULL,       -- [{ "field": "due_date", "from": "2026-11-30", "to": "2026-12-15" }]
  details       JSON          NULL,       -- extra data, e.g. invoice-wise TDS before/after, allocations
  reason        VARCHAR(500)  NULL,       -- cancellations, TDS removal

  -- where from
  source        VARCHAR(20)   NOT NULL DEFAULT 'WEB',   -- WEB, IMPORT, SYSTEM, DATABASE
  ip_address    VARCHAR(64)   NULL,
  user_agent    VARCHAR(255)  NULL,

  PRIMARY KEY (id),
  KEY idx_audit_created  (created_at),
  KEY idx_audit_module   (module, action, created_at),
  KEY idx_audit_user     (user_id, created_at),
  KEY idx_audit_entity   (entity_type, entity_id),
  KEY idx_audit_customer (customer_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Accountant Panel audit trail (read only; never updated or deleted by the app)';

-- Every record an action touched. One payment or one TDS change can touch many invoices,
-- and this lets an invoice's "Change History" find all of them.
CREATE TABLE IF NOT EXISTS audit_log_refs (
  audit_id     CHAR(36)     NOT NULL,
  entity_type  VARCHAR(30)  NOT NULL,     -- INVOICE, PAYMENT, CUSTOMER, CONTACT, IMPORT
  entity_id    VARCHAR(64)  NOT NULL,
  PRIMARY KEY (audit_id, entity_type, entity_id),
  KEY idx_audit_ref_entity (entity_type, entity_id),
  CONSTRAINT fk_audit_ref_log FOREIGN KEY (audit_id) REFERENCES audit_logs (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Records touched by each audit entry';

-- Check:
-- SHOW TABLES LIKE 'audit_log%';   -- expected: audit_logs, audit_log_refs

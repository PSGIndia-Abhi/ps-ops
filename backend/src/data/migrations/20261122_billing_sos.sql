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

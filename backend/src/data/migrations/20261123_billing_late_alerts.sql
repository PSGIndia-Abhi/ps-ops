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

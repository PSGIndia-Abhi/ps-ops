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

USE ps_ops;

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

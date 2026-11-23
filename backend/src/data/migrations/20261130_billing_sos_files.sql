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

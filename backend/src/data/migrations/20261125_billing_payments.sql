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

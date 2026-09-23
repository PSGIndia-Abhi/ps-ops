-- TDS support for invoices and payments.
--
-- Rules this schema is built for:
--  * The customer master says whether TDS applies and at what rate (companies.tds_*).
--  * When an invoice is created/imported, that setting is COPIED into invoice_tds (a snapshot),
--    so changing the customer's rate later never changes old invoices.
--  * A payment has cash (payments.received_amount, unchanged) and TDS (payments.tds_amount).
--    Each allocation likewise has cash (allocated_amount, unchanged) and tds_amount.
--  * Invoice status (PENDING/PARTIAL/PAID) and TDS status (invoice_tds.status) are independent:
--    an invoice can be PAID while its TDS is still PENDING, and that TDS can be recorded later
--    ("previous TDS") without reopening the invoice.
--
-- Run this once. Existing columns and rows are not changed, only added to.

ALTER TABLE companies
  ADD COLUMN tds_applicable TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN tds_rate DECIMAL(5,2) NULL;

ALTER TABLE payments
  ADD COLUMN tds_amount DECIMAL(15,2) NOT NULL DEFAULT 0 AFTER received_amount;

ALTER TABLE payment_allocations
  ADD COLUMN tds_amount DECIMAL(15,2) NOT NULL DEFAULT 0 AFTER allocated_amount;

CREATE TABLE IF NOT EXISTS invoice_tds (
  id CHAR(36) NOT NULL DEFAULT (uuid()),
  invoice_id CHAR(36) NOT NULL,
  tds_applicable TINYINT(1) NOT NULL DEFAULT 0,
  tds_rate DECIMAL(5,2) NULL,
  expected_tds DECIMAL(15,2) NOT NULL DEFAULT 0,
  deducted_tds DECIMAL(15,2) NOT NULL DEFAULT 0,
  pending_tds DECIMAL(15,2) NOT NULL DEFAULT 0,
  status ENUM('NOT_APPLICABLE','PENDING','PARTIAL','CLEARED') NOT NULL DEFAULT 'NOT_APPLICABLE',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_invoice_tds_invoice (invoice_id),
  INDEX idx_invoice_tds_status (status),
  CONSTRAINT fk_invoice_tds_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS tds_transactions (
  id CHAR(36) NOT NULL DEFAULT (uuid()),
  payment_id CHAR(36) NOT NULL,
  payment_allocation_id CHAR(36) NOT NULL,
  invoice_id CHAR(36) NOT NULL,
  customer_id CHAR(36) NOT NULL,
  tds_type ENUM('CURRENT','PREVIOUS') NOT NULL,
  tds_rate DECIMAL(5,2) NULL,
  tds_amount DECIMAL(15,2) NOT NULL,
  remarks VARCHAR(500) NULL,
  created_by BIGINT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_tds_tx_invoice (invoice_id),
  INDEX idx_tds_tx_payment (payment_id),
  INDEX idx_tds_tx_customer (customer_id),
  CONSTRAINT fk_tds_tx_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE,
  CONSTRAINT fk_tds_tx_allocation FOREIGN KEY (payment_allocation_id) REFERENCES payment_allocations(id) ON DELETE CASCADE,
  CONSTRAINT fk_tds_tx_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  CONSTRAINT fk_tds_tx_customer FOREIGN KEY (customer_id) REFERENCES companies(id),
  CONSTRAINT fk_tds_tx_created_by FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- Invoices that already exist get a "TDS not applicable" record (no customer had TDS configured before this).
INSERT INTO invoice_tds (id, invoice_id, tds_applicable, tds_rate, expected_tds, deducted_tds, pending_tds, status)
SELECT UUID(), i.id, 0, NULL, 0, 0, 0, 'NOT_APPLICABLE'
FROM invoices i
LEFT JOIN invoice_tds t ON t.invoice_id = i.id
WHERE t.id IS NULL;

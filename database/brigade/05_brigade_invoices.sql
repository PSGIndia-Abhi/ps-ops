-- =====================================================================
-- Brigade invoices (Brigade Executive + admin)
--
-- Adds THREE new tables. No existing table is changed.
--   * brigade_invoice_sequences : the running invoice number per financial year
--   * brigade_invoices          : one row per tax invoice raised from a PO, with
--                                 a snapshot of what was printed (so a re-download
--                                 is identical even if the PO changes later)
--   * brigade_invoice_lines     : which services (jobs) are on which invoice. A PO can
--                                 be invoiced any number of times; each invoice lists
--                                 all of the PO's services
--
-- Numbers look like BSPMPL26-27/5000: the financial year (April-March) and a
-- running number. The very first invoice starts at 5000 (earlier numbers were
-- used outside this system); every later financial year starts again at 0001.
--
-- Safe to run more than once.
-- =====================================================================

CREATE TABLE IF NOT EXISTS brigade_invoice_sequences (
  fy          CHAR(5)   NOT NULL,              -- financial year, e.g. 26-27
  last_number INT       NOT NULL,              -- last number handed out in that year
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (fy)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Brigade invoice running number per financial year';

CREATE TABLE IF NOT EXISTS brigade_invoices (
  id                 CHAR(36)      NOT NULL,
  invoice_number     VARCHAR(30)   NOT NULL,   -- e.g. BSPMPL26-27/5000
  fy                 CHAR(5)       NOT NULL,
  seq                INT           NOT NULL,
  po_number          VARCHAR(100)  NOT NULL,
  invoice_date       DATE          NOT NULL,
  subtotal           DECIMAL(12,2) NOT NULL,   -- taxable amount
  cgst               DECIMAL(12,2) NOT NULL,
  sgst               DECIMAL(12,2) NOT NULL,
  total              DECIMAL(12,2) NOT NULL,
  content            JSON          NOT NULL,   -- everything printed on the invoice
  created_by_user_id BIGINT        NULL,
  created_at         TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_brigade_invoice_number (invoice_number),
  KEY idx_brigade_invoice_po (po_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Brigade tax invoices raised from a client PO';

CREATE TABLE IF NOT EXISTS brigade_invoice_lines (
  id         CHAR(36)      NOT NULL,
  invoice_id CHAR(36)      NOT NULL,
  job_id     CHAR(36)      NOT NULL,   -- one service of a Brigade booking
  amount     DECIMAL(12,2) NOT NULL,   -- billed amount on the invoice (excl. GST)
  PRIMARY KEY (id),
  KEY idx_brigade_invoice_line_job (job_id),
  KEY idx_brigade_invoice_line_invoice (invoice_id),
  CONSTRAINT fk_brigade_invoice_line_invoice FOREIGN KEY (invoice_id) REFERENCES brigade_invoices (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Brigade invoices: which service is on which invoice';

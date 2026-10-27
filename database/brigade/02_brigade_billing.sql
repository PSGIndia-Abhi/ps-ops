-- =====================================================================
-- Brigade Billing (Brigade Executive + admin)
--
-- Adds two NEW tables only. No existing table is changed.
--   * brigade_pos       : one row per client PO number (source, date, amount)
--   * brigade_po_lines  : which service (job) is billed under which PO, and
--                         the amount typed for it. A job belongs to one PO.
--
-- A PO typed during booking (brigade_booking_details.client_po_number) is
-- picked up automatically by the Billing page; that column is only read.
--
-- Safe to run more than once.
-- =====================================================================

CREATE TABLE IF NOT EXISTS brigade_pos (
  id                 CHAR(36)      NOT NULL,
  po_number          VARCHAR(100)  NOT NULL,
  po_source          VARCHAR(255)  NULL,       -- "where it comes from" (free text)
  po_date            DATE          NULL,
  po_amount          DECIMAL(12,2) NULL,
  created_by_user_id BIGINT        NULL,
  updated_by_user_id BIGINT        NULL,
  created_at         TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_brigade_po_number (po_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Brigade client POs used for billing';

CREATE TABLE IF NOT EXISTS brigade_po_lines (
  id                 CHAR(36)      NOT NULL,
  po_id              CHAR(36)      NOT NULL,
  job_id             CHAR(36)      NOT NULL,   -- one service of a Brigade booking
  amount             DECIMAL(12,2) NOT NULL DEFAULT 0,   -- billed amount (excl. GST)
  updated_by_user_id BIGINT        NULL,
  created_at         TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_brigade_po_line_job (job_id),
  KEY idx_brigade_po_line_po (po_id),
  CONSTRAINT fk_brigade_po_line_po FOREIGN KEY (po_id) REFERENCES brigade_pos (id) ON DELETE CASCADE,
  CONSTRAINT fk_brigade_po_line_job FOREIGN KEY (job_id) REFERENCES jobs (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Brigade billing: service (job) -> PO with billed amount';

-- =====================================================================
-- Brigade PO files (Brigade Executive + admin)
--
-- Adds ONE new table. No existing table is changed.
--
-- Files attached to a client PO: the PO copy, the email it came in, etc.
-- They are kept per PO number, so a file uploaded while booking (Client PO
-- section) also shows on that PO in Billing, and the other way round.
-- The file itself lives in MinIO; this table only holds where it is.
--
-- Safe to run more than once.
-- =====================================================================

CREATE TABLE IF NOT EXISTS brigade_po_files (
  id                  CHAR(36)      NOT NULL,
  po_number           VARCHAR(100)  NOT NULL,   -- same number as the booking / brigade_pos
  object_key          VARCHAR(255)  NOT NULL,   -- where the file is in MinIO
  file_name           VARCHAR(255)  NOT NULL,
  file_type           VARCHAR(100)  NULL,
  file_size           INT           NOT NULL DEFAULT 0,   -- bytes
  uploaded_by_user_id BIGINT        NULL,
  created_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_brigade_po_files_po (po_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Files attached to a Brigade client PO';

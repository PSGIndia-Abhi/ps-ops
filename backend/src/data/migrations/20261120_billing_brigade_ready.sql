-- =====================================================================
-- Invoice Generation (Billing): make the billing tables ready to hold Brigade too.
--
-- Plan: one invoice table and one PO table for the whole company. Brigade invoices and POs
-- (brigade_invoices, brigade_invoice_lines, brigade_pos, brigade_po_files) move into these
-- tables LATER, in a separate step. NOTHING in Brigade changes here: no brigade_* table and
-- no Brigade code is touched, and every new column has a default, so billing keeps working
-- exactly as before.
--
--   customer_pos          + source (BILLING / BRIGADE), + po_source ("where the PO came from")
--   customer_po_files     NEW: any number of files per PO (Brigade keeps several per PO).
--                         The single file on customer_pos (file_object_key, file_name) moves here.
--   billing_invoices      + source; contract_id, billing_type and the period become optional
--                         (a Brigade invoice is raised from a PO, not from a contract period)
--   billing_invoice_lines + job_id (a Brigade line is one service = one job)
--
-- Run ONCE, after 20261116_billing_module.sql … 20261119_billing_frequencies.sql.
-- Take a backup first. Database: MySQL 8.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Purchase orders: where each PO belongs, and where it came from
-- ---------------------------------------------------------------------
ALTER TABLE customer_pos
  ADD COLUMN source    ENUM('BILLING','BRIGADE') NOT NULL DEFAULT 'BILLING' AFTER id,
  ADD COLUMN po_source VARCHAR(255) NULL AFTER po_kind;   -- free text, e.g. "Email from Brigade purchase team"


-- ---------------------------------------------------------------------
-- 2. PO files: one row per uploaded copy (the newest is the PO's current copy)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer_po_files (
  id          CHAR(36)     NOT NULL,
  po_id       CHAR(36)     NOT NULL,
  object_key  VARCHAR(500) NOT NULL,              -- where the file is in MinIO
  file_name   VARCHAR(255) NOT NULL,
  file_type   VARCHAR(100) NULL,                  -- application/pdf, image/png, image/jpeg
  file_size   INT          NOT NULL DEFAULT 0,    -- bytes
  uploaded_by BIGINT       NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cpof_po (po_id, created_at),
  CONSTRAINT fk_cpof_po   FOREIGN KEY (po_id)       REFERENCES customer_pos (id) ON DELETE CASCADE,
  CONSTRAINT fk_cpof_user FOREIGN KEY (uploaded_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Invoice generation: files (PO copies) attached to a customer PO';

-- Move the PO copies already uploaded into the new table (the files stay where they are in MinIO).
INSERT INTO customer_po_files (id, po_id, object_key, file_name, file_type, file_size, uploaded_by, created_at)
SELECT UUID(), po.id, po.file_object_key, COALESCE(NULLIF(po.file_name, ''), 'po'),
       CASE LOWER(SUBSTRING_INDEX(po.file_name, '.', -1))
         WHEN 'pdf' THEN 'application/pdf' WHEN 'png' THEN 'image/png'
         WHEN 'jpg' THEN 'image/jpeg' WHEN 'jpeg' THEN 'image/jpeg' ELSE NULL END,
       0, po.updated_by, COALESCE(po.updated_at, po.created_at)
  FROM customer_pos po
 WHERE po.file_object_key IS NOT NULL AND po.file_object_key <> ''
   AND NOT EXISTS (SELECT 1 FROM customer_po_files f WHERE f.po_id = po.id AND f.object_key = po.file_object_key);

ALTER TABLE customer_pos
  DROP COLUMN file_object_key,
  DROP COLUMN file_name;


-- ---------------------------------------------------------------------
-- 3. Invoices: where each invoice comes from; contract and period optional
-- ---------------------------------------------------------------------
-- period_key (a contract period can't be billed twice) is NULL when contract_id is NULL,
-- so invoices without a contract are not limited by it.
ALTER TABLE billing_invoices
  ADD COLUMN source ENUM('BILLING','BRIGADE') NOT NULL DEFAULT 'BILLING' AFTER id,
  MODIFY COLUMN contract_id  CHAR(36) NULL,
  MODIFY COLUMN billing_type ENUM('AMC','ONE_TIME','TERMITE','CHEMICAL') NULL,
  MODIFY COLUMN period_start DATE NULL,
  MODIFY COLUMN period_end   DATE NULL,
  ADD KEY idx_binv_source (source, status);


-- ---------------------------------------------------------------------
-- 4. Invoice lines: the service (job) a line bills
-- ---------------------------------------------------------------------
ALTER TABLE billing_invoice_lines
  ADD COLUMN job_id CHAR(36) NULL AFTER contract_line_id,
  ADD KEY idx_bil_job (job_id);


-- ---------------------------------------------------------------------
-- Checks (expected: source = BILLING everywhere; files moved = POs that had a copy)
-- ---------------------------------------------------------------------
-- SELECT source, COUNT(*) FROM customer_pos GROUP BY source;
-- SELECT source, status, COUNT(*) FROM billing_invoices GROUP BY source, status;
-- SELECT COUNT(*) AS po_files FROM customer_po_files;


-- ---------------------------------------------------------------------
-- Rollback (only while no Brigade rows have been added; run in this order)
-- ---------------------------------------------------------------------
-- ALTER TABLE billing_invoice_lines DROP KEY idx_bil_job, DROP COLUMN job_id;
-- ALTER TABLE billing_invoices DROP KEY idx_binv_source, DROP COLUMN source,
--   MODIFY COLUMN contract_id CHAR(36) NOT NULL,
--   MODIFY COLUMN billing_type ENUM('AMC','ONE_TIME','TERMITE','CHEMICAL') NOT NULL,
--   MODIFY COLUMN period_start DATE NOT NULL, MODIFY COLUMN period_end DATE NOT NULL;
-- ALTER TABLE customer_pos ADD COLUMN file_object_key TEXT NULL AFTER status, ADD COLUMN file_name VARCHAR(255) NULL AFTER file_object_key;
-- UPDATE customer_pos po JOIN (SELECT f.po_id, f.object_key, f.file_name FROM customer_po_files f
--   WHERE f.created_at = (SELECT MAX(f2.created_at) FROM customer_po_files f2 WHERE f2.po_id = f.po_id)) l ON l.po_id = po.id
--   SET po.file_object_key = l.object_key, po.file_name = l.file_name;
-- DROP TABLE customer_po_files;
-- ALTER TABLE customer_pos DROP COLUMN po_source, DROP COLUMN source;

-- Brigade POs and invoices move onto the billing tables (one store for every invoice and PO).
--
--   customer_pos (source BRIGADE)        Brigade client POs. A Brigade PO can cover several properties,
--                                         so it has no company (company_id NULL); its number is unique
--                                         among Brigade POs (brigade_po_key). po_date may be empty.
--   customer_po_files                     Brigade PO copies (were brigade_po_files, kept by PO number).
--   brigade_po_lines.po_id                now points at customer_pos (service -> PO, with its price).
--   billing_invoices / _lines (source BRIGADE)
--                                         Brigade tax invoices, one per property, numbered BSBR<fy>/<n>
--                                         (own counter: sequences "brigade_invoice_<fy>"), each line with
--                                         its job; the PO through billing_invoice_pos. Each new one also
--                                         gets its receivable in the Accountant Panel (Deep Clean).
--
-- Existing Brigade POs, PO files and invoices are copied across with the same ids (invoices keep the
-- numbers they were issued with). The old brigade_pos / brigade_po_files / brigade_invoices /
-- brigade_invoice_lines tables are NOT dropped here - they are left as they are and no longer used.
--
-- Billing (source BILLING) is not changed: its POs always have a company and a date, its unique key
-- (company_id, po_number) stays, and its screens only read source BILLING.
-- Safe to re-run. Run after prod_release_billing_2026-11-23.sql and database/brigade/01-08.

-- 1. customer_pos can hold a Brigade PO: no company, maybe no date, number unique among Brigade POs.
ALTER TABLE customer_pos MODIFY COLUMN company_id VARCHAR(20) NULL;
ALTER TABLE customer_pos MODIFY COLUMN po_date DATE NULL;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_pos' AND COLUMN_NAME = 'brigade_po_key');
SET @sql := IF(@has = 0,
  'ALTER TABLE customer_pos
     ADD COLUMN brigade_po_key VARCHAR(100) GENERATED ALWAYS AS (IF(source = ''BRIGADE'', LOWER(TRIM(po_number)), NULL)) STORED,
     ADD UNIQUE KEY uq_cpo_brigade_number (brigade_po_key)',
  'SELECT ''customer_pos.brigade_po_key already exists'' AS info');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 2. Brigade POs, same ids.
INSERT INTO customer_pos (id, source, company_id, contract_id, po_number, po_date, po_amount, po_kind, po_source, status,
                          created_by, updated_by, created_at, updated_at)
SELECT bp.id, 'BRIGADE', NULL, NULL, TRIM(bp.po_number), bp.po_date, bp.po_amount, 'STANDARD', bp.po_source, 'ACTIVE',
       bp.created_by_user_id, bp.updated_by_user_id, bp.created_at, bp.updated_at
  FROM brigade_pos bp
 WHERE NOT EXISTS (SELECT 1 FROM customer_pos cp WHERE cp.id = bp.id)
   AND NOT EXISTS (SELECT 1 FROM customer_pos cp WHERE cp.source = 'BRIGADE' AND LOWER(TRIM(cp.po_number)) = LOWER(TRIM(bp.po_number)));

-- A PO number that only has files (typed on a booking, never saved as a PO): a PO for it, so the files have one.
INSERT INTO customer_pos (id, source, company_id, contract_id, po_number, po_kind, status, created_at)
SELECT UUID(), 'BRIGADE', NULL, NULL, f.po_number, 'STANDARD', 'ACTIVE', f.created_at
  FROM (SELECT TRIM(po_number) AS po_number, MIN(created_at) AS created_at FROM brigade_po_files GROUP BY LOWER(TRIM(po_number)), TRIM(po_number)) f
 WHERE NOT EXISTS (SELECT 1 FROM customer_pos cp WHERE cp.source = 'BRIGADE' AND LOWER(TRIM(cp.po_number)) = LOWER(f.po_number));

-- 3. Brigade PO files, same ids.
INSERT INTO customer_po_files (id, po_id, object_key, file_name, file_type, file_size, uploaded_by, created_at)
SELECT bf.id, cp.id, bf.object_key, bf.file_name, bf.file_type, bf.file_size, bf.uploaded_by_user_id, bf.created_at
  FROM brigade_po_files bf
  JOIN customer_pos cp ON cp.source = 'BRIGADE' AND LOWER(TRIM(cp.po_number)) = LOWER(TRIM(bf.po_number))
 WHERE NOT EXISTS (SELECT 1 FROM customer_po_files x WHERE x.id = bf.id);

-- 4. brigade_po_lines -> customer_pos (the ids were kept, so every line still finds its PO).
SET @has := (SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS
              WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_brigade_po_line_po' AND REFERENCED_TABLE_NAME = 'brigade_pos');
SET @sql := IF(@has > 0, 'ALTER TABLE brigade_po_lines DROP FOREIGN KEY fk_brigade_po_line_po', 'SELECT ''fk_brigade_po_line_po already moved'' AS info');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @has := (SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS
              WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_brigade_po_line_cpo');
SET @sql := IF(@has = 0,
  'ALTER TABLE brigade_po_lines ADD CONSTRAINT fk_brigade_po_line_cpo FOREIGN KEY (po_id) REFERENCES customer_pos (id) ON DELETE CASCADE',
  'SELECT ''fk_brigade_po_line_cpo already exists'' AS info');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 5. Brigade invoices already issued, same ids and numbers (booked under the property of their first service).
INSERT INTO billing_invoices
  (id, source, is_manual, bill_kind, contract_id, company_id, site_id, billing_type, customer_category, tax_mode, gst_rate,
   place_of_supply, invoice_date, due_date, invoice_number, fy, seq, subtotal, cgst, sgst, igst, round_off, total,
   print_copies, description, status, content, issued_by, issued_at, created_by, created_at)
SELECT i.id, 'BRIGADE', 0, '', NULL,
       (SELECT bd.company_id FROM brigade_invoice_lines l JOIN jobs j ON j.id = l.job_id
          JOIN brigade_booking_details bd ON bd.booking_id = j.booking_id WHERE l.invoice_id = i.id ORDER BY l.id LIMIT 1),
       NULL, NULL, 'COMMERCIAL', 'CGST_SGST', 18, '29-Karnataka', i.invoice_date, i.invoice_date, i.invoice_number, i.fy, i.seq,
       i.subtotal, i.cgst, i.sgst, 0, 0, i.total, 1,
       LEFT(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(i.content, '$.description')), CONCAT('Brigade invoice on PO ', i.po_number)), 1000),
       'ISSUED', i.content, i.created_by_user_id, i.created_at, i.created_by_user_id, i.created_at
  FROM brigade_invoices i
 WHERE NOT EXISTS (SELECT 1 FROM billing_invoices x WHERE x.id = i.id)
   AND EXISTS (SELECT 1 FROM brigade_invoice_lines l WHERE l.invoice_id = i.id);

INSERT INTO billing_invoice_lines (id, invoice_id, job_id, item_name, sac_code, unit, pricing_basis, rate, quantity, amount, sort_order)
SELECT l.id, l.invoice_id, l.job_id, COALESCE(j.sub_service, 'Service'), '998533', 'Service', 'FIXED', l.amount, 1, l.amount, 0
  FROM brigade_invoice_lines l
  JOIN billing_invoices bi ON bi.id = l.invoice_id AND bi.source = 'BRIGADE'
  LEFT JOIN jobs j ON j.id = l.job_id
 WHERE NOT EXISTS (SELECT 1 FROM billing_invoice_lines x WHERE x.id = l.id);

INSERT IGNORE INTO billing_invoice_pos (invoice_id, po_id)
SELECT i.id, cp.id
  FROM brigade_invoices i
  JOIN billing_invoices bi ON bi.id = i.id AND bi.source = 'BRIGADE'
  JOIN customer_pos cp ON cp.source = 'BRIGADE' AND LOWER(TRIM(cp.po_number)) = LOWER(TRIM(i.po_number));

-- Rollback (only before new Brigade invoices exist): the old tables are untouched; point brigade_po_lines back with
--   ALTER TABLE brigade_po_lines DROP FOREIGN KEY fk_brigade_po_line_cpo,
--     ADD CONSTRAINT fk_brigade_po_line_po FOREIGN KEY (po_id) REFERENCES brigade_pos (id) ON DELETE CASCADE;

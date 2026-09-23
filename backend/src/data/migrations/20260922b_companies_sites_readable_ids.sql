-- Converts companies.id and sites.id from opaque CHAR(36) UUIDs to short,
-- readable text ids: COMP1, COMP2... and SITE1, SITE2... Every table that
-- references these ids is remapped in lock-step so no relationship (invoices,
-- payments, TDS, sites, contacts, jobs, bookings, invoice import rows) is lost.
-- customer_no / site_no (added in 20260922_add_customer_site_sequence_numbers.sql)
-- are dropped, since the id itself now carries that number.
--
-- Run once against ps_ops. A full mysqldump backup should be taken first.

SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- 1. New readable ids on the two parent tables, derived from the
--    existing customer_no / site_no sequence columns.
-- ---------------------------------------------------------------------
ALTER TABLE companies ADD COLUMN id_new VARCHAR(20) NULL AFTER id;
UPDATE companies SET id_new = CONCAT('COMP', customer_no);
ALTER TABLE companies MODIFY id_new VARCHAR(20) NOT NULL;

ALTER TABLE sites ADD COLUMN id_new VARCHAR(20) NULL AFTER id;
UPDATE sites SET id_new = CONCAT('SITE', site_no);
ALTER TABLE sites MODIFY id_new VARCHAR(20) NOT NULL;

-- ---------------------------------------------------------------------
-- 2. New FK-shaped columns on every table that references companies.id
--    or sites.id, populated by joining on the old UUID.
-- ---------------------------------------------------------------------
ALTER TABLE sites ADD COLUMN company_id_new VARCHAR(20) NULL AFTER company_id;
UPDATE sites s JOIN companies c ON s.company_id = c.id SET s.company_id_new = c.id_new;

ALTER TABLE invoices ADD COLUMN customer_id_new VARCHAR(20) NULL AFTER customer_id;
UPDATE invoices i JOIN companies c ON i.customer_id = c.id SET i.customer_id_new = c.id_new;

ALTER TABLE invoices ADD COLUMN site_id_new VARCHAR(20) NULL AFTER site_id;
UPDATE invoices i JOIN sites s ON i.site_id = s.id SET i.site_id_new = s.id_new;

ALTER TABLE payments ADD COLUMN customer_id_new VARCHAR(20) NULL AFTER customer_id;
UPDATE payments p JOIN companies c ON p.customer_id = c.id SET p.customer_id_new = c.id_new;

ALTER TABLE tds_transactions ADD COLUMN customer_id_new VARCHAR(20) NULL AFTER customer_id;
UPDATE tds_transactions t JOIN companies c ON t.customer_id = c.id SET t.customer_id_new = c.id_new;

ALTER TABLE invoice_import_rows ADD COLUMN matched_customer_id_new VARCHAR(20) NULL AFTER matched_customer_id;
UPDATE invoice_import_rows r JOIN companies c ON r.matched_customer_id = c.id SET r.matched_customer_id_new = c.id_new;

ALTER TABLE invoice_import_rows ADD COLUMN matched_site_id_new VARCHAR(20) NULL AFTER matched_site_id;
UPDATE invoice_import_rows r JOIN sites s ON r.matched_site_id = s.id SET r.matched_site_id_new = s.id_new;

ALTER TABLE contacts ADD COLUMN company_id_new VARCHAR(20) NULL AFTER company_id;
UPDATE contacts ct JOIN sites s ON ct.company_id = s.id SET ct.company_id_new = s.id_new;

ALTER TABLE jobs ADD COLUMN company_id_new VARCHAR(20) NULL AFTER company_id;
UPDATE jobs j JOIN sites s ON j.company_id = s.id SET j.company_id_new = s.id_new;

ALTER TABLE bookings ADD COLUMN company_id_new VARCHAR(20) NULL AFTER company_id;
UPDATE bookings b JOIN sites s ON b.company_id = s.id SET b.company_id_new = s.id_new;

-- ---------------------------------------------------------------------
-- 3. Drop the FK constraints that point at the old UUID columns.
-- ---------------------------------------------------------------------
ALTER TABLE invoices DROP FOREIGN KEY fk_invoices_customer;
ALTER TABLE invoices DROP FOREIGN KEY fk_invoices_site;
ALTER TABLE payments DROP FOREIGN KEY fk_payments_customer;
ALTER TABLE tds_transactions DROP FOREIGN KEY fk_tds_tx_customer;
ALTER TABLE invoice_import_rows DROP FOREIGN KEY fk_import_rows_customer;
ALTER TABLE invoice_import_rows DROP FOREIGN KEY fk_import_rows_site;
ALTER TABLE contacts DROP FOREIGN KEY fk_contacts_company;
ALTER TABLE jobs DROP FOREIGN KEY fk_jobs_company;

-- ---------------------------------------------------------------------
-- 4. Swap companies.id and sites.id to the new readable value.
-- ---------------------------------------------------------------------
ALTER TABLE companies DROP PRIMARY KEY, DROP COLUMN id;
ALTER TABLE companies CHANGE COLUMN id_new id VARCHAR(20) NOT NULL;
ALTER TABLE companies ADD PRIMARY KEY (id);
ALTER TABLE companies DROP COLUMN customer_no;

ALTER TABLE sites DROP PRIMARY KEY, DROP COLUMN id;
ALTER TABLE sites CHANGE COLUMN id_new id VARCHAR(20) NOT NULL;
ALTER TABLE sites ADD PRIMARY KEY (id);
ALTER TABLE sites DROP COLUMN site_no;

-- ---------------------------------------------------------------------
-- 5. Swap every child's FK column to the new value and drop the old one.
-- ---------------------------------------------------------------------
ALTER TABLE sites DROP COLUMN company_id;
ALTER TABLE sites CHANGE COLUMN company_id_new company_id VARCHAR(20) NULL;

ALTER TABLE invoices DROP COLUMN customer_id, DROP COLUMN site_id;
ALTER TABLE invoices CHANGE COLUMN customer_id_new customer_id VARCHAR(20) NOT NULL;
ALTER TABLE invoices CHANGE COLUMN site_id_new site_id VARCHAR(20) NULL;

ALTER TABLE payments DROP COLUMN customer_id;
ALTER TABLE payments CHANGE COLUMN customer_id_new customer_id VARCHAR(20) NOT NULL;

ALTER TABLE tds_transactions DROP COLUMN customer_id;
ALTER TABLE tds_transactions CHANGE COLUMN customer_id_new customer_id VARCHAR(20) NOT NULL;

ALTER TABLE invoice_import_rows DROP COLUMN matched_customer_id, DROP COLUMN matched_site_id;
ALTER TABLE invoice_import_rows CHANGE COLUMN matched_customer_id_new matched_customer_id VARCHAR(20) NULL;
ALTER TABLE invoice_import_rows CHANGE COLUMN matched_site_id_new matched_site_id VARCHAR(20) NULL;

ALTER TABLE contacts DROP COLUMN company_id;
ALTER TABLE contacts CHANGE COLUMN company_id_new company_id VARCHAR(20) NULL;

ALTER TABLE jobs DROP COLUMN company_id;
ALTER TABLE jobs CHANGE COLUMN company_id_new company_id VARCHAR(20) NULL;

ALTER TABLE bookings DROP COLUMN company_id;
ALTER TABLE bookings CHANGE COLUMN company_id_new company_id VARCHAR(20) NULL;

-- ---------------------------------------------------------------------
-- 6. Recreate every index that was dropped along with its column, plus
--    the foreign keys (now pointing at the new VARCHAR(20) ids). Two
--    extra FKs (sites->companies, bookings->sites) are added because the
--    columns exist but were never actually constrained before; adding
--    them only strengthens integrity, nothing else changes.
-- ---------------------------------------------------------------------
CREATE INDEX idx_sites_company_id ON sites (company_id);
ALTER TABLE sites ADD UNIQUE KEY uniq_sites_company_name (company_id, name);
ALTER TABLE sites ADD CONSTRAINT fk_sites_company FOREIGN KEY (company_id) REFERENCES companies (id);

CREATE INDEX idx_invoices_customer ON invoices (customer_id);
CREATE INDEX idx_invoices_site ON invoices (site_id);
ALTER TABLE invoices ADD UNIQUE KEY uniq_invoices_customer_number (customer_id, invoice_number);
ALTER TABLE invoices ADD CONSTRAINT fk_invoices_customer FOREIGN KEY (customer_id) REFERENCES companies (id);
ALTER TABLE invoices ADD CONSTRAINT fk_invoices_site FOREIGN KEY (site_id) REFERENCES sites (id);

CREATE INDEX idx_payments_customer ON payments (customer_id);
ALTER TABLE payments ADD CONSTRAINT fk_payments_customer FOREIGN KEY (customer_id) REFERENCES companies (id);

CREATE INDEX idx_tds_tx_customer ON tds_transactions (customer_id);
ALTER TABLE tds_transactions ADD CONSTRAINT fk_tds_tx_customer FOREIGN KEY (customer_id) REFERENCES companies (id);

CREATE INDEX fk_import_rows_customer ON invoice_import_rows (matched_customer_id);
CREATE INDEX fk_import_rows_site ON invoice_import_rows (matched_site_id);
ALTER TABLE invoice_import_rows ADD CONSTRAINT fk_import_rows_customer FOREIGN KEY (matched_customer_id) REFERENCES companies (id);
ALTER TABLE invoice_import_rows ADD CONSTRAINT fk_import_rows_site FOREIGN KEY (matched_site_id) REFERENCES sites (id);

CREATE INDEX idx_contacts_company ON contacts (company_id);
ALTER TABLE contacts ADD UNIQUE KEY unique_contact (phone, company_id);
ALTER TABLE contacts ADD CONSTRAINT fk_contacts_company FOREIGN KEY (company_id) REFERENCES sites (id);

CREATE INDEX fk_jobs_company ON jobs (company_id);
ALTER TABLE jobs ADD CONSTRAINT fk_jobs_company FOREIGN KEY (company_id) REFERENCES sites (id);

ALTER TABLE bookings ADD CONSTRAINT fk_bookings_company FOREIGN KEY (company_id) REFERENCES sites (id);

SET FOREIGN_KEY_CHECKS = 1;

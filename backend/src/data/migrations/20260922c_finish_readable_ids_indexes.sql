-- Continuation of 20260922b: the data swap on companies/sites/invoices/
-- payments/tds_transactions/invoice_import_rows/contacts/jobs/bookings
-- already completed successfully. This finishes recreating the indexes
-- and foreign keys, including three composite unique keys that MySQL
-- silently shrank to a single column when one of their columns was
-- dropped (sites, invoices, contacts) -- fixed back to their correct,
-- per-customer scope here.

SET FOREIGN_KEY_CHECKS = 0;

-- sites: fix the shrunk unique key back to (company_id, name), add the
-- missing FK to companies (never formally constrained before).
ALTER TABLE sites DROP INDEX uniq_sites_company_name;
ALTER TABLE sites ADD UNIQUE KEY uniq_sites_company_name (company_id, name);
ALTER TABLE sites ADD CONSTRAINT fk_sites_company FOREIGN KEY (company_id) REFERENCES companies (id);

-- invoices: fix the shrunk unique key back to (customer_id, invoice_number).
ALTER TABLE invoices DROP INDEX uniq_invoices_customer_number;
ALTER TABLE invoices ADD UNIQUE KEY uniq_invoices_customer_number (customer_id, invoice_number);
CREATE INDEX idx_invoices_customer ON invoices (customer_id);
CREATE INDEX idx_invoices_site ON invoices (site_id);
ALTER TABLE invoices ADD CONSTRAINT fk_invoices_customer FOREIGN KEY (customer_id) REFERENCES companies (id);
ALTER TABLE invoices ADD CONSTRAINT fk_invoices_site FOREIGN KEY (site_id) REFERENCES sites (id);

-- payments
CREATE INDEX idx_payments_customer ON payments (customer_id);
ALTER TABLE payments ADD CONSTRAINT fk_payments_customer FOREIGN KEY (customer_id) REFERENCES companies (id);

-- tds_transactions
CREATE INDEX idx_tds_tx_customer ON tds_transactions (customer_id);
ALTER TABLE tds_transactions ADD CONSTRAINT fk_tds_tx_customer FOREIGN KEY (customer_id) REFERENCES companies (id);

-- invoice_import_rows
CREATE INDEX fk_import_rows_customer ON invoice_import_rows (matched_customer_id);
CREATE INDEX fk_import_rows_site ON invoice_import_rows (matched_site_id);
ALTER TABLE invoice_import_rows ADD CONSTRAINT fk_import_rows_customer FOREIGN KEY (matched_customer_id) REFERENCES companies (id);
ALTER TABLE invoice_import_rows ADD CONSTRAINT fk_import_rows_site FOREIGN KEY (matched_site_id) REFERENCES sites (id);

-- contacts: fix the shrunk unique key back to (phone, company_id).
ALTER TABLE contacts DROP INDEX unique_contact;
ALTER TABLE contacts ADD UNIQUE KEY unique_contact (phone, company_id);
CREATE INDEX idx_contacts_company ON contacts (company_id);
ALTER TABLE contacts ADD CONSTRAINT fk_contacts_company FOREIGN KEY (company_id) REFERENCES sites (id);

-- jobs
CREATE INDEX fk_jobs_company ON jobs (company_id);
ALTER TABLE jobs ADD CONSTRAINT fk_jobs_company FOREIGN KEY (company_id) REFERENCES sites (id);

-- bookings (adds the FK that was never formally there before)
ALTER TABLE bookings ADD CONSTRAINT fk_bookings_company FOREIGN KEY (company_id) REFERENCES sites (id);

SET FOREIGN_KEY_CHECKS = 1;

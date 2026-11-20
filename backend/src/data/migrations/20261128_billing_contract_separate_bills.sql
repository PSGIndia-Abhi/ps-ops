-- Invoice generation: one contract per customer, with pest control and chemicals on separate bills.
--
-- A customer has only ONE contract (any type). When it bills both services and chemicals, the
-- contract can say "separate bills": every period the Bill Run then makes TWO invoices from it -
-- the service lines with description_template, the chemical lines with chemical_description_template
-- (same PO on both). Otherwise one invoice carries everything, as before.
--
--   billing_contracts.separate_bills                 1 = services and chemicals invoiced separately
--   billing_contracts.chemical_description_template  description on the chemical invoice
--
-- Additive: existing contracts get separate_bills = 0 and keep billing exactly as before.
-- Safe to re-run (each column is added only if missing). Run after 20261127_billing_sos_termite_area.sql.

SET @has := (SELECT COUNT(*) FROM information_schema.columns
              WHERE table_schema = DATABASE() AND table_name = 'billing_contracts' AND column_name = 'separate_bills');
SET @sql := IF(@has = 0,
  'ALTER TABLE billing_contracts ADD COLUMN separate_bills TINYINT(1) NOT NULL DEFAULT 0 AFTER description_template',
  'SELECT ''separate_bills already exists''');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @has := (SELECT COUNT(*) FROM information_schema.columns
              WHERE table_schema = DATABASE() AND table_name = 'billing_contracts' AND column_name = 'chemical_description_template');
SET @sql := IF(@has = 0,
  'ALTER TABLE billing_contracts ADD COLUMN chemical_description_template VARCHAR(500) NULL AFTER separate_bills',
  'SELECT ''chemical_description_template already exists''');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

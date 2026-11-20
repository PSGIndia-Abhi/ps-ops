-- TDS basis: what a customer's TDS is worked out on.
--
--   INVOICE  - "Invoice TDS": the full invoice amount (GST included). This is how TDS has
--              always been calculated, so every existing customer and invoice gets it.
--   TAXABLE  - "Taxable TDS": the taxable value (the amount before GST).
--
-- The taxable value comes from the optional "Taxable Value" column of the invoice import file
-- (invoices.taxable_amount). When it is blank (NULL) it is worked out as amount / 1.18
-- (18% GST; DEFAULT_GST_RATE in services/Tds.service.js).
--
-- Run this once. Only columns are added; existing values keep today's behaviour.

ALTER TABLE companies
  ADD COLUMN tds_basis ENUM('INVOICE','TAXABLE') NOT NULL DEFAULT 'INVOICE' AFTER tds_rate;

ALTER TABLE invoices
  ADD COLUMN taxable_amount DECIMAL(15,2) NULL AFTER invoice_amount;

-- The basis is copied onto each invoice's TDS snapshot with the rate, so changing the
-- customer's basis later never changes old invoices (unless "apply to existing" is used).
ALTER TABLE invoice_tds
  ADD COLUMN tds_basis ENUM('INVOICE','TAXABLE') NOT NULL DEFAULT 'INVOICE' AFTER tds_rate;

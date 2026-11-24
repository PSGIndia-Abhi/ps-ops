-- Invoice generation: rate per service with 4 decimals.
--
-- New contract › Services: a month amount can be typed; it is divided by the services per month into
-- the rate per service. 18,500 a month for 12 services is 1,541.6667 per service; with 2 decimals
-- (1,541.67) the month came to 18,500.04. With 4 decimals: 1,541.6667 x 12 = 18,500.00.
--
--   billing_contract_lines.rate  DECIMAL(12,2) -> DECIMAL(14,4)
--   billing_invoice_lines.rate   DECIMAL(12,2) -> DECIMAL(14,4)   (copied from the contract line)
--
-- Only the rate gets more decimals. Amounts, GST and totals stay at 2 decimals (rupees and paise);
-- screens and invoices show the rate with 2 decimals. Existing rates keep their value (e.g. 896.00
-- becomes 896.0000). NOT NULL and the "rate >= 0" rule are kept.
-- Run once. Safe to re-run. In phpMyAdmin, select the ps_ops database in the left panel first (or
-- keep the USE line).

USE ps_ops;

ALTER TABLE billing_contract_lines MODIFY COLUMN rate DECIMAL(14,4) NOT NULL;
ALTER TABLE billing_invoice_lines  MODIFY COLUMN rate DECIMAL(14,4) NOT NULL;

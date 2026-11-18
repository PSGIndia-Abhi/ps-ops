-- Invoice generation: the GST rate is set per contract (5, 12, 18 or 28 %) instead of a fixed 18 %.
--
--   billing_contracts.gst_rate  the rate the contract bills at when GST applies (gst_applicable = 1)
--   billing_invoices.gst_rate   copied from the contract when the draft is made, so changing the
--                               contract later never changes drafts already made or issued invoices
-- In Karnataka it is split in half (CGST + SGST, e.g. 9 % + 9 %); elsewhere it is all IGST.
-- Existing contracts and invoices get 18, which is what they were billed at.
--
-- Run once (after 20261117_billing_contract_gst.sql).

ALTER TABLE billing_contracts
  ADD COLUMN gst_rate DECIMAL(5,2) NOT NULL DEFAULT 18.00 AFTER gst_applicable;

ALTER TABLE billing_invoices
  ADD COLUMN gst_rate DECIMAL(5,2) NOT NULL DEFAULT 18.00 AFTER tax_mode;

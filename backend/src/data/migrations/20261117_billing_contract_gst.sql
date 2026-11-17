-- Invoice generation: GST can be switched off per contract (e.g. a Commercial customer billed
-- without GST for a while). Default 1 = GST applies, so existing contracts are unchanged.
-- Residential customers are never charged GST, whatever this says.

ALTER TABLE billing_contracts
  ADD COLUMN gst_applicable TINYINT(1) NOT NULL DEFAULT 1 AFTER po_required;

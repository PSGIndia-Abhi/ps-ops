-- Invoice generation: description wordings for services, chemicals and termite.
--
-- "Chemical" is no longer a billing type on New Contract: an AMC / One-time / Termite contract
-- bills Service, Chemical or both ("What is billed"), and the description is suggested from that.
-- Services and chemicals each have their own wording (never one combined line):
--   Service    Towards charges for the Pest control service carried out for the month of {month}
--   Chemical   Towards charges for the chemical charges for the month of {month}
--   Termite    Termite Treatment
-- Both ticked + "separate bills": two contracts, one per wording, sharing the same PO.
-- (One-time uses {period}; every 2+ months uses {from_month} to {to_month}.)
--
-- Adds these wordings to Masters > Invoice Descriptions so they show in the dropdown.
-- Data only: nothing existing is changed. Safe to re-run (text is unique -> INSERT IGNORE).
-- Run after 20261118b_billing_invoice_descriptions.sql.

INSERT IGNORE INTO billing_invoice_descriptions (id, text, sort_order) VALUES
  (UUID(), 'Towards charges for the Pest control service carried out for the month of {month}', 4),
  (UUID(), 'Towards charges for the chemical charges for the month of {month}', 5),
  (UUID(), 'Towards charges for the Pest control service carried out for {from_month} to {to_month}', 7),
  (UUID(), 'Towards charges for the chemical charges for {from_month} to {to_month}', 8),
  (UUID(), 'Towards charges for the chemical charges for {period}', 10),
  (UUID(), 'Termite Treatment', 12);

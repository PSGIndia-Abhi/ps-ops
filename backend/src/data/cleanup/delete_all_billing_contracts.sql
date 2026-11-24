-- =====================================================================
-- DEV / LOCAL CLEAN-UP ONLY - never run on production.
-- Deletes EVERY billing contract and everything made from it:
--   contracts, their service lines and group-company links,
--   their SOS lines (and an SOS left with no lines),
--   the bills made from them (lines, PO links, shares, Billing payments, advance adjustments),
--   the Accountant Panel invoices those bills created (with their TDS snapshot),
--   and the payment allocations / TDS recorded on those invoices
--   (a payment is deleted only when it paid nothing else and is not a PO advance).
--
-- KEPT: Billing Frequencies master, customers, outlets, services, POs (only unlinked from the
-- contract), PO advances, Brigade PO bills that have no contract, imported (Vyapar) invoices,
-- and the invoice number counter (new bills carry on from the last number used).
--
-- How to run (phpMyAdmin or mysql, on the DEV database - check the host first):
--   1. Run PART 1 alone and look at the counts.
--   2. Run PART 2. It ends in ROLLBACK, so nothing is saved yet - check the counts it prints.
--   3. When happy, change the last line of PART 2 from ROLLBACK to COMMIT and run PART 2 again.
-- =====================================================================

-- ---------------------------------------------------------------- PART 1: preview
SELECT DATABASE() AS db, @@hostname AS host;
SELECT
  (SELECT COUNT(*) FROM billing_contracts)                                                  AS contracts,
  (SELECT COUNT(*) FROM billing_contract_lines)                                             AS contract_lines,
  (SELECT COUNT(*) FROM billing_sos_lines WHERE contract_id IS NOT NULL OR contract_line_id IS NOT NULL) AS sos_lines,
  (SELECT COUNT(*) FROM billing_invoices WHERE contract_id IS NOT NULL)                     AS bills,
  (SELECT COUNT(*) FROM billing_invoices WHERE contract_id IS NOT NULL AND receivable_invoice_id IS NOT NULL) AS accountant_invoices,
  (SELECT COUNT(*) FROM payment_allocations pa
     JOIN billing_invoices b ON b.receivable_invoice_id = pa.invoice_id
    WHERE b.contract_id IS NOT NULL)                                                        AS payment_allocations,
  (SELECT COUNT(*) FROM billing_frequencies)                                                AS frequencies_kept;

-- ---------------------------------------------------------------- PART 2: delete
START TRANSACTION;

DROP TEMPORARY TABLE IF EXISTS tmp_contracts, tmp_lines, tmp_bills, tmp_recv, tmp_alloc, tmp_pay;

CREATE TEMPORARY TABLE tmp_contracts (id CHAR(36) PRIMARY KEY)
  SELECT id FROM billing_contracts;
CREATE TEMPORARY TABLE tmp_lines (id CHAR(36) PRIMARY KEY)
  SELECT id FROM billing_contract_lines WHERE contract_id IN (SELECT id FROM tmp_contracts);
CREATE TEMPORARY TABLE tmp_bills (id CHAR(36) PRIMARY KEY)
  SELECT id FROM billing_invoices WHERE contract_id IN (SELECT id FROM tmp_contracts);
CREATE TEMPORARY TABLE tmp_recv (id CHAR(36) PRIMARY KEY)
  SELECT DISTINCT receivable_invoice_id AS id FROM billing_invoices
   WHERE id IN (SELECT id FROM tmp_bills) AND receivable_invoice_id IS NOT NULL;
CREATE TEMPORARY TABLE tmp_alloc (id CHAR(36) PRIMARY KEY)
  SELECT id FROM payment_allocations WHERE invoice_id IN (SELECT id FROM tmp_recv);
CREATE TEMPORARY TABLE tmp_pay (id CHAR(36) PRIMARY KEY)
  SELECT DISTINCT payment_id AS id FROM payment_allocations WHERE id IN (SELECT id FROM tmp_alloc);

-- Bills and what hangs off them
DELETE FROM billing_invoice_payments    WHERE billing_invoice_id IN (SELECT id FROM tmp_bills);
DELETE FROM billing_advance_adjustments WHERE invoice_id         IN (SELECT id FROM tmp_bills);
DELETE FROM billing_invoice_shares      WHERE billing_invoice_id IN (SELECT id FROM tmp_bills);
DELETE FROM billing_invoice_lines       WHERE invoice_id         IN (SELECT id FROM tmp_bills);
DELETE FROM billing_invoice_pos         WHERE invoice_id         IN (SELECT id FROM tmp_bills);
DELETE FROM billing_invoices            WHERE id                 IN (SELECT id FROM tmp_bills);

-- Payments / TDS on the Accountant Panel invoices those bills created
DELETE FROM tds_transactions    WHERE payment_allocation_id IN (SELECT id FROM tmp_alloc) OR invoice_id IN (SELECT id FROM tmp_recv);
DELETE FROM payment_allocations WHERE id IN (SELECT id FROM tmp_alloc);
-- a payment goes only when nothing else is left on it and it is not a PO advance
DELETE FROM payments
 WHERE id IN (SELECT id FROM tmp_pay)
   AND id NOT IN (SELECT payment_id FROM payment_allocations)
   AND id NOT IN (SELECT payment_id FROM customer_po_advances WHERE payment_id IS NOT NULL)
   AND id NOT IN (SELECT payment_id FROM billing_advance_adjustments WHERE payment_id IS NOT NULL);

-- The Accountant Panel invoices themselves (invoice_tds goes with them)
UPDATE invoice_import_rows SET created_invoice_id = NULL WHERE created_invoice_id IN (SELECT id FROM tmp_recv);
DELETE FROM invoice_tds WHERE invoice_id IN (SELECT id FROM tmp_recv);
DELETE FROM invoices    WHERE id         IN (SELECT id FROM tmp_recv);

-- SOS: lines of these contracts, then any SOS left empty
DROP TEMPORARY TABLE IF EXISTS tmp_sos;
CREATE TEMPORARY TABLE tmp_sos (id CHAR(36) PRIMARY KEY)
  SELECT DISTINCT sos_id AS id FROM billing_sos_lines
   WHERE contract_id IN (SELECT id FROM tmp_contracts) OR contract_line_id IN (SELECT id FROM tmp_lines);
DELETE FROM billing_sos_lines
 WHERE contract_id IN (SELECT id FROM tmp_contracts) OR contract_line_id IN (SELECT id FROM tmp_lines);
-- only an SOS that held these contracts' lines and now has none (other SOS are untouched)
DELETE FROM billing_sos
 WHERE id IN (SELECT id FROM tmp_sos)
   AND id NOT IN (SELECT sos_id FROM billing_sos_lines);

-- POs stay; they are only unlinked from the contract
UPDATE customer_pos SET contract_id = NULL WHERE contract_id IN (SELECT id FROM tmp_contracts);

-- Contracts
DELETE FROM billing_contract_lines     WHERE id          IN (SELECT id FROM tmp_lines);
DELETE FROM billing_contract_companies WHERE contract_id IN (SELECT id FROM tmp_contracts);
DELETE FROM billing_contracts          WHERE id          IN (SELECT id FROM tmp_contracts);

-- Check: all should be 0, frequencies unchanged
SELECT
  (SELECT COUNT(*) FROM billing_contracts)                          AS contracts_left,
  (SELECT COUNT(*) FROM billing_contract_lines)                     AS lines_left,
  (SELECT COUNT(*) FROM billing_invoices WHERE contract_id IS NOT NULL) AS bills_left,
  (SELECT COUNT(*) FROM invoices WHERE id IN (SELECT id FROM tmp_recv)) AS accountant_invoices_left,
  (SELECT COUNT(*) FROM billing_frequencies)                        AS frequencies_kept;

ROLLBACK;   -- change to COMMIT when the counts above look right

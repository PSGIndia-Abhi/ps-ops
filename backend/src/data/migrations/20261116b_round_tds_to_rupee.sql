-- TDS is now kept in whole rupees, rounded to the nearest rupee (services/Tds.service.js roundRupee).
--
-- Rounds the TDS already saved on invoices that have no TDS deducted yet (271.40 -> 271,
-- 9976.92 -> 9977). Invoices where some TDS was already deducted keep the exact amounts they
-- were settled with: rounding those would leave a few paise pending, or more deducted than due.
--
-- Safe to re-run: only rows that still have paise are touched.

UPDATE invoice_tds
   SET expected_tds = ROUND(expected_tds, 0),
       pending_tds  = ROUND(expected_tds, 0)
 WHERE tds_applicable = 1
   AND deducted_tds = 0
   AND expected_tds <> ROUND(expected_tds, 0);

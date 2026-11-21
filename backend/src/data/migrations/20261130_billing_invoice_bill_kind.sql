-- Invoice generation: separate bills (pest control + chemicals) for the same period.
--
-- A contract with "separate bills" makes TWO invoices every period from one contract: one with the
-- service lines and one with the chemical lines. period_key allowed only one regular invoice per
-- contract + outlet + period, so the second invoice failed ("Already drafted for this period") and the
-- Bill Run made no draft for that contract.
--
--   billing_invoices.bill_kind   '' = the whole contract on one invoice (every invoice so far)
--                                'SERVICE' / 'CHEMICAL' = that half of a "separate bills" contract
--
-- period_key now also carries bill_kind when it is set, so the two halves of a period no longer
-- clash, while the same bill can still not be made twice for a period.
--
-- Additive: every existing invoice gets bill_kind = '' and its period_key stays exactly the same.
-- Safe to re-run. Run after 20261129_billing_manual_invoices.sql.
-- In phpMyAdmin, select the ps_ops database in the left panel first.

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_invoices' AND COLUMN_NAME = 'bill_kind');
SET @sql := IF(@has = 0,
  'ALTER TABLE billing_invoices ADD COLUMN bill_kind VARCHAR(10) NOT NULL DEFAULT '''' AFTER is_manual',
  'SELECT ''billing_invoices.bill_kind already exists'' AS info');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- Rebuild period_key with bill_kind (a generated column cannot be altered in place).
SET @done := (SELECT COUNT(*) FROM information_schema.COLUMNS
               WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_invoices' AND COLUMN_NAME = 'period_key'
                 AND GENERATION_EXPRESSION LIKE '%bill_kind%');
SET @sql := IF(@done = 0,
  'ALTER TABLE billing_invoices
     DROP INDEX uq_binv_period,
     DROP COLUMN period_key,
     ADD COLUMN period_key VARCHAR(130)
       GENERATED ALWAYS AS (IF(status <> ''CANCELLED'' AND is_manual = 0,
                               CONCAT(contract_id, ''|'', IFNULL(site_id, ''-''), ''|'', period_start,
                                      IF(bill_kind = '''', '''', CONCAT(''|'', bill_kind))), NULL)) STORED AFTER content,
     ADD UNIQUE KEY uq_binv_period (period_key)',
  'SELECT ''period_key already includes bill_kind'' AS info');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

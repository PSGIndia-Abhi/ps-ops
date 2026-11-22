-- Invoice generation: Termite treated area on the monthly SOS.
--
-- A Termite contract fixes only the rate per sq. m / sq. ft. The Service Coordinator enters the area
-- completed on the customer's monthly SOS - one row per billing period that the month bills (each
-- week of a weekly contract, each day of a daily one, the month of a monthly one). The Bill Run then
-- bills each period: that row's area x the rate.
--
--   billing_sos_lines.kind          SERVICE (services counted per service, as before) or AREA (termite)
--   billing_sos_lines.period_start  AREA: the billing period the area is for
--   billing_sos_lines.period_end
--   billing_sos_lines.area          AREA: the treated area completed (NULL = not entered)
--   billing_sos_lines.unit          AREA: sq.m or sq.ft (the contract line's unit)
--
-- New optional columns only: every existing SOS line is SERVICE and unchanged.
-- Run once (after 20261126_billing_termite_frequency_unit.sql). Safe to re-run.
-- In phpMyAdmin, select the ps_ops database in the left panel first (or keep the USE line).

USE ps_ops;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_sos_lines' AND COLUMN_NAME = 'kind');
SET @sql := IF(@has = 0,
  'ALTER TABLE billing_sos_lines
     ADD COLUMN kind         ENUM(''SERVICE'',''AREA'') NOT NULL DEFAULT ''SERVICE'' AFTER sos_id,
     ADD COLUMN period_start DATE          NULL DEFAULT NULL AFTER service,
     ADD COLUMN period_end   DATE          NULL DEFAULT NULL AFTER period_start,
     ADD COLUMN area         DECIMAL(12,2) NULL DEFAULT NULL AFTER completed,
     ADD COLUMN unit         VARCHAR(20)   NULL DEFAULT NULL AFTER area,
     ADD KEY idx_sosl_line_period (contract_line_id, period_start)',
  'SELECT ''billing_sos_lines.kind already exists'' AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

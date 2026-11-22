-- Invoice generation: a service-plan line can cover the WHOLE customer instead of one outlet.
--
-- The Service Plans screen now plans a service (e.g. "General Pest Control (GPC)", 2 per month)
-- for the customer as a whole: the outlet and the service type are no longer chosen.
--   site_id      NULL = every outlet of the customer (jobs at any of them count)
--   service_type NULL = any job type (PEST, BOTH, ...); jobs are matched on sub_service alone
-- Lines saved before this keep their outlet and type and are counted exactly as before.
--
-- Run once (after 20261116_billing_module.sql). Only makes two columns optional; no data changes.

ALTER TABLE billing_service_plan_lines
  MODIFY COLUMN site_id      VARCHAR(20) NULL,
  MODIFY COLUMN service_type VARCHAR(50) NULL;

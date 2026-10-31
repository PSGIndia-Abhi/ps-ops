-- One-time or AMC is now chosen when a lead is converted to a customer (it used to be asked when a
-- quotation was saved, and stays in those quotations' content). NULL = converted before this
-- change; the lead then falls back to its latest quotation's choice.
ALTER TABLE `crm_lead_conversions`
  ADD COLUMN `contract_type` ENUM('ONE_TIME', 'AMC') NULL AFTER `notes`;

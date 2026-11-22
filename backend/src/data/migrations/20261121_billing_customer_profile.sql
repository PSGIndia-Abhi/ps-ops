-- =====================================================================
-- Invoice Generation: the Customer Billing Profile.
--
-- One place per customer for everything billing needs. Most of it already exists
-- (billing_profiles = Bill To / GST state / payment terms, billing_contracts + _lines = services,
-- rate and services per month per outlet, customer_pos = POs). This adds the invoice-delivery
-- settings and the billing deadline:
--
--   billing_profiles.print_copies     copies printed for an invoice made for the whole customer
--   billing_profiles.invoice_emails   where that invoice is emailed when issued (comma separated)
--   billing_profiles.bill_by_day      day of the month by which the previous month's invoice must
--                                     be issued; after it the Accounts Executive is alerted
--   billing_outlet_settings           the same print / email settings for each outlet (an invoice
--                                     made per outlet uses its outlet's row, else the profile's)
--
-- New table and optional columns only: nothing existing changes. Run once, after
-- 20261116_billing_module.sql ... 20261120b_accounts_executive_full_billing.sql.
-- =====================================================================

ALTER TABLE billing_profiles
  ADD COLUMN print_copies   TINYINT       NOT NULL DEFAULT 1 AFTER payment_terms_days,
  ADD COLUMN invoice_emails VARCHAR(1000) NULL AFTER print_copies,
  ADD COLUMN bill_by_day    TINYINT       NULL AFTER invoice_emails;

CREATE TABLE IF NOT EXISTS billing_outlet_settings (
  company_id   VARCHAR(20)   NOT NULL,
  site_id      VARCHAR(20)   NOT NULL,
  print_copies TINYINT       NOT NULL DEFAULT 1,     -- 1 to 4
  emails       VARCHAR(1000) NULL,                   -- comma separated; issued invoices are emailed here
  updated_by   BIGINT        NULL,
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME      NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (company_id, site_id),
  CONSTRAINT fk_bos_company FOREIGN KEY (company_id) REFERENCES companies (id),
  CONSTRAINT fk_bos_site    FOREIGN KEY (site_id)    REFERENCES sites (id),
  CONSTRAINT fk_bos_user    FOREIGN KEY (updated_by) REFERENCES users (id),
  CONSTRAINT chk_bos_copies CHECK (print_copies BETWEEN 1 AND 4)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Invoice generation: prints and email for each outlet of a customer';

-- Rollback:
-- DROP TABLE billing_outlet_settings;
-- ALTER TABLE billing_profiles DROP COLUMN bill_by_day, DROP COLUMN invoice_emails, DROP COLUMN print_copies;

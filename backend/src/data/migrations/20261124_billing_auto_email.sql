-- =====================================================================
-- Invoice Generation: automatic invoice email is a choice per customer.
--
--   billing_profiles.auto_email   1 = email each invoice automatically when it is issued (to the
--                                 outlet's emails for a per-outlet invoice, else invoice_emails);
--                                 0 = never email automatically. The emails stay saved as customer
--                                 data and the invoice can still be shared by hand.
--
-- Default 0: no customer is emailed automatically until "Send invoices by email automatically" is
-- ticked on its Customer Billing Profile (Outlets & delivery).
--
-- One optional column only: nothing existing changes. Run once, after
-- 20261121_billing_customer_profile.sql ... 20261123_billing_late_alerts.sql.
-- =====================================================================

ALTER TABLE billing_profiles
  ADD COLUMN auto_email TINYINT(1) NOT NULL DEFAULT 0 AFTER invoice_emails;

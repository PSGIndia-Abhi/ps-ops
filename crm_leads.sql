-- =====================================================================
-- CRM leads (NEW table - additive only, touches no existing table)
-- Target: local MySQL (ps_ops). Safe to re-run (IF NOT EXISTS).
-- Run order: crm_roles_permissions.sql -> crm_test_users.sql
--            -> crm_service_master.sql -> crm_leads.sql
-- Already created crm_leads before Razorpay? Run crm_leads_razorpay.sql instead (adds the 3 new columns).
--
-- Phase 1: capture a lead (customer + service + price + payment) and list it.
-- Service / house type / plan are stored as the text that was chosen (a snapshot),
-- so a later price-list edit never rewrites an old lead. `standard_amount` is
-- the list price at the time; `amount` is what the customer is actually charged
-- (may be negotiated).
-- Follow-up tracking (notes history, next follow-up date) is Phase 2.
-- =====================================================================

CREATE TABLE IF NOT EXISTS crm_leads (
  id                  CHAR(36)      NOT NULL,
  customer_name       VARCHAR(150)  NOT NULL,
  phone               VARCHAR(15)   NOT NULL,
  customer_email      VARCHAR(150)  NULL,
  house_type          VARCHAR(30)   NOT NULL,
  service_name        VARCHAR(100)  NOT NULL,
  plan_type           VARCHAR(50)   NOT NULL,
  standard_amount     DECIMAL(10,2) NULL,
  amount              DECIMAL(10,2) NOT NULL,
  coupon_code         VARCHAR(50)   NULL,
  location            VARCHAR(255)  NULL,
  lead_source         VARCHAR(30)   NULL,        -- website, apartment, referral, social_media, other
  reference_by        VARCHAR(100)  NULL,        -- who referred this lead (free text)
  notes               TEXT          NULL,
  payment_method      VARCHAR(10)   NOT NULL,    -- cash, online, other
  payment_status      VARCHAR(10)   NOT NULL DEFAULT 'pending',  -- paid, pending
  lead_status         VARCHAR(15)   NOT NULL DEFAULT 'new',      -- new, contacted, converted, lost
  razorpay_order_id   VARCHAR(40)   NULL,        -- set when an online payment is started
  razorpay_payment_id VARCHAR(40)   NULL,        -- set when Razorpay's payment is verified
  paid_at             TIMESTAMP     NULL,
  created_by_user_id  BIGINT        NULL,        -- NULL for leads that arrive from the website
  external_ref        VARCHAR(40)   NULL,        -- website booking reference (BS-...), unique
  created_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_crm_leads_created_at (created_at),
  KEY idx_crm_leads_phone (phone),
  KEY idx_crm_leads_payment_status (payment_status),
  KEY idx_crm_leads_created_by (created_by_user_id),
  KEY idx_crm_leads_rzp_order (razorpay_order_id),
  UNIQUE KEY uq_crm_leads_external_ref (external_ref)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='CRM leads (sales & marketing)';

-- Verify
-- SHOW CREATE TABLE crm_leads;

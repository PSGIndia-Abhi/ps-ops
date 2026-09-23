-- =====================================================================
-- Read-only check: which of the CRM migrations has this database already
-- applied? Safe to run anywhere, any number of times - it only SELECTs.
-- Run this on production before deploying the new backend code.
-- =====================================================================

SELECT '1. crm_roles_permissions.sql' AS migration,
  CASE WHEN (
    SELECT COUNT(*) FROM role_permissions rp
    JOIN roles r ON r.id = rp.role_id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE r.name IN ('sales','marketing')
      AND p.name IN ('CRM_ACCESS','CRM_VIEW_SERVICE_PRICE','CRM_CREATE_LEAD','CRM_VIEW_LEAD','CRM_COLLECT_PAYMENT')
  ) >= 10 THEN 'DONE' ELSE 'NOT DONE' END AS status

UNION ALL
SELECT '2. crm_service_master.sql',
  CASE WHEN (
    SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('crm_services','crm_service_prices')
  ) = 2 AND (
    SELECT COUNT(*) FROM crm_service_prices
  ) >= 16 THEN 'DONE' ELSE 'NOT DONE' END

UNION ALL
SELECT '3. crm_service_master_fix_labels.sql',
  CASE
    WHEN (
      SELECT COUNT(*) FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_service_prices'
    ) = 0 THEN 'N/A - run #2 first'
    WHEN (
      SELECT COUNT(*) FROM crm_service_prices
      WHERE BINARY plan_type IN ('ONE TIME','AMC','2 SERVICE','2 SERVICE WITH STEAM')
    ) = 0 THEN 'DONE' ELSE 'NOT DONE'
  END

UNION ALL
SELECT '4. crm_leads.sql',
  CASE WHEN (
    SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_leads'
  ) = 1 THEN 'DONE' ELSE 'NOT DONE' END

UNION ALL
SELECT '5. crm_leads_razorpay.sql',
  CASE WHEN (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_leads' AND COLUMN_NAME = 'razorpay_order_id'
  ) = 1 THEN 'DONE' ELSE 'NOT DONE' END

UNION ALL
SELECT '6. crm_leads_reference_email.sql',
  CASE WHEN (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_leads' AND COLUMN_NAME IN ('customer_email','reference_by')
  ) = 2 THEN 'DONE' ELSE 'NOT DONE' END

UNION ALL
SELECT '7. crm_leads_website.sql',
  CASE WHEN (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_leads' AND COLUMN_NAME = 'external_ref'
  ) = 1 AND (
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_leads' AND INDEX_NAME = 'uq_crm_leads_external_ref'
  ) >= 1 THEN 'DONE' ELSE 'NOT DONE' END;

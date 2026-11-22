-- =====================================================================
-- Accounts Executive does all of Billing (there is no Accounts Head doing it separately):
--   ISSUE_INVOICE   issue drafts (final, numbered)
--   CANCEL_INVOICE  cancel an issued invoice
--   VIEW_INVOICE    see invoices - also lets them use notifications (the bell gave 403 without it)
-- The other billing permissions were given in 20261116_billing_module.sql.
-- Safe to run again (INSERT IGNORE). Run after 20261116 ... 20261120.
-- =====================================================================

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r, permissions p
 WHERE r.name = 'Accounts Executive'
   AND p.name IN ('ISSUE_INVOICE', 'CANCEL_INVOICE', 'VIEW_INVOICE');

-- Check: Accounts Executive should now list all of these
-- VIEW_BILLING, MANAGE_BILLING_MASTERS, GENERATE_INVOICE, ISSUE_INVOICE, CANCEL_INVOICE,
-- SHARE_INVOICE, VIEW_SERVICE_TRACKER, VIEW_INVOICE (+ VIEW_HIERARCHY from before)
SELECT r.name AS role, GROUP_CONCAT(p.name ORDER BY p.name) AS permissions
  FROM roles r
  JOIN role_permissions rp ON rp.role_id = r.id
  JOIN permissions p ON p.id = rp.permission_id
 WHERE r.name = 'Accounts Executive'
 GROUP BY r.name;

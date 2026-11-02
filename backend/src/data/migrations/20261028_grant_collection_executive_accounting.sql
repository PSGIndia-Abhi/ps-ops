-- Collection Executive: the invoice and payment permissions of the Accountant Panel.
--
-- The Collection Executive lands in the Accountant Panel (frontend/src/auth/roleBasePath.js,
-- frontend/src/pages/taskpro/access.js ACCOUNTANT_PANEL_ROLES), but the role was created
-- without its permissions, so every page there failed with "Forbidden: insufficient
-- permissions" (GET /api/invoices needs VIEW_INVOICE, GET /api/payments VIEW_PAYMENT, ...).
-- This gives it the same six as the original "accountant" role.
--
-- Adds rows to role_permissions only. Safe to re-run (INSERT IGNORE on the primary key).

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
WHERE r.name = 'Collection Executive'
  AND p.name IN ('VIEW_INVOICE', 'CREATE_INVOICE', 'UPDATE_INVOICE', 'CANCEL_INVOICE',
                 'VIEW_PAYMENT', 'CREATE_PAYMENT');

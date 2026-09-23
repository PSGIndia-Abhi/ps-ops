-- Creates the "accountant" role (no permissions yet) and one login user.
-- Run against the ps_ops database. Safe to re-run: skips rows that already exist.
-- Login email: testcust4@gmail.com  (password set below as a bcrypt hash)
-- Branch: first row in branches (change @branch_id if needed).

SET @branch_id = (SELECT id FROM branches ORDER BY created_at LIMIT 1);

INSERT INTO roles (name, created_at)
SELECT 'accountant', NOW()
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'accountant');

SET @role_id = (SELECT id FROM roles WHERE name = 'accountant' LIMIT 1);

-- users.role is a legacy enum; the app falls back to 'technician' for custom roles.
INSERT INTO users (name, email, password_hash, role, role_id, branch_id, invite_status, is_active, created_at)
SELECT 'accountant', 'testcust4@gmail.com', '$2b$10$Jo6tUAAc5Ky3TKPwhcaLXege0v91bfwDf6gqhH/bKp5jD5PrPL6fq', 'technician', @role_id, @branch_id, 'ACTIVE', 1, NOW()
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'testcust4@gmail.com');

-- Mirrors the branch scope the app applies to branch-level users.
INSERT INTO user_scopes (user_id, scope_type, scope_id, created_at)
SELECT u.id, 'branch', @branch_id, NOW()
FROM users u
WHERE u.email = 'testcust4@gmail.com'
  AND @branch_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM user_scopes s WHERE s.user_id = u.id);

-- Permissions for the accountant role: invoices, payments, tasks, and read access to
-- customers/sites (the invoice and payment forms load /api/companies and /api/sites).
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT @role_id, p.id
FROM permissions p
WHERE p.name IN (
  'VIEW_INVOICE', 'CREATE_INVOICE', 'UPDATE_INVOICE', 'CANCEL_INVOICE',
  'VIEW_PAYMENT', 'CREATE_PAYMENT',
  'VIEW_TASK', 'CREATE_TASK', 'UPDATE_TASK',
  'VIEW_CONTACT'
);

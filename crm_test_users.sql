-- =====================================================================
-- CRM test users (LOCAL DB ONLY - do not run against production)
--   marketing : market2@gmail.com / password 12345
--   sales     : sales@gmail.com   / password 12345
-- Mirrors exactly how POST /api/users inserts a user: bcrypt hash (cost 10),
-- invite_status ACTIVE, is_active 1, role_id from the roles table, and the
-- legacy users.role column set to 'technician' (what the backend does for any
-- role name outside its legacy list; role_id is the source of truth).
-- Run crm_roles_permissions.sql FIRST - these inserts do nothing if the role
-- does not exist yet. Safe to re-run (skips an email that already exists).
-- Branch: 'Head Office' if present, otherwise the first branch.
-- =====================================================================

INSERT INTO users
  (name, email, phone, password_hash, role, role_id, branch_id, invite_status, is_active, created_at)
SELECT
  'Marketing User', 'market2@gmail.com', NULL,
  '$2b$10$ycqwltj7xlqjeRHLHhRfcOjkpXyV1.Q4iCc6B6jl0h3LWfWlEaivW',
  'technician', r.id,
  COALESCE((SELECT id FROM branches WHERE name = 'Head Office' LIMIT 1),
           (SELECT id FROM branches ORDER BY created_at LIMIT 1)),
  'ACTIVE', 1, NOW()
FROM roles r
WHERE r.name = 'marketing'
  AND NOT EXISTS (SELECT 1 FROM users WHERE email = 'market2@gmail.com');

INSERT INTO users
  (name, email, phone, password_hash, role, role_id, branch_id, invite_status, is_active, created_at)
SELECT
  'Sales User', 'sales@gmail.com', NULL,
  '$2b$10$ycqwltj7xlqjeRHLHhRfcOjkpXyV1.Q4iCc6B6jl0h3LWfWlEaivW',
  'technician', r.id,
  COALESCE((SELECT id FROM branches WHERE name = 'Head Office' LIMIT 1),
           (SELECT id FROM branches ORDER BY created_at LIMIT 1)),
  'ACTIVE', 1, NOW()
FROM roles r
WHERE r.name = 'sales'
  AND NOT EXISTS (SELECT 1 FROM users WHERE email = 'sales@gmail.com');

-- Verify (expected: 2 rows, each with a role name and a branch)
-- SELECT u.id, u.name, u.email, r.name AS role, u.branch_id, u.is_active, u.invite_status
-- FROM users u JOIN roles r ON r.id = u.role_id
-- WHERE u.email IN ('market2@gmail.com', 'sales@gmail.com');

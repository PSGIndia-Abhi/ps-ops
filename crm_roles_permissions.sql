-- =====================================================================
-- CRM roles + permissions (NEW rows only - no existing row is changed)
-- Roles       : sales, marketing   (only these two reach the CRM app)
-- Permissions : CRM_ACCESS, CRM_VIEW_SERVICE_PRICE, CRM_CREATE_LEAD,
--               CRM_VIEW_LEAD, CRM_COLLECT_PAYMENT   (Phase 1: create, fetch, payment)
-- Target: local MySQL (ps_ops). Safe to re-run: every insert checks for an
-- existing row first (roles.name / permissions.name have no UNIQUE key).
-- Note: admin already bypasses permission checks by role name in the backend.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------
INSERT INTO permissions (name)
SELECT 'CRM_ACCESS' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'CRM_ACCESS');

INSERT INTO permissions (name)
SELECT 'CRM_VIEW_SERVICE_PRICE' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'CRM_VIEW_SERVICE_PRICE');

INSERT INTO permissions (name)
SELECT 'CRM_CREATE_LEAD' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'CRM_CREATE_LEAD');

INSERT INTO permissions (name)
SELECT 'CRM_VIEW_LEAD' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'CRM_VIEW_LEAD');

INSERT INTO permissions (name)
SELECT 'CRM_COLLECT_PAYMENT' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'CRM_COLLECT_PAYMENT');

-- ---------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------
INSERT INTO roles (name)
SELECT 'sales' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'sales');

INSERT INTO roles (name)
SELECT 'marketing' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'marketing');

-- ---------------------------------------------------------------------
-- Grant: both roles get all five CRM permissions, nothing else
-- ---------------------------------------------------------------------
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
WHERE r.name IN ('sales', 'marketing')
  AND p.name IN ('CRM_ACCESS', 'CRM_VIEW_SERVICE_PRICE', 'CRM_CREATE_LEAD',
                 'CRM_VIEW_LEAD', 'CRM_COLLECT_PAYMENT');

-- Verify (expected: 2 roles x 5 permissions = 10 rows)
-- SELECT r.name AS role, p.name AS permission
-- FROM role_permissions rp
-- JOIN roles r ON r.id = rp.role_id
-- JOIN permissions p ON p.id = rp.permission_id
-- WHERE r.name IN ('sales', 'marketing')
-- ORDER BY r.name, p.name;

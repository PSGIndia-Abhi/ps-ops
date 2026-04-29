-- Ensure Head Office branch exists
INSERT INTO branches (id, name)
SELECT UUID(), 'Head Office'
WHERE NOT EXISTS (
  SELECT 1 FROM branches WHERE name LIKE '%Head Office%'
);

-- Assign all admin users to Head Office if missing
UPDATE users u
JOIN branches b ON b.name LIKE '%Head Office%'
SET u.branch_id = b.id
WHERE u.role = 'admin'
  AND (u.branch_id IS NULL OR u.branch_id = '');

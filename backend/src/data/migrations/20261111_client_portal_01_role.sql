-- Client Portal: make sure the "client" role exists.
--
-- Client logins are created from Admin > Client Accounts. Login looks the role up through
-- users.role_id, so the role row must exist (it was missing on some databases).
-- What a client can see is decided by user_scopes (company / site rows), not by permissions:
-- the /api/client-portal endpoints check the role name and the scopes themselves.
--
-- Data only - no table is changed. Safe to re-run.

INSERT INTO roles (name)
SELECT 'client'
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'client');

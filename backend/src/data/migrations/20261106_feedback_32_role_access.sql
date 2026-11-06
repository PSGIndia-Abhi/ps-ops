-- Customer Feedback, step 32: who sees which Feedback Desk screens.
--
--   Service Coordinator  + FEEDBACK_VIEW   the Dashboard (calls, read-only) and the Customer report,
--                                           next to Issues, Call schedule and Requests they have.
--   Operations Manager   + FEEDBACK_ADMIN  Masters: Questions, Issues, Templates & settings.
--
-- Permission rows only. Safe to re-run.

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
WHERE r.name = 'Service Coordinator'
  AND p.name = 'FEEDBACK_VIEW';

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
WHERE r.name = 'Operations Manager'
  AND p.name = 'FEEDBACK_ADMIN';

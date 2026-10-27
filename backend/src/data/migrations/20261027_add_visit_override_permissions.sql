-- Two visit overrides, grantable per role in Team Management -> Roles (Visits):
--   START_VISIT_ANYWHERE      start a visit without being at the job location (no location check)
--   END_VISIT_WITHOUT_PHOTOS  end a Brigade visit without the before/after work photos
-- Admin always has both (checked in code), so nothing needs granting for admin. Technicians keep
-- the location check and the photo rule unless their role is given these.
--
-- New permission rows only - no role gets them here, no existing table is changed.
-- permissions.name has no unique key, so each insert is guarded to stay re-runnable.

INSERT INTO `permissions` (`name`)
SELECT 'START_VISIT_ANYWHERE' WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `name` = 'START_VISIT_ANYWHERE');

INSERT INTO `permissions` (`name`)
SELECT 'END_VISIT_WITHOUT_PHOTOS' WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `name` = 'END_VISIT_WITHOUT_PHOTOS');

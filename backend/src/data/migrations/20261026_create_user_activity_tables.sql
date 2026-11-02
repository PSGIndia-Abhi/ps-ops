-- User Activity report (admin sidebar -> User Activity).
--
-- user_daily_activity: one row per user, per day, per app - the first and last time that user
-- made a signed-in request that day (a login counts too). The Android app keeps people signed
-- in for 30 days, so logins alone can't say whether someone used the app today; this can.
-- Written by POST /api/auth/login and by the auth middleware, at most once every few minutes
-- per user (src/utils/userActivity.js). The report shows first_seen_at as the "login time".
--
-- platform is one of: web, android_app, old_android_app.
--
-- New table only - no existing table is changed. Safe to re-run.

CREATE TABLE IF NOT EXISTS `user_daily_activity` (
  `user_id`       BIGINT       NOT NULL,
  `activity_date` DATE         NOT NULL,
  `platform`      VARCHAR(20)  NOT NULL,
  `first_seen_at` DATETIME     NOT NULL,
  `last_seen_at`  DATETIME     NOT NULL,
  PRIMARY KEY (`user_id`, `activity_date`, `platform`),
  KEY `idx_user_daily_activity_date` (`activity_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

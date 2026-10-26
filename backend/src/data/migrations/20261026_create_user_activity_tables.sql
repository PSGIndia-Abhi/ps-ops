-- User Activity report (admin sidebar -> User Activity).
--
-- user_login_events: one row per sign-in attempt on POST /api/auth/login, successful or not,
-- from any client: the website, the BestServe Android app (com.bestserve.mobile) and the old
-- Capacitor app (com.bestserve.app). user_id is NULL when the email matched no account.
--
-- user_daily_activity: one row per user, per day, per app - the first and last time that user
-- made a signed-in request that day. The Android app keeps people signed in for 30 days, so
-- logins alone can't say whether someone used the app today; this can. Written by the auth
-- middleware at most once every few minutes per user (src/utils/userActivity.js).
--
-- platform is one of: web, android_app, old_android_app.
--
-- New tables only - no existing table is changed. Safe to re-run.

CREATE TABLE IF NOT EXISTS `user_login_events` (
  `id`             BIGINT        NOT NULL AUTO_INCREMENT,
  `user_id`        BIGINT        NULL,
  `email`          VARCHAR(150)  NOT NULL,
  `platform`       VARCHAR(20)   NOT NULL,
  `success`        TINYINT(1)    NOT NULL,
  `failure_reason` VARCHAR(40)   NULL,
  `ip_address`     VARCHAR(64)   NULL,
  `user_agent`     VARCHAR(255)  NULL,
  `created_at`     DATETIME      NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_user_login_events_created` (`created_at`),
  KEY `idx_user_login_events_user` (`user_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `user_daily_activity` (
  `user_id`       BIGINT       NOT NULL,
  `activity_date` DATE         NOT NULL,
  `platform`      VARCHAR(20)  NOT NULL,
  `first_seen_at` DATETIME     NOT NULL,
  `last_seen_at`  DATETIME     NOT NULL,
  PRIMARY KEY (`user_id`, `activity_date`, `platform`),
  KEY `idx_user_daily_activity_date` (`activity_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

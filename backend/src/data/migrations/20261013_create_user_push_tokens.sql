-- Push notifications (Firebase Cloud Messaging) for the mobile app.
--
-- One row per phone: the FCM token the app gets from Firebase, and whose phone it is. The app
-- registers it after sign-in (POST /api/push/register) and removes it on sign-out
-- (POST /api/push/unregister). A token Firebase reports as no longer valid is deleted by the
-- backend when a push to it fails.
--
-- New table only - no existing table is changed. Safe to re-run.

CREATE TABLE IF NOT EXISTS `user_push_tokens` (
  `id`           CHAR(36)      NOT NULL,
  `user_id`      BIGINT        NOT NULL,
  `token`        VARCHAR(512)  NOT NULL,
  `platform`     VARCHAR(20)   NOT NULL DEFAULT 'android',
  `created_at`   TIMESTAMP     NULL DEFAULT CURRENT_TIMESTAMP,
  `last_seen_at` TIMESTAMP     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_push_tokens_token` (`token`),
  KEY `idx_user_push_tokens_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

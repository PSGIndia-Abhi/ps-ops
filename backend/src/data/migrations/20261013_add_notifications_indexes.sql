-- Indexes for the notifications table, which until now had only its primary key.
--
-- It is read constantly: every open browser tab asks for the user's notifications (the bell,
-- every 25 s) and unread ones (payment reminder pop-ups, every 30 s), and the payment reminder
-- job checks every 30 s whether a reminder was already alerted. Without an index each of those
-- reads the whole table, which only ever grows.
--
--   idx_notifications_user_created  user_id + created_at  -> a user's list, newest first
--   idx_notifications_user_read     user_id + is_read     -> unread count / unread list
--   idx_notifications_entity        entity_id + type      -> "was this reminder already alerted?"
--
-- No data changes. Safe to re-run: each index is only added if it is missing.

SET @has := (SELECT COUNT(*) FROM information_schema.STATISTICS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notifications' AND INDEX_NAME = 'idx_notifications_user_created');
SET @sql := IF(@has = 0, 'ALTER TABLE `notifications` ADD INDEX `idx_notifications_user_created` (`user_id`, `created_at`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM information_schema.STATISTICS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notifications' AND INDEX_NAME = 'idx_notifications_user_read');
SET @sql := IF(@has = 0, 'ALTER TABLE `notifications` ADD INDEX `idx_notifications_user_read` (`user_id`, `is_read`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM information_schema.STATISTICS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notifications' AND INDEX_NAME = 'idx_notifications_entity');
SET @sql := IF(@has = 0, 'ALTER TABLE `notifications` ADD INDEX `idx_notifications_entity` (`entity_id`, `type`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

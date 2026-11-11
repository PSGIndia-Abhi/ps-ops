-- Helpdesk: every user (web and app) can raise a support ticket and chat with the technical team.
--
-- Who raises:   every signed-in user except the technical team (admin, clients and Technical Head included).
-- Who answers:  the "Technical Lead" and "Technical Team" roles - both equal.
--               Admin does NOT answer. Enforced in services/helpdesk.service.js by role name.
--
-- A ticket is a chat thread. The first message is the user's description; files hang off messages.
-- Fully separate from job tickets (job_tickets / job_ticket_messages) and feedback tickets.
--
-- New tables only - no existing table is changed. Safe to re-run.

CREATE TABLE IF NOT EXISTS `helpdesk_tickets` (
  `id`               CHAR(36)      NOT NULL,
  -- Shown to people as HD-00042.
  `ticket_no`        INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `subject`          VARCHAR(200)  NOT NULL,
  `status`           ENUM('OPEN','IN_PROGRESS','WAITING_USER','RESOLVED','CLOSED') NOT NULL DEFAULT 'OPEN',
  `priority`         ENUM('LOW','NORMAL','HIGH','URGENT') NOT NULL DEFAULT 'NORMAL',
  `raised_by`        BIGINT        NOT NULL,
  -- The raiser's role when they raised it (roles can change later).
  `raised_by_role`   VARCHAR(100)  NULL,
  `assigned_to`      BIGINT        NULL,
  -- Context captured automatically so support does not have to ask.
  `source`           ENUM('WEB','APP') NOT NULL DEFAULT 'WEB',
  `page`             VARCHAR(255)  NULL,
  `app_version`      VARCHAR(50)   NULL,
  `device`           VARCHAR(255)  NULL,
  -- Who spoke last (USER / AGENT) - drives "needs reply" in the desk queue.
  `last_message_at`  DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `last_message_by`  ENUM('USER','AGENT') NOT NULL DEFAULT 'USER',
  `resolved_at`      DATETIME      NULL,
  `closed_at`        DATETIME      NULL,
  `reopen_count`     INT           NOT NULL DEFAULT 0,
  `created_at`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_hd_ticket_no` (`ticket_no`),
  KEY `idx_hd_raised_by` (`raised_by`, `last_message_at`),
  KEY `idx_hd_assigned` (`assigned_to`, `status`),
  KEY `idx_hd_status` (`status`, `last_message_at`),
  CONSTRAINT `fk_hd_ticket_raised_by` FOREIGN KEY (`raised_by`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_hd_ticket_assigned` FOREIGN KEY (`assigned_to`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `helpdesk_messages` (
  `id`          CHAR(36)   NOT NULL,
  `ticket_id`   CHAR(36)   NOT NULL,
  -- NULL for SYSTEM lines whose actor was deleted.
  `sender_id`   BIGINT     NULL,
  -- MESSAGE: visible to both sides. NOTE: technical team only. SYSTEM: "Status -> Resolved" etc.
  `kind`        ENUM('MESSAGE','NOTE','SYSTEM') NOT NULL DEFAULT 'MESSAGE',
  `body`        TEXT       NOT NULL,
  `created_at`  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_hd_msg_ticket` (`ticket_id`, `created_at`),
  CONSTRAINT `fk_hd_msg_ticket` FOREIGN KEY (`ticket_id`) REFERENCES `helpdesk_tickets` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_hd_msg_sender` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Files are stored in MinIO (same bucket as the rest of the app) under helpdesk/<ticket id>/.
CREATE TABLE IF NOT EXISTS `helpdesk_attachments` (
  `id`           CHAR(36)      NOT NULL,
  `ticket_id`    CHAR(36)      NOT NULL,
  `message_id`   CHAR(36)      NOT NULL,
  `file_key`     VARCHAR(255)  NOT NULL,
  `file_name`    VARCHAR(255)  NOT NULL,
  `mime_type`    VARCHAR(100)  NOT NULL,
  `size_bytes`   INT UNSIGNED  NOT NULL,
  `uploaded_by`  BIGINT        NULL,
  `created_at`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_hd_att_ticket` (`ticket_id`),
  KEY `idx_hd_att_message` (`message_id`),
  CONSTRAINT `fk_hd_att_ticket` FOREIGN KEY (`ticket_id`) REFERENCES `helpdesk_tickets` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_hd_att_message` FOREIGN KEY (`message_id`) REFERENCES `helpdesk_messages` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_hd_att_user` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- When each person last opened each ticket - unread badges. One row per (ticket, person).
CREATE TABLE IF NOT EXISTS `helpdesk_reads` (
  `ticket_id`     CHAR(36)  NOT NULL,
  `user_id`       BIGINT    NOT NULL,
  `last_read_at`  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`ticket_id`, `user_id`),
  KEY `idx_hd_reads_user` (`user_id`),
  CONSTRAINT `fk_hd_reads_ticket` FOREIGN KEY (`ticket_id`) REFERENCES `helpdesk_tickets` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_hd_reads_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

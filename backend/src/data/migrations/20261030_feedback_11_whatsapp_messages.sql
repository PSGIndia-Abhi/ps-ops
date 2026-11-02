-- Customer Feedback Tickets, step 11 of 15: WhatsApp messages opened.
--
-- feedback_whatsapp_messages: one row each time the app fills a template and opens WhatsApp
-- with it (wa.me link). Always belongs to a monthly call (request); ticket_id is set when the
-- message is about a raised ticket (summary to Operations, re-visit booked). Status is always
-- OPENED: whether the user then tapped Send is not known without a WhatsApp provider.
-- provider_message_id is empty in v1.
--
-- Needs: 05_requests, 10_tickets, 03_whatsapp_templates, contacts, users.
-- New table only. Safe to re-run.

CREATE TABLE IF NOT EXISTS `feedback_whatsapp_messages` (
  `id`                   CHAR(36)     NOT NULL,
  `request_id`           CHAR(36)     NOT NULL,
  `ticket_id`            CHAR(36)     NULL,
  `template_id`          INT          NULL,
  `recipient_type`       ENUM('CUSTOMER','OPERATIONS','TECHNICIAN','OTHER') NOT NULL,
  `recipient_user_id`    BIGINT       NULL,
  `recipient_contact_id` CHAR(36)     NULL,
  `phone`                VARCHAR(20)  NOT NULL,
  `body`                 TEXT         NOT NULL,
  `provider_message_id`  VARCHAR(100) NULL,
  `status`               ENUM('OPENED') NOT NULL DEFAULT 'OPENED',
  `opened_by`            BIGINT       NOT NULL,
  `opened_at`            DATETIME     NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_fwm_provider_message` (`provider_message_id`),
  KEY `idx_fwm_request` (`request_id`, `opened_at`),
  KEY `idx_fwm_ticket` (`ticket_id`),
  CONSTRAINT `fk_fwm_request`   FOREIGN KEY (`request_id`)           REFERENCES `feedback_requests` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_fwm_ticket`    FOREIGN KEY (`ticket_id`)            REFERENCES `feedback_tickets` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_fwm_template`  FOREIGN KEY (`template_id`)          REFERENCES `feedback_whatsapp_templates` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_fwm_user`      FOREIGN KEY (`recipient_user_id`)    REFERENCES `users` (`id`),
  CONSTRAINT `fk_fwm_contact`   FOREIGN KEY (`recipient_contact_id`) REFERENCES `contacts` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_fwm_opened_by` FOREIGN KEY (`opened_by`)            REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

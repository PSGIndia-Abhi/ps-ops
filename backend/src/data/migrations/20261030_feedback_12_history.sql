-- Customer Feedback Tickets, step 12 of 15: what happened on a monthly call and its tickets.
--
-- feedback_history: one row per event, shown as History on the call and on a ticket.
-- Always belongs to a request; ticket_id is set for ticket events.
--   event       request: OPENED, ASSIGNED, CALL_ATTEMPT, FORM_LINK_SENT, FORM_SUBMITTED, FORM_EXPIRED,
--                        FEEDBACK_SAVED, WHATSAPP_SENT, DONE
--               ticket:  TICKET_RAISED, PRIORITY_SET, ACTION_SET, OWNER_CHANGED, UPDATED, CLOSED, REOPENED
--   changed_by  NULL for system events (timed job) and customer form events
--
-- Needs: 05_requests, 10_tickets, users. New table only. Safe to re-run.

CREATE TABLE IF NOT EXISTS `feedback_history` (
  `id`          BIGINT       NOT NULL AUTO_INCREMENT,
  `request_id`  CHAR(36)     NOT NULL,
  `ticket_id`   CHAR(36)     NULL,
  `event`       VARCHAR(40)  NOT NULL,
  `from_status` VARCHAR(20)  NULL,
  `to_status`   VARCHAR(20)  NULL,
  `note`        VARCHAR(500) NULL,
  `changed_by`  BIGINT       NULL,
  `created_at`  DATETIME     NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_fh_request_created` (`request_id`, `created_at`),
  KEY `idx_fh_ticket_created` (`ticket_id`, `created_at`),
  CONSTRAINT `fk_fh_request`    FOREIGN KEY (`request_id`) REFERENCES `feedback_requests` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_fh_ticket`     FOREIGN KEY (`ticket_id`)  REFERENCES `feedback_tickets` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_fh_changed_by` FOREIGN KEY (`changed_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

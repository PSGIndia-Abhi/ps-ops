-- Customer Feedback Tickets, step 3 of 15: WhatsApp message templates.
--
-- feedback_whatsapp_templates: the text of the WhatsApp messages the app fills in and opens
-- with a wa.me link (click-to-send - no WhatsApp provider, no webhook).
--   code       FEEDBACK_SUMMARY, REVISIT_BOOKED, FORM_LINK (looked up by the code)
--   body       placeholders {ticket} {priority} {customer} {site} {date} {feedback} {action}
--              {technician} {link} {collector}
--   audiences  who the template may be sent to
--   provider_template_name  empty in v1; for a WhatsApp provider added later
--
-- New table only. Safe to re-run.

CREATE TABLE IF NOT EXISTS `feedback_whatsapp_templates` (
  `id`                     INT                                       NOT NULL AUTO_INCREMENT,
  `code`                   VARCHAR(40)                               NOT NULL,
  `name`                   VARCHAR(100)                              NOT NULL,
  `body`                   TEXT                                      NOT NULL,
  `audiences`              SET('CUSTOMER','OPERATIONS','TECHNICIAN') NOT NULL,
  `provider_template_name` VARCHAR(100)                              NULL,
  `is_active`              TINYINT(1)                                NOT NULL DEFAULT 1,
  `updated_by`             BIGINT                                    NULL,
  `created_at`             DATETIME                                  NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`             DATETIME                                  NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_fwt_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

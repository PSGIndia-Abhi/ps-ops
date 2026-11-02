-- Customer Feedback Tickets, step 18: email templates (Masters > Email templates).
--
-- feedback_email_templates: the three optional customer emails the collector opens in Gmail.
-- Codes are fixed; admin edits subject, message and on/off. Placeholders:
--   {contact} {customer} {site} {month} {ticket} {issue} {revisit_note} {action_taken} {sender}
-- {revisit_note} / {action_taken} become a full sentence, or nothing (the empty line is dropped).
-- Creates one table and adds 3 rows (INSERT IGNORE on the unique code). Safe to re-run.

CREATE TABLE IF NOT EXISTS `feedback_email_templates` (
  `id`          INT          NOT NULL AUTO_INCREMENT,
  `code`        VARCHAR(40)  NOT NULL,
  `name`        VARCHAR(100) NOT NULL,
  `subject`     VARCHAR(200) NOT NULL,
  `body`        TEXT         NOT NULL,
  `is_active`   TINYINT(1)   NOT NULL DEFAULT 1,
  `updated_by`  BIGINT       NULL,
  `created_at`  DATETIME     NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_fet_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT IGNORE INTO `feedback_email_templates` (`code`, `name`, `subject`, `body`) VALUES
  ('THANK_YOU', 'Thank you (no issue)',
   'Thank you for your feedback - BestServe',
   'Dear {contact},\n\nThank you for taking the time to share your feedback on the services carried out at {customer}, {site} during {month}.\n\nWe are glad to know that you are satisfied with our service. Your feedback helps us maintain the standard of quality you expect from BestServe.\n\nShould you require any service or assistance in the future, please feel free to contact us. We will be happy to help.\n\nWarm regards,\n{sender}\nCustomer Care, BestServe'),
  ('ISSUE_RECEIVED', 'Issue received',
   'We have received your concern - Ticket {ticket} | BestServe',
   'Dear {contact},\n\nThank you for your feedback on the services carried out at {customer}, {site} during {month}.\n\nWe are sorry that our service did not fully meet your expectations. Your concern has been registered with us under ticket number {ticket}:\n\n"{issue}"\n\nOur operations team has been informed and will take the necessary action. {revisit_note}We will keep you informed of the progress.\n\nPlease quote ticket number {ticket} in any communication regarding this matter.\n\nWe apologise for the inconvenience and thank you for your patience.\n\nWarm regards,\n{sender}\nCustomer Care, BestServe'),
  ('ISSUE_RESOLVED', 'Issue resolved',
   'Your concern has been resolved - Ticket {ticket} | BestServe',
   'Dear {contact},\n\nWe are pleased to inform you that the concern you raised regarding the services at {customer}, {site} (ticket number {ticket}) has been resolved.\n\n{action_taken}\n\nThank you for bringing this to our attention and for your patience while we addressed it.\n\nIf you notice any further issue, or require any service in the future, please feel free to contact us. We will be happy to help.\n\nWarm regards,\n{sender}\nCustomer Care, BestServe');

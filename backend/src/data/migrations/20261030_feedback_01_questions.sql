-- Customer Feedback Tickets, step 1 of 15: the questions master.



--
-- feedback_questions: the questions asked on every feedback call (Android app) and on the
-- customer's WhatsApp form. Kept by admins in Masters -> Feedback questions (FEEDBACK_ADMIN).
-- A question that has been answered is never deleted - it is switched off (is_active = 0),
-- because feedback_responses keeps a copy of the wording that was asked.
--   is_required   the app and the form refuse to save without an answer to it
--   show_on_form  also asked on the customer's WhatsApp form (always asked on a call)
--
-- New table only - no existing table is changed. Safe to re-run.

CREATE TABLE IF NOT EXISTS `feedback_questions` (
  `id`            INT          NOT NULL AUTO_INCREMENT,
  `question_text` VARCHAR(255) NOT NULL,
  `sort_order`    INT          NOT NULL DEFAULT 0,
  `is_required`   TINYINT(1)   NOT NULL DEFAULT 1,
  `show_on_form`  TINYINT(1)   NOT NULL DEFAULT 1,
  `is_active`     TINYINT(1)   NOT NULL DEFAULT 1,
  `created_by`    BIGINT       NULL,
  `updated_by`    BIGINT       NULL,
  `created_at`    DATETIME     NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_fq_active_order` (`is_active`, `sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

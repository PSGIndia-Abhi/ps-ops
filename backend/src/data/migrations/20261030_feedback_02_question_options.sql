-- Customer Feedback Tickets, step 2 of 15: the answers of each question.
--
-- feedback_question_options: the fixed answers a question offers (Yes / Partly / No ...).
--   is_bad              the answer means there is an issue (shown red; the app offers "Raise ticket")
--   suggested_priority  for a bad answer: the priority it suggests. A raised ticket's suggested
--                       priority is the highest among its answers; the collector can change it.
-- Like questions, an answer that has been used is switched off, never deleted.
--
-- Needs: 01_questions. New table only. Safe to re-run.

CREATE TABLE IF NOT EXISTS `feedback_question_options` (
  `id`                 INT                         NOT NULL AUTO_INCREMENT,
  `question_id`        INT                         NOT NULL,
  `label`              VARCHAR(60)                 NOT NULL,
  `sort_order`         INT                         NOT NULL DEFAULT 0,
  `is_bad`             TINYINT(1)                  NOT NULL DEFAULT 0,
  `suggested_priority` ENUM('LOW','MEDIUM','HIGH') NULL,
  `is_active`          TINYINT(1)                  NOT NULL DEFAULT 1,
  `created_at`         DATETIME                    NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`         DATETIME                    NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_fqo_question` (`question_id`, `is_active`, `sort_order`),
  CONSTRAINT `fk_fqo_question` FOREIGN KEY (`question_id`) REFERENCES `feedback_questions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Customer Feedback Tickets, step 9 of 15: the answer to each question.
--
-- feedback_responses: one row per question answered in a submission. question_text,
-- option_label, is_bad and suggested_priority are copied from the master at that moment, so
-- editing the questions later never changes feedback already given.
--
-- Needs: 08_submissions, 01_questions, 02_question_options. New table only. Safe to re-run.

CREATE TABLE IF NOT EXISTS `feedback_responses` (
  `id`                 BIGINT       NOT NULL AUTO_INCREMENT,
  `submission_id`      CHAR(36)     NOT NULL,
  `question_id`        INT          NOT NULL,
  `option_id`          INT          NOT NULL,
  `question_text`      VARCHAR(255) NOT NULL,
  `option_label`       VARCHAR(60)  NOT NULL,
  `is_bad`             TINYINT(1)   NOT NULL DEFAULT 0,
  `suggested_priority` ENUM('LOW','MEDIUM','HIGH') NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_fr_submission_question` (`submission_id`, `question_id`),
  KEY `idx_fr_question_option` (`question_id`, `option_id`),
  CONSTRAINT `fk_fr_submission` FOREIGN KEY (`submission_id`) REFERENCES `feedback_submissions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_fr_question`   FOREIGN KEY (`question_id`)   REFERENCES `feedback_questions` (`id`),
  CONSTRAINT `fk_fr_option`     FOREIGN KEY (`option_id`)     REFERENCES `feedback_question_options` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

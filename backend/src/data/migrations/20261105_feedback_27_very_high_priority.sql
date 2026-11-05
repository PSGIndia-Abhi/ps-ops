-- Customer Feedback, step 27: a fourth priority, VERY_HIGH ("Very high"), above HIGH.
-- Widens the priority ENUMs of the feedback tables; existing values stay. Safe to re-run.

ALTER TABLE `feedback_tickets`
  MODIFY `priority`           ENUM('LOW','MEDIUM','HIGH','VERY_HIGH') NOT NULL,
  MODIFY `suggested_priority` ENUM('LOW','MEDIUM','HIGH','VERY_HIGH') NULL DEFAULT NULL;

ALTER TABLE `feedback_ticket_parts`
  MODIFY `priority` ENUM('LOW','MEDIUM','HIGH','VERY_HIGH') NULL DEFAULT NULL;

ALTER TABLE `feedback_question_options`
  MODIFY `suggested_priority` ENUM('LOW','MEDIUM','HIGH','VERY_HIGH') NULL DEFAULT NULL;

ALTER TABLE `feedback_responses`
  MODIFY `suggested_priority` ENUM('LOW','MEDIUM','HIGH','VERY_HIGH') NULL DEFAULT NULL;

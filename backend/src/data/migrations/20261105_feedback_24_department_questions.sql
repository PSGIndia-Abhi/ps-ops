-- Customer Feedback Tickets, step 24: department questions.
--
-- feedback_questions.question_type gets DEPARTMENT: a question for one or more departments
-- (departments = JSON list of feedback_departments.kind, e.g. ["ACCOUNTS"]). On a call the collector
-- picks General, Service-based, Both or Department (then which department); a DEPARTMENT question is
-- asked only in that last choice. The customer's form keeps asking General + Service questions.
-- Existing questions are unchanged. Run once.

ALTER TABLE `feedback_questions`
  MODIFY COLUMN `question_type` ENUM('GENERAL','SERVICE','DEPARTMENT') NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN `departments` JSON NULL AFTER `services`;

-- Customer Feedback Tickets, step 21: general and service-based questions.
--
-- Adds two columns to feedback_questions:
--   question_type  GENERAL  = asked about the site's feedback as a whole (every existing question);
--                  SERVICE  = asked about particular services (the services column says which).
--   services       JSON list of service names, e.g. ["Mosquito Fogging", "General Pest Control (GPC)"],
--                  for a SERVICE question; NULL for a GENERAL one. A call asks a SERVICE question
--                  when the site had one of those services in the month.
-- When taking feedback the collector picks General, Service-based or Both. Existing questions and
-- the feedback already saved are unchanged. Run once.

ALTER TABLE `feedback_questions`
  ADD COLUMN `question_type` ENUM('GENERAL','SERVICE') NOT NULL DEFAULT 'GENERAL' AFTER `question_text`,
  ADD COLUMN `services` JSON NULL AFTER `question_type`;

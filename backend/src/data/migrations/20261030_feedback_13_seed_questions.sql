-- Customer Feedback Tickets, step 13 of 15: the 5 starting questions and their answers.
--
-- Admins change them later in Masters -> Feedback questions. Fixed ids so the answers can
-- point at their question; INSERT IGNORE skips rows already there, so re-running doesn't
-- overwrite edits made in the master.
--
-- Needs: 01_questions, 02_question_options. Inserts rows only. Safe to re-run.

INSERT IGNORE INTO `feedback_questions` (`id`, `question_text`, `sort_order`) VALUES
  (1, 'Was the service done properly?', 1),
  (2, 'Is the problem solved?', 2),
  (3, 'Did the technician come on time?', 3),
  (4, 'Was the technician polite and in uniform?', 4),
  (5, 'Would you recommend BestServe?', 5);

INSERT IGNORE INTO `feedback_question_options` (`id`, `question_id`, `label`, `sort_order`, `is_bad`, `suggested_priority`) VALUES
  (1,  1, 'Yes',    1, 0, NULL),
  (2,  1, 'Partly', 2, 1, 'MEDIUM'),
  (3,  1, 'No',     3, 1, 'HIGH'),
  (4,  2, 'Yes',    1, 0, NULL),
  (5,  2, 'Partly', 2, 1, 'MEDIUM'),
  (6,  2, 'No',     3, 1, 'HIGH'),
  (7,  3, 'Yes',    1, 0, NULL),
  (8,  3, 'No',     2, 1, 'MEDIUM'),
  (9,  4, 'Yes',    1, 0, NULL),
  (10, 4, 'No',     2, 1, 'LOW'),
  (11, 5, 'Yes',    1, 0, NULL),
  (12, 5, 'Maybe',  2, 0, NULL),
  (13, 5, 'No',     3, 1, 'MEDIUM');

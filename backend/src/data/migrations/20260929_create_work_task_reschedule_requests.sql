-- Reschedule requests for the generic Task Management module.
--
-- An assignee who didn't create a task can't move its due date themselves;
-- they ask instead. The task's creator, or a manager of the assignee (anyone
-- the server's canEditTerms() allows), approves or rejects. Approving applies
-- the new due date to the task and logs it in work_task_history.
--
-- At most one PENDING request per task is enforced in code (the request
-- endpoint locks the task row). Rows are removed with their task.
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS `work_task_reschedule_requests` (
  `id` CHAR(36) NOT NULL,
  `task_id` CHAR(36) NOT NULL,
  `requested_by` BIGINT NOT NULL,
  `from_due_date` DATE NULL,
  `from_due_time` TIME NULL,
  `to_due_date` DATE NOT NULL,
  `to_due_time` TIME NULL,
  `reason` VARCHAR(500) NULL,
  `status` ENUM('PENDING','APPROVED','REJECTED','WITHDRAWN') NOT NULL DEFAULT 'PENDING',
  `decided_by` BIGINT NULL,
  `decided_at` DATETIME NULL,
  `decision_note` VARCHAR(500) NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_wtrr_task` (`task_id`, `status`),
  KEY `idx_wtrr_requester` (`requested_by`, `status`),
  CONSTRAINT `fk_wtrr_task` FOREIGN KEY (`task_id`) REFERENCES `work_tasks` (`id`),
  CONSTRAINT `fk_wtrr_requested_by` FOREIGN KEY (`requested_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_wtrr_decided_by` FOREIGN KEY (`decided_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Brigade: bulk import of existing work from the client's Excel tracker
-- (Brigade panel -> Import). One row per import run: who, when, which file, the
-- counts, and the ids it created, so one import can be listed or undone.
-- Additive only: a new table. Safe to re-run.

CREATE TABLE IF NOT EXISTS brigade_imports (
  id                 CHAR(36)      NOT NULL,
  file_name          VARCHAR(255)  NOT NULL,
  status             ENUM('RUNNING','DONE','FAILED','UNDONE') NOT NULL DEFAULT 'RUNNING',
  summary            JSON          NULL,       -- counts: flats, completed jobs, pending flats, skipped ...
  created            JSON          NULL,       -- { booking_ids: [], job_ids: [], request_ids: [] }
  error              TEXT          NULL,       -- why a run stopped, when status = FAILED
  created_by_user_id BIGINT        NULL,
  created_at         TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at        DATETIME      NULL,
  undone_by_user_id  BIGINT        NULL,
  undone_at          DATETIME      NULL,
  PRIMARY KEY (id),
  KEY idx_brigade_imports_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Brigade bulk imports from the Excel tracker (one row per run)';

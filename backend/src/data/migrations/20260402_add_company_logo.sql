ALTER TABLE companies
  ADD COLUMN logo_object_key VARCHAR(512) NULL,
  ADD COLUMN logo_file_name VARCHAR(255) NULL,
  ADD COLUMN logo_file_type VARCHAR(120) NULL,
  ADD COLUMN logo_updated_at DATETIME NULL;

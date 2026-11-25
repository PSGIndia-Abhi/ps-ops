-- Profile photo for a user (first used by the BestServe Client app's Profile screen).
-- Stored in MinIO like company logos; these columns only point at it. All NULL = no photo.
ALTER TABLE users
  ADD COLUMN avatar_object_key VARCHAR(512) NULL,
  ADD COLUMN avatar_file_type VARCHAR(120) NULL,
  ADD COLUMN avatar_updated_at DATETIME NULL;

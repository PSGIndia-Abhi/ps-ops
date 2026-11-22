-- Personal digital signatures (user_signatures).
--
-- Each person who makes quotations uploads a photo of their own signature once, from "My
-- Signature" in the web Leads app. It is printed above their name in the "For Bestserve Pest
-- Management" acceptance box of the quotations they generate. Only the person themselves can
-- upload, see or remove their signature.
--
-- One row per user. The image itself is in MinIO (object_key), like the quotation PDFs.
-- Quotations already generated keep the PDF they were made with.
--
-- New table only - no existing table is changed. Safe to re-run.

CREATE TABLE IF NOT EXISTS `user_signatures` (
  `user_id` BIGINT NOT NULL,
  `object_key` VARCHAR(255) NOT NULL,
  `content_type` VARCHAR(40) NOT NULL,
  `uploaded_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  CONSTRAINT `fk_user_signatures_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

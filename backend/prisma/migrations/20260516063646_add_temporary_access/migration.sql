-- CreateTable
CREATE TABLE `temporary_access` (
    `id` CHAR(36) NOT NULL,
    `job_id` CHAR(36) NOT NULL,
    `created_by_user_id` BIGINT NOT NULL,
    `role_id` INTEGER NOT NULL,
    `worker_name` VARCHAR(255) NULL,
    `phone_number` VARCHAR(20) NULL,
    `otp_hash` VARCHAR(255) NOT NULL,
    `expires_at` DATETIME(0) NOT NULL,
    `used_at` DATETIME(0) NULL,
    `revoked_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_temp_job`(`job_id`),
    INDEX `idx_temp_phone`(`phone_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `temporary_access` ADD CONSTRAINT `temporary_access_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `temporary_access` ADD CONSTRAINT `temporary_access_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

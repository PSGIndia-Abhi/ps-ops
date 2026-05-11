-- phpMyAdmin SQL Dump
-- version 5.2.3
-- https://www.phpmyadmin.net/
--
-- Host: mysql
-- Generation Time: May 08, 2026 at 08:23 PM
-- Server version: 8.4.8
-- PHP Version: 8.3.26

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `ps_ops`
--

-- --------------------------------------------------------

--
-- Table structure for table `bookings`
--

CREATE TABLE `bookings` (
  `id` char(36) NOT NULL,
  `code` varchar(50) NOT NULL,
  `contact_id` char(36) DEFAULT NULL,
  `company_id` char(36) DEFAULT NULL,
  `requested_by_contact_id` char(36) DEFAULT NULL,
  `client_name` varchar(100) DEFAULT NULL,
  `client_type` varchar(30) DEFAULT NULL,
  `service_type` varchar(50) DEFAULT NULL,
  `sub_services` json DEFAULT NULL,
  `notes` text,
  `created_by_user_id` char(36) DEFAULT NULL,
  `status` enum('ACTIVE','CLOSED','CANCELED') DEFAULT 'ACTIVE',
  `created_at` datetime NOT NULL,
  `updated_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `bookings`
--

INSERT INTO `bookings` (`id`, `code`, `contact_id`, `company_id`, `requested_by_contact_id`, `client_name`, `client_type`, `service_type`, `sub_services`, `notes`, `created_by_user_id`, `status`, `created_at`, `updated_at`) VALUES
('70354cdb-d08a-46b1-bdd0-56245c29287c', 'B-1778251772255', '8d2109bc-362b-4b58-92b3-5d5b5609e643', NULL, NULL, NULL, NULL, 'BOTH', '[\"General Pest Control (GPC)\"]', NULL, '1', 'ACTIVE', '2026-05-08 20:19:32', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `branches`
--

CREATE TABLE `branches` (
  `id` char(36) NOT NULL DEFAULT (uuid()),
  `name` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `branches`
--

INSERT INTO `branches` (`id`, `name`, `created_at`) VALUES
('12e69a76-2c18-11f1-9615-72ed8d604cd2', 'Head Office', '2026-04-21 14:59:30');

-- --------------------------------------------------------

--
-- Table structure for table `companies`
--

CREATE TABLE `companies` (
  `id` char(36) NOT NULL,
  `group_id` char(36) DEFAULT NULL,
  `name` varchar(255) NOT NULL,
  `code` varchar(64) DEFAULT NULL,
  `gst_number` varchar(64) DEFAULT NULL,
  `type` enum('CORPORATE','INDIVIDUAL','RWA') DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `logo_object_key` text,
  `logo_file_name` varchar(255) DEFAULT NULL,
  `logo_file_type` varchar(100) DEFAULT NULL,
  `logo_updated_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `contacts`
--

CREATE TABLE `contacts` (
  `id` char(36) NOT NULL,
  `company_id` char(36) DEFAULT NULL COMMENT 'NULL for individual customers, FK for company SPOCs',
  `name` varchar(150) NOT NULL,
  `phone` varchar(20) NOT NULL,
  `email` varchar(150) DEFAULT NULL,
  `role` varchar(100) DEFAULT NULL,
  `is_primary` tinyint(1) DEFAULT '0',
  `is_verified` tinyint(1) DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `branch_id` char(36) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `contacts`
--

INSERT INTO `contacts` (`id`, `company_id`, `name`, `phone`, `email`, `role`, `is_primary`, `is_verified`, `created_at`, `updated_at`, `branch_id`) VALUES
('08661723-44cf-4f1b-b657-57a8df872244', NULL, 'Navin ', '9987474787', NULL, NULL, 0, 1, '2026-05-08 20:02:17', '2026-05-08 20:02:17', '12e69a76-2c18-11f1-9615-72ed8d604cd2'),
('8d2109bc-362b-4b58-92b3-5d5b5609e643', NULL, 'prakash', '8854521125', NULL, NULL, 0, 1, '2026-05-08 20:19:14', '2026-05-08 20:19:14', '12e69a76-2c18-11f1-9615-72ed8d604cd2'),
('9839b12f-ddd3-4b8c-acb1-825905b7bdec', NULL, 'Abhimanu Jha', '08884442615', NULL, NULL, 0, 1, '2026-05-08 19:57:42', '2026-05-08 19:57:42', '12e69a76-2c18-11f1-9615-72ed8d604cd2');

-- --------------------------------------------------------

--
-- Table structure for table `email_otps`
--

CREATE TABLE `email_otps` (
  `id` bigint NOT NULL,
  `email` varchar(255) NOT NULL,
  `otp_code` varchar(10) NOT NULL,
  `expires_at` datetime NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `email_otps`
--

INSERT INTO `email_otps` (`id`, `email`, `otp_code`, `expires_at`, `created_at`) VALUES
(47, 'rgO157655@gmail.com', '439272', '2026-05-08 20:17:56', '2026-05-08 14:37:56');

-- --------------------------------------------------------

--
-- Table structure for table `group_name`
--

CREATE TABLE `group_name` (
  `id` char(36) NOT NULL,
  `name` varchar(255) NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `jobs`
--

CREATE TABLE `jobs` (
  `id` char(36) NOT NULL,
  `code` varchar(50) NOT NULL,
  `booking_id` char(36) DEFAULT NULL,
  `service_type` varchar(50) NOT NULL,
  `sub_service` varchar(100) NOT NULL,
  `status` enum('CREATED','NOT_STARTED','IN_PROGRESS','PAUSED','COMPLETED','CANCELED') NOT NULL DEFAULT 'CREATED',
  `priority` enum('LOW','MEDIUM','HIGH','CRITICAL') NOT NULL DEFAULT 'MEDIUM',
  `supervisor_id` int DEFAULT NULL,
  `assigned_at` datetime DEFAULT NULL,
  `team` json DEFAULT NULL,
  `due_date` datetime DEFAULT NULL,
  `sla_minutes` int DEFAULT NULL,
  `start_date` datetime DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `notes` text,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `requested_by_type` enum('USER','CONTACT') DEFAULT NULL,
  `requested_by_id` char(36) DEFAULT NULL,
  `requested_by_contact_id` char(36) NOT NULL,
  `created_by_user_id` char(36) NOT NULL,
  `approval_status` enum('PENDING','APPROVED','REJECTED') DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `company_id` char(36) DEFAULT NULL,
  `address` text,
  `branch_id` char(36) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `jobs`
--

INSERT INTO `jobs` (`id`, `code`, `booking_id`, `service_type`, `sub_service`, `status`, `priority`, `supervisor_id`, `assigned_at`, `team`, `due_date`, `sla_minutes`, `start_date`, `completed_at`, `notes`, `created_at`, `updated_at`, `requested_by_type`, `requested_by_id`, `requested_by_contact_id`, `created_by_user_id`, `approval_status`, `approved_at`, `company_id`, `address`, `branch_id`) VALUES
('9cc656d7-388c-4bbe-92f3-53b631a61ecc', '2026-1', '70354cdb-d08a-46b1-bdd0-56245c29287c', 'BOTH', 'General Pest Control (GPC)', 'NOT_STARTED', 'MEDIUM', 134, NULL, '[135]', NULL, NULL, '2026-05-08 00:00:00', NULL, NULL, '2026-05-08 20:19:32', '2026-05-08 20:19:32', NULL, NULL, '8d2109bc-362b-4b58-92b3-5d5b5609e643', '1', NULL, NULL, NULL, NULL, '12e69a76-2c18-11f1-9615-72ed8d604cd2');

--
-- Triggers `jobs`
--
DELIMITER $$
CREATE TRIGGER `trg_jobs_inprogress_guard` BEFORE UPDATE ON `jobs` FOR EACH ROW BEGIN
  IF NEW.status = 'IN_PROGRESS'
     AND NEW.supervisor_id IS NULL
     AND (NEW.team IS NULL OR JSON_LENGTH(NEW.team) = 0) THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Cannot set IN_PROGRESS without assignment';
  END IF;
END
$$
DELIMITER ;
DELIMITER $$
CREATE TRIGGER `trg_jobs_inprogress_guard_insert` BEFORE INSERT ON `jobs` FOR EACH ROW BEGIN
  IF NEW.status = 'IN_PROGRESS'
     AND NEW.supervisor_id IS NULL
     AND (NEW.team IS NULL OR JSON_LENGTH(NEW.team) = 0) THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Cannot create IN_PROGRESS job without assignment';
  END IF;
END
$$
DELIMITER ;
DELIMITER $$
CREATE TRIGGER `trg_jobs_requested_by_company_check` BEFORE INSERT ON `jobs` FOR EACH ROW BEGIN
  IF NEW.requested_by_contact_id IS NOT NULL THEN
    -- Corporate job: contact.company_id MUST match job.company_id
    IF NEW.company_id IS NOT NULL AND
       (SELECT company_id FROM contacts WHERE id = NEW.requested_by_contact_id) <> NEW.company_id
    THEN
      SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Requested-by contact does not belong to this company';
    END IF;

    -- Individual job: contact.company_id MUST be NULL
    IF NEW.company_id IS NULL AND
       (SELECT company_id FROM contacts WHERE id = NEW.requested_by_contact_id) IS NOT NULL
    THEN
      SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Company contact cannot request an individual job';
    END IF;
  END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `job_attachments`
--

CREATE TABLE `job_attachments` (
  `id` char(36) NOT NULL,
  `job_id` char(36) NOT NULL,
  `type` varchar(30) NOT NULL,
  `object_key` varchar(255) NOT NULL,
  `created_at` datetime NOT NULL,
  `file_name` varchar(255) DEFAULT NULL,
  `file_type` varchar(100) DEFAULT NULL,
  `file_url` text,
  `history_id` char(36) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `job_comments`
--

CREATE TABLE `job_comments` (
  `id` char(36) NOT NULL,
  `job_id` char(36) NOT NULL,
  `comment` text NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `type` enum('SYSTEM','USER') DEFAULT 'USER'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `job_history`
--

CREATE TABLE `job_history` (
  `id` char(36) NOT NULL,
  `job_id` char(36) NOT NULL,
  `action` varchar(50) NOT NULL,
  `message` text,
  `metadata` json DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `created_by_user_id` char(36) DEFAULT NULL,
  `visible_to_client` tinyint(1) DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `job_history`
--

INSERT INTO `job_history` (`id`, `job_id`, `action`, `message`, `metadata`, `created_at`, `created_by_user_id`, `visible_to_client`) VALUES
('c0c98c83-8858-4fd6-b444-39c89fc87159', '9cc656d7-388c-4bbe-92f3-53b631a61ecc', 'CREATED', 'Job created', NULL, '2026-05-08 20:19:32', '1', 0);

-- --------------------------------------------------------

--
-- Table structure for table `job_tickets`
--

CREATE TABLE `job_tickets` (
  `id` char(36) NOT NULL,
  `subject` varchar(255) NOT NULL,
  `status` enum('OPEN','IN_PROGRESS','RESOLVED','CLOSED') DEFAULT 'OPEN',
  `priority` enum('LOW','MEDIUM','HIGH','URGENT') DEFAULT 'MEDIUM',
  `created_by_user_id` bigint NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `job_ticket_links`
--

CREATE TABLE `job_ticket_links` (
  `id` char(36) NOT NULL,
  `ticket_id` char(36) NOT NULL,
  `job_id` char(36) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `job_ticket_messages`
--

CREATE TABLE `job_ticket_messages` (
  `id` char(36) NOT NULL,
  `ticket_id` char(36) NOT NULL,
  `message` text NOT NULL,
  `created_by_user_id` bigint NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `attachment_key` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `job_visits`
--

CREATE TABLE `job_visits` (
  `id` char(36) NOT NULL,
  `job_id` char(36) NOT NULL,
  `visit_number` int NOT NULL,
  `scheduled_date` datetime DEFAULT NULL,
  `status` enum('SCHEDULED','IN_PROGRESS','AWAITING_APPROVAL','COMPLETED','CANCELED','MISSED') DEFAULT NULL,
  `started_at` datetime DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `notes` text,
  `created_by_user_id` char(36) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `job_visits`
--

INSERT INTO `job_visits` (`id`, `job_id`, `visit_number`, `scheduled_date`, `status`, `started_at`, `completed_at`, `notes`, `created_by_user_id`, `created_at`, `updated_at`) VALUES
('71153e36-5579-4047-b7d1-4e784a8dcc7c', '9cc656d7-388c-4bbe-92f3-53b631a61ecc', 1, '2026-05-08 20:19:00', 'SCHEDULED', NULL, NULL, NULL, '1', '2026-05-08 20:19:32', '2026-05-08 20:19:32');

-- --------------------------------------------------------

--
-- Table structure for table `notifications`
--

CREATE TABLE `notifications` (
  `id` char(36) NOT NULL,
  `user_id` varchar(50) DEFAULT NULL,
  `type` varchar(50) DEFAULT NULL,
  `title` varchar(255) DEFAULT NULL,
  `message` text,
  `entity_type` varchar(50) DEFAULT NULL,
  `entity_id` varchar(50) DEFAULT NULL,
  `is_read` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `notifications`
--

INSERT INTO `notifications` (`id`, `user_id`, `type`, `title`, `message`, `entity_type`, `entity_id`, `is_read`, `created_at`) VALUES
('737fab95-8ee9-487c-9802-74829641b3d9', '134', 'JOB_CREATED', 'New job created: 2026-1', 'General Pest Control (GPC) was created for Head Office.', 'job', '9cc656d7-388c-4bbe-92f3-53b631a61ecc', 0, '2026-05-08 14:49:32'),
('9127bdd3-dc83-458c-94dd-58814fa7632f', '135', 'JOB_CREATED', 'New job created: 2026-1', 'General Pest Control (GPC) was created for Head Office.', 'job', '9cc656d7-388c-4bbe-92f3-53b631a61ecc', 0, '2026-05-08 14:49:32'),
('b5983298-8ac7-4d32-8222-34452af5f131', '1', 'JOB_CREATED', 'New job created: 2026-1', 'General Pest Control (GPC) was created for Head Office.', 'job', '9cc656d7-388c-4bbe-92f3-53b631a61ecc', 0, '2026-05-08 14:49:32');

-- --------------------------------------------------------

--
-- Table structure for table `recurring_rules`
--

CREATE TABLE `recurring_rules` (
  `id` char(36) NOT NULL,
  `booking_id` char(36) NOT NULL,
  `supervisor_id` int DEFAULT NULL,
  `team` json DEFAULT NULL,
  `frequency` enum('WEEKLY','MONTHLY','CUSTOM_DAYS') NOT NULL,
  `interval_value` int NOT NULL DEFAULT '1',
  `day_of_week` int DEFAULT NULL,
  `week_of_month` tinyint DEFAULT NULL,
  `days_of_week` json DEFAULT NULL,
  `day_of_month` int DEFAULT NULL,
  `start_date` date NOT NULL,
  `end_date` date DEFAULT NULL,
  `last_generated_until` date DEFAULT NULL,
  `scheduled_time` time DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `sequences`
--

CREATE TABLE `sequences` (
  `name` varchar(50) NOT NULL,
  `value` int NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `sequences`
--

INSERT INTO `sequences` (`name`, `value`) VALUES
('job_code', 1);

-- --------------------------------------------------------

--
-- Table structure for table `sites`
--

CREATE TABLE `sites` (
  `id` char(36) NOT NULL,
  `company_id` char(36) DEFAULT NULL,
  `branch_id` char(36) DEFAULT NULL,
  `address` text,
  `city` varchar(100) DEFAULT NULL,
  `state` varchar(100) DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `name` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `supervisors`
--

CREATE TABLE `supervisors` (
  `id` varchar(50) NOT NULL,
  `name` varchar(100) NOT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `supervisor_technicians`
--

CREATE TABLE `supervisor_technicians` (
  `id` char(36) NOT NULL,
  `supervisor_id` bigint NOT NULL,
  `technician_id` bigint NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `ticket_attachments`
--

CREATE TABLE `ticket_attachments` (
  `id` char(36) NOT NULL,
  `ticket_id` char(36) NOT NULL,
  `message_id` char(36) DEFAULT NULL,
  `object_key` varchar(255) NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` bigint NOT NULL,
  `name` varchar(100) NOT NULL,
  `email` varchar(150) NOT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `password_hash` varchar(255) DEFAULT NULL,
  `role` enum('admin','client','technician','supervisor','telecaller','branch_admin') NOT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `contact_id` char(36) DEFAULT NULL,
  `invite_status` enum('INVITED','ACTIVE') DEFAULT NULL,
  `invite_token` varchar(255) DEFAULT NULL,
  `invite_expiry` datetime DEFAULT NULL,
  `branch_id` char(36) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`id`, `name`, `email`, `phone`, `password_hash`, `role`, `is_active`, `created_at`, `updated_at`, `contact_id`, `invite_status`, `invite_token`, `invite_expiry`, `branch_id`) VALUES
(1, 'Admin Main', 'admin@psops.com', '7778899887', '$2b$10$jokhppcJvUiUJW5YWQAD9eJu5rc5xjkay2hhbTkyiIeDbpBjS8ph6', 'admin', 1, '2025-12-13 11:32:47', '2026-04-21 14:59:39', NULL, NULL, NULL, NULL, '12e69a76-2c18-11f1-9615-72ed8d604cd2'),
(134, 'Anup', 'anup@headoffice.local', '9876543210', '$2b$10$wH8K8QF8mWQzQKJ0W8Qm9eK4iK1Z9WQ5jX6lY8rA1QpM7nJxYkT2S', 'supervisor', 1, '2026-05-08 14:30:42', '2026-05-08 14:30:42', NULL, 'ACTIVE', NULL, NULL, '12e69a76-2c18-11f1-9615-72ed8d604cd2'),
(135, 'Basvaraj', 'basvaraj@headoffice.local', '9876543211', '$2b$10$wH8K8QF8mWQzQKJ0W8Qm9eK4iK1Z9WQ5jX6lY8rA1QpM7nJxYkT2S', 'technician', 1, '2026-05-08 14:30:42', '2026-05-08 14:30:42', NULL, 'ACTIVE', NULL, NULL, '12e69a76-2c18-11f1-9615-72ed8d604cd2');

-- --------------------------------------------------------

--
-- Table structure for table `visit_technicians`
--

CREATE TABLE `visit_technicians` (
  `id` char(36) NOT NULL,
  `visit_id` char(36) NOT NULL,
  `technician_id` bigint NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `visit_technicians`
--

INSERT INTO `visit_technicians` (`id`, `visit_id`, `technician_id`, `created_at`) VALUES
('46367ca8-ea38-40b8-afb7-af3744f655fa', '71153e36-5579-4047-b7d1-4e784a8dcc7c', 135, '2026-05-08 14:49:32');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `bookings`
--
ALTER TABLE `bookings`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `branches`
--
ALTER TABLE `branches`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `companies`
--
ALTER TABLE `companies`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_companies_group_id` (`group_id`);

--
-- Indexes for table `contacts`
--
ALTER TABLE `contacts`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_contact` (`phone`,`company_id`),
  ADD KEY `idx_contacts_company` (`company_id`),
  ADD KEY `idx_contacts_branch_id` (`branch_id`);

--
-- Indexes for table `email_otps`
--
ALTER TABLE `email_otps`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_email` (`email`);

--
-- Indexes for table `group_name`
--
ALTER TABLE `group_name`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_groups_name` (`name`);

--
-- Indexes for table `jobs`
--
ALTER TABLE `jobs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_jobs_company` (`company_id`),
  ADD KEY `idx_jobs_branch_id` (`branch_id`);

--
-- Indexes for table `job_attachments`
--
ALTER TABLE `job_attachments`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `job_comments`
--
ALTER TABLE `job_comments`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `job_history`
--
ALTER TABLE `job_history`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `job_tickets`
--
ALTER TABLE `job_tickets`
  ADD PRIMARY KEY (`id`),
  ADD KEY `created_by_user_id` (`created_by_user_id`);

--
-- Indexes for table `job_ticket_links`
--
ALTER TABLE `job_ticket_links`
  ADD PRIMARY KEY (`id`),
  ADD KEY `ticket_id` (`ticket_id`),
  ADD KEY `job_id` (`job_id`);

--
-- Indexes for table `job_ticket_messages`
--
ALTER TABLE `job_ticket_messages`
  ADD PRIMARY KEY (`id`),
  ADD KEY `ticket_id` (`ticket_id`),
  ADD KEY `fk_message_user` (`created_by_user_id`);

--
-- Indexes for table `job_visits`
--
ALTER TABLE `job_visits`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_job_visit` (`job_id`,`visit_number`),
  ADD KEY `idx_visits_job` (`job_id`),
  ADD KEY `idx_visits_date` (`scheduled_date`),
  ADD KEY `idx_visits_status` (`status`);

--
-- Indexes for table `notifications`
--
ALTER TABLE `notifications`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `recurring_rules`
--
ALTER TABLE `recurring_rules`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_recurring_rules_booking` (`booking_id`);

--
-- Indexes for table `sequences`
--
ALTER TABLE `sequences`
  ADD PRIMARY KEY (`name`);

--
-- Indexes for table `sites`
--
ALTER TABLE `sites`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_companies_code_site` (`name`),
  ADD UNIQUE KEY `uniq_sites_company_name` (`company_id`,`name`),
  ADD KEY `fk_companies_branch` (`branch_id`),
  ADD KEY `idx_sites_company_id` (`company_id`);

--
-- Indexes for table `supervisors`
--
ALTER TABLE `supervisors`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `supervisor_technicians`
--
ALTER TABLE `supervisor_technicians`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_pair` (`supervisor_id`,`technician_id`),
  ADD UNIQUE KEY `uniq_supervisor_technician` (`technician_id`);

--
-- Indexes for table `ticket_attachments`
--
ALTER TABLE `ticket_attachments`
  ADD PRIMARY KEY (`id`),
  ADD KEY `ticket_id` (`ticket_id`),
  ADD KEY `message_id` (`message_id`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`),
  ADD KEY `fk_users_branch` (`branch_id`);

--
-- Indexes for table `visit_technicians`
--
ALTER TABLE `visit_technicians`
  ADD PRIMARY KEY (`id`),
  ADD KEY `visit_id` (`visit_id`),
  ADD KEY `technician_id` (`technician_id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `email_otps`
--
ALTER TABLE `email_otps`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=48;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=136;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `companies`
--
ALTER TABLE `companies`
  ADD CONSTRAINT `fk_companies_group` FOREIGN KEY (`group_id`) REFERENCES `group_name` (`id`);

--
-- Constraints for table `contacts`
--
ALTER TABLE `contacts`
  ADD CONSTRAINT `fk_contacts_company` FOREIGN KEY (`company_id`) REFERENCES `sites` (`id`);

--
-- Constraints for table `jobs`
--
ALTER TABLE `jobs`
  ADD CONSTRAINT `fk_jobs_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_jobs_company` FOREIGN KEY (`company_id`) REFERENCES `sites` (`id`);

--
-- Constraints for table `job_tickets`
--
ALTER TABLE `job_tickets`
  ADD CONSTRAINT `fk_ticket_user` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `job_ticket_links`
--
ALTER TABLE `job_ticket_links`
  ADD CONSTRAINT `job_ticket_links_ibfk_1` FOREIGN KEY (`ticket_id`) REFERENCES `job_tickets` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `job_ticket_links_ibfk_2` FOREIGN KEY (`job_id`) REFERENCES `jobs` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `job_ticket_messages`
--
ALTER TABLE `job_ticket_messages`
  ADD CONSTRAINT `fk_message_ticket` FOREIGN KEY (`ticket_id`) REFERENCES `job_tickets` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_message_user` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `job_visits`
--
ALTER TABLE `job_visits`
  ADD CONSTRAINT `fk_visit_job` FOREIGN KEY (`job_id`) REFERENCES `jobs` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `recurring_rules`
--
ALTER TABLE `recurring_rules`
  ADD CONSTRAINT `fk_recurring_rules_booking` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `sites`
--
ALTER TABLE `sites`
  ADD CONSTRAINT `fk_companies_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

--
-- Constraints for table `supervisor_technicians`
--
ALTER TABLE `supervisor_technicians`
  ADD CONSTRAINT `supervisor_technicians_ibfk_1` FOREIGN KEY (`supervisor_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `supervisor_technicians_ibfk_2` FOREIGN KEY (`technician_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `ticket_attachments`
--
ALTER TABLE `ticket_attachments`
  ADD CONSTRAINT `ticket_attachments_ibfk_1` FOREIGN KEY (`ticket_id`) REFERENCES `job_tickets` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `ticket_attachments_ibfk_2` FOREIGN KEY (`message_id`) REFERENCES `job_ticket_messages` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `users`
--
ALTER TABLE `users`
  ADD CONSTRAINT `fk_users_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE SET NULL;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;

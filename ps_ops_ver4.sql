-- phpMyAdmin SQL Dump
-- version 5.2.3
-- https://www.phpmyadmin.net/
--
-- Host: mysql
-- Generation Time: Apr 06, 2026 at 01:57 PM
-- Server version: 8.4.7
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
('091d720b-737d-4d54-a181-7f55f0df9a22', 'B-1775050118430', '98d129ca-2e27-49ac-874a-1fb4272c9b09', 'ab287c39-3d93-40b3-840d-3f0576f59122', NULL, NULL, NULL, 'BOTH', '[\"Bed Bug Control\"]', NULL, '1', 'ACTIVE', '2026-04-01 18:58:38', NULL),
('26258cc4-5be7-4f5a-8ed9-178727ce8f0c', 'B-1775050257607', '98d129ca-2e27-49ac-874a-1fb4272c9b09', 'ab287c39-3d93-40b3-840d-3f0576f59122', NULL, NULL, NULL, 'BOTH', '[\"Bed Bug Control\"]', NULL, '1', 'ACTIVE', '2026-04-01 19:00:57', NULL),
('3f7d8bd4-7fb8-4f2e-95b2-1fa9840a6dfe', 'B-1775057303173', 'e7a4124c-5e36-40c0-a3fd-414edd162d67', '8a631b2f-650c-4874-90f4-af1161c2666c', NULL, NULL, NULL, 'PEST', '[\"Mosquito Control\"]', NULL, '122', 'ACTIVE', '2026-04-01 20:58:23', NULL),
('40eb84b0-06e5-4d8e-9db5-12cff25f2d62', 'B-1775057137410', 'e7a4124c-5e36-40c0-a3fd-414edd162d67', '8a631b2f-650c-4874-90f4-af1161c2666c', NULL, NULL, NULL, 'PEST', '[\"Cockroach Control\", \"Rodent Control\"]', NULL, '122', 'ACTIVE', '2026-04-01 20:55:37', NULL),
('87b3e44c-01e2-4794-9072-b4578ee6ae91', 'B-1775192276025', 'bd9a387b-6daa-4647-890d-ae4a186858ef', NULL, NULL, NULL, NULL, 'BOTH', '[\"Cockroach Control\"]', NULL, '1', 'ACTIVE', '2026-04-03 10:27:56', NULL),
('bc0e69f0-3211-42e0-9098-6ad335cc7e3e', 'B-1775051849296', '98d129ca-2e27-49ac-874a-1fb4272c9b09', 'ab287c39-3d93-40b3-840d-3f0576f59122', NULL, NULL, NULL, 'BOTH', '[\"Sofa Cleaning\"]', NULL, '1', 'ACTIVE', '2026-04-01 19:27:29', NULL),
('df590b03-3346-4275-a21e-3c713c263acd', 'B-1775194266368', 'bd9a387b-6daa-4647-890d-ae4a186858ef', NULL, NULL, NULL, NULL, 'BOTH', '[\"Full Home Cleaning\"]', NULL, '1', 'ACTIVE', '2026-04-03 11:01:06', NULL),
('f4aae54b-0c7c-4d8c-b67e-fda044965ee5', 'B-1775045949570', '98d129ca-2e27-49ac-874a-1fb4272c9b09', 'ab287c39-3d93-40b3-840d-3f0576f59122', NULL, NULL, NULL, 'BOTH', '[\"Cockroach Control\"]', NULL, '1', 'ACTIVE', '2026-04-01 17:49:09', NULL);

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
('12e69a76-2c18-11f1-9615-72ed8d604cd2', 'Head Office - Jayanagar Bangalore', '2026-03-30 09:08:53'),
('718e62f4-a8f0-49d3-8525-e061c6688b39', 'Whitefield Branch', '2026-03-31 13:24:42'),
('dd174504-4520-4e94-8d2a-5ee8f47c10da', 'Goa state', '2026-04-01 15:06:22');

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

--
-- Dumping data for table `companies`
--

INSERT INTO `companies` (`id`, `group_id`, `name`, `code`, `gst_number`, `type`, `is_active`, `created_at`, `logo_object_key`, `logo_file_name`, `logo_file_type`, `logo_updated_at`) VALUES
('3d576a65-270f-4377-babc-9aa6c96abdf2', 'dc8dbcc0-a339-4019-8d93-65bb3206015d', 'Test Company 1', NULL, NULL, 'CORPORATE', 1, '2026-04-01 16:52:35', NULL, NULL, NULL, NULL),
('9e0b3dec-2559-44cd-94f0-50d5885896ab', NULL, 'Test4-companylogofile', NULL, 'test4', 'CORPORATE', 1, '2026-04-03 15:44:49', 'companies/9e0b3dec-2559-44cd-94f0-50d5885896ab/logo/aea51ef4-f2f8-4edb-8933-c5459ec17ef1.png', 'Infinite Atelier@2x.png', 'image/png', '2026-04-03 15:44:49'),
('b0f17486-efdb-4857-8b4d-7fee10ecb412', 'dc8dbcc0-a339-4019-8d93-65bb3206015d', 'Test Company 2', NULL, NULL, 'CORPORATE', 1, '2026-04-01 16:57:54', 'companies/b0f17486-efdb-4857-8b4d-7fee10ecb412/logo/111c2fb8-a420-400b-8515-2ccc6b6e488e.png', 'Infinite Atelier@2x.png', 'image/png', '2026-04-01 16:57:54'),
('bc5a93ba-5f0c-4cfd-864a-c57b1c4e7f27', '4c64bd3d-0e94-4da7-90b3-fe55e7a5c2de', 'Big Daddy Goa', NULL, '28AAFCB0465J2ZK', 'CORPORATE', 1, '2026-04-01 20:49:05', 'companies/bc5a93ba-5f0c-4cfd-864a-c57b1c4e7f27/logo/75ae34a9-ffb9-44f3-b509-c1fc2e0e4db6.png', 'Infinite Atelier Structure Horizontal@2x.png', 'image/png', '2026-04-01 20:49:05'),
('e25724e3-6c6b-4f8b-b119-19e32816513d', NULL, 'Test 3', NULL, 'no-group-company-test', 'CORPORATE', 1, '2026-04-03 15:35:36', 'companies/e25724e3-6c6b-4f8b-b119-19e32816513d/logo/bc821217-2dee-4b43-8f8f-c0a3b8c5fc9c.png', 'Logo@2x.png', 'image/png', '2026-04-03 15:35:36'),
('ff49c12b-e28b-4dfd-8faa-9d27fc3c5054', NULL, 'test 5-companylogo', NULL, 'test with reset function', 'CORPORATE', 1, '2026-04-03 15:46:29', 'companies/ff49c12b-e28b-4dfd-8faa-9d27fc3c5054/logo/7da5c26d-47ab-48c8-bcb1-5e72ef0cf592.png', 'Artboard 1 copy 3@2x.png', 'image/png', '2026-04-03 15:46:29');

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
('98d129ca-2e27-49ac-874a-1fb4272c9b09', 'ab287c39-3d93-40b3-840d-3f0576f59122', 'TEst contact 1', '9987474787', 'testcontact1@gemail.con', NULL, 0, 1, '2026-04-01 17:19:54', '2026-04-01 17:19:54', '12e69a76-2c18-11f1-9615-72ed8d604cd2'),
('bd9a387b-6daa-4647-890d-ae4a186858ef', NULL, 'Test Individual', '8877959874', 'test_Individual@test.com', NULL, 0, 1, '2026-04-03 10:27:42', '2026-04-03 10:27:42', '12e69a76-2c18-11f1-9615-72ed8d604cd2'),
('e7a4124c-5e36-40c0-a3fd-414edd162d67', '8a631b2f-650c-4874-90f4-af1161c2666c', 'Rakesh', '8884442605', 'rakesh@bigdaddy.com', 'Purvhase Head', 1, 1, '2026-04-01 20:53:02', '2026-04-01 20:53:02', 'dd174504-4520-4e94-8d2a-5ee8f47c10da');

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
(1, 'abhipsindia@gmail.com', '550440', '2026-02-06 13:32:55', '2026-02-06 13:22:55'),
(2, 'abhipsindia@gmail.com', '979121', '2026-02-06 13:33:19', '2026-02-06 13:23:19'),
(3, 'abhipsindia@gmail.com', '996659', '2026-02-06 13:34:14', '2026-02-06 13:24:14'),
(4, 'abhipsindia@gmail.com', '260643', '2026-02-06 13:36:43', '2026-02-06 13:26:42'),
(5, 'Testuser1@ps-ops.com', '673575', '2026-02-09 14:56:03', '2026-02-09 14:46:03'),
(6, 'Testuser1@ps-ops.com', '604432', '2026-02-09 14:56:05', '2026-02-09 14:46:04'),
(7, 'test1@psops.com', '237544', '2026-02-09 14:56:30', '2026-02-09 14:46:30'),
(8, 'testuser3@psops.com', '248755', '2026-02-09 15:01:04', '2026-02-09 14:51:03'),
(9, 'min@psops.com', '368753', '2026-02-09 15:01:44', '2026-02-09 14:51:44'),
(10, 'adin@psops.com', '171399', '2026-02-09 15:02:50', '2026-02-09 14:52:50'),
(11, 'test1@psops.com', '179894', '2026-02-11 06:02:18', '2026-02-11 05:52:18'),
(12, 'test3@gtest.com', '798698', '2026-02-11 08:16:54', '2026-02-11 08:06:53'),
(13, 'test111n@psops.com', '806305', '2026-02-11 08:35:20', '2026-02-11 08:25:20'),
(14, 'adm23@psops.com', '234160', '2026-02-11 08:36:14', '2026-02-11 08:26:14'),
(15, 'aqwewdmin@psops.com', '200184', '2026-02-11 08:41:32', '2026-02-11 08:31:31'),
(16, 'testoingmin@psops.com', '654177', '2026-02-11 08:51:35', '2026-02-11 08:41:34'),
(17, 'admiweewqqn@psops.com', '900508', '2026-02-11 08:55:07', '2026-02-11 08:45:06'),
(18, 'attt111dmin@psops.com', '115776', '2026-02-11 08:55:50', '2026-02-11 08:45:50'),
(19, 'adadmwewein@psops.com', '319500', '2026-02-11 09:06:11', '2026-02-11 08:56:11'),
(20, 'test@abhi1.com', '778372', '2026-02-11 09:07:02', '2026-02-11 08:57:01'),
(21, 'Testuseer1@psops.com', '571569', '2026-02-11 09:11:54', '2026-02-11 09:01:54'),
(22, 'adtest1min@psops.com', '710557', '2026-02-11 09:13:03', '2026-02-11 09:03:03');

-- --------------------------------------------------------

--
-- Table structure for table `group_name`
--

CREATE TABLE `group_name` (
  `id` char(36) NOT NULL,
  `name` varchar(255) NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `group_name`
--

INSERT INTO `group_name` (`id`, `name`, `created_at`) VALUES
('4c64bd3d-0e94-4da7-90b3-fe55e7a5c2de', 'Big Daddy', '2026-04-01 20:47:53'),
('dc8dbcc0-a339-4019-8d93-65bb3206015d', 'Test group 1', '2026-04-01 16:51:37');

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
('05bcc5c0-d5e7-42d6-b2e9-bb8b3dfe1a0b', '2026-11', 'f4aae54b-0c7c-4d8c-b67e-fda044965ee5', 'BOTH', 'Cockroach Control', 'NOT_STARTED', 'MEDIUM', 120, NULL, '[121]', '2026-04-21 00:00:00', NULL, '2026-04-21 00:00:00', NULL, NULL, '2026-04-01 17:49:09', '2026-04-01 18:37:29', NULL, NULL, '98d129ca-2e27-49ac-874a-1fb4272c9b09', '1', NULL, NULL, 'ab287c39-3d93-40b3-840d-3f0576f59122', NULL, '12e69a76-2c18-11f1-9615-72ed8d604cd2'),
('0883db18-3350-4fb8-8af8-77bebd1506f8', '2026-19', '40eb84b0-06e5-4d8e-9db5-12cff25f2d62', 'PEST', 'Rodent Control', 'CREATED', 'MEDIUM', NULL, NULL, '[]', NULL, NULL, '2026-04-01 00:00:00', NULL, NULL, '2026-04-01 20:55:37', '2026-04-01 20:55:37', NULL, NULL, 'e7a4124c-5e36-40c0-a3fd-414edd162d67', '122', NULL, NULL, '8a631b2f-650c-4874-90f4-af1161c2666c', 'Goa Central, Goa, Goa', 'dd174504-4520-4e94-8d2a-5ee8f47c10da'),
('088a331b-9b09-4f77-b17e-097842201175', '2026-55', '87b3e44c-01e2-4794-9072-b4578ee6ae91', 'BOTH', 'Cockroach Control', 'CREATED', 'MEDIUM', NULL, NULL, '[]', NULL, NULL, '2026-04-04 00:00:00', NULL, NULL, '2026-04-03 10:27:56', '2026-04-03 10:27:56', NULL, NULL, 'bd9a387b-6daa-4647-890d-ae4a186858ef', '1', NULL, NULL, NULL, NULL, '12e69a76-2c18-11f1-9615-72ed8d604cd2'),
('0dbe0dc3-a06c-4854-a5ed-f1b722e2dc25', '2026-50', '3f7d8bd4-7fb8-4f2e-95b2-1fa9840a6dfe', 'PEST', 'Mosquito Control', 'NOT_STARTED', 'MEDIUM', NULL, NULL, '[]', '2026-04-26 00:00:00', NULL, '2026-04-26 00:00:00', NULL, NULL, '2026-04-01 20:58:23', '2026-04-01 20:58:23', NULL, NULL, 'e7a4124c-5e36-40c0-a3fd-414edd162d67', '122', NULL, NULL, '8a631b2f-650c-4874-90f4-af1161c2666c', NULL, 'dd174504-4520-4e94-8d2a-5ee8f47c10da'),
('12ea4f4f-7526-4801-90a2-edd2bd6dfc5f', '2026-43', '3f7d8bd4-7fb8-4f2e-95b2-1fa9840a6dfe', 'PEST', 'Mosquito Control', 'NOT_STARTED', 'MEDIUM', NULL, NULL, '[]', '2026-04-18 00:00:00', NULL, '2026-04-18 00:00:00', NULL, NULL, '2026-04-01 20:58:23', '2026-04-01 20:58:23', NULL, NULL, 'e7a4124c-5e36-40c0-a3fd-414edd162d67', '122', NULL, NULL, '8a631b2f-650c-4874-90f4-af1161c2666c', NULL, 'dd174504-4520-4e94-8d2a-5ee8f47c10da'),
('13272a0d-e6a8-4ebe-96df-412f8719b5db', '2026-36', '3f7d8bd4-7fb8-4f2e-95b2-1fa9840a6dfe', 'PEST', 'Mosquito Control', 'NOT_STARTED', 'MEDIUM', NULL, NULL, '[]', '2026-04-10 00:00:00', NULL, '2026-04-10 00:00:00', NULL, NULL, '2026-04-01 20:58:23', '2026-04-01 20:58:23', NULL, NULL, 'e7a4124c-5e36-40c0-a3fd-414edd162d67', '122', NULL, NULL, '8a631b2f-650c-4874-90f4-af1161c2666c', NULL, 'dd174504-4520-4e94-8d2a-5ee8f47c10da'),
('140460d9-7aed-4cfe-9822-69bfc88c9eb4', '2026-21', '40eb84b0-06e5-4d8e-9db5-12cff25f2d62', 'PEST', 'Rodent Control', 'NOT_STARTED', 'MEDIUM', NULL, NULL, '[]', '2026-04-04 00:00:00', NULL, '2026-04-04 00:00:00', NULL, NULL, '2026-04-01 20:55:37', '2026-04-01 20:55:37', NULL, NULL, 'e7a4124c-5e36-40c0-a3fd-414edd162d67', '122', NULL, NULL, '8a631b2f-650c-4874-90f4-af1161c2666c', NULL, 'dd174504-4520-4e94-8d2a-5ee8f47c10da'),
('14f31df9-5a77-4e7f-a33f-d43c7402378c', '2026-56', 'df590b03-3346-4275-a21e-3c713c263acd', 'BOTH', 'Full Home Cleaning', 'CREATED', 'MEDIUM', NULL, NULL, '[]', NULL, NULL, '2026-04-04 00:00:00', NULL, NULL, '2026-04-03 11:01:06', '2026-04-03 11:01:06', NULL, NULL, 'bd9a387b-6daa-4647-890d-ae4a186858ef', '1', NULL, NULL, NULL, NULL, '12e69a76-2c18-11f1-9615-72ed8d604cd2'),
('1896e665-389f-4d53-b0db-b5e8317a39a2', '2026-54', '3f7d8bd4-7fb8-4f2e-95b2-1fa9840a6dfe', 'PEST', 'Mosquito Control', 'NOT_STARTED', 'MEDIUM', NULL, NULL, '[]', '2026-05-01 00:00:00', NULL, '2026-05-01 00:00:00', NULL, NULL, '2026-04-01 20:58:23', '2026-04-01 20:58:23', NULL, NULL, 'e7a4124c-5e36-40c0-a3fd-414edd162d67', '122', NULL, NULL, '8a631b2f-650c-4874-90f4-af1161c2666c', NULL, 'dd174504-4520-4e94-8d2a-5ee8f47c10da'),
('1ea824c2-e8c5-4a59-9214-d2ab8b6cd8aa', '2026-26', '40eb84b0-06e5-4d8e-9db5-12cff25f2d62', 'PEST', 'Cockroach Control', 'NOT_STARTED', 'MEDIUM', NULL, NULL, '[]', '2026-04-25 00:00:00', NULL, '2026-04-25 00:00:00', NULL, NULL, '2026-04-01 20:55:37', '2026-04-01 20:55:37', NULL, NULL, 'e7a4124c-5e36-40c0-a3fd-414edd162d67', '122', NULL, NULL, '8a631b2f-650c-4874-90f4-af1161c2666c', NULL, 'dd174504-4520-4e94-8d2a-5ee8f47c10da'),
('223e90ee-06a1-4f32-a2f3-492bdf5c9e56', '2026-48', '3f7d8bd4-7fb8-4f2e-95b2-1fa9840a6dfe', 'PEST', 'Mosquito Control', 'NOT_STARTED', 'MEDIUM', NULL, NULL, '[]', '2026-04-24 00:00:00', NULL, '2026-04-24 00:00:00', NULL, NULL, '2026-04-01 20:58:23', '2026-04-01 20:58:23', NULL, NULL, 'e7a4124c-5e36-40c0-a3fd-414edd162d67', '122', NULL, NULL, '8a631b2f-650c-4874-90f4-af1161c2666c', NULL, 'dd174504-4520-4e94-8d2a-5ee8f47c10da'),
('2312683c-65c1-49df-a0c1-5dc157696a5e', '2026-42', '3f7d8bd4-7fb8-4f2e-95b2-1fa9840a6dfe', 'PEST', 'Mosquito Control', 'NOT_STARTED', 'MEDIUM', NULL, NULL, '[]', '2026-04-17 00:00:00', NULL, '2026-04-17 00:00:00', NULL, NULL, '2026-04-01 20:58:23', '2026-04-01 20:58:23', NULL, NULL, 'e7a4124c-5e36-40c0-a3fd-414edd162d67', '122', NULL, NULL, '8a631b2f-650c-4874-90f4-af1161c2666c', NULL, 'dd174504-4520-4e94-8d2a-5ee8f47c10da'),
('260a87d0-2cc7-4a27-a293-264f99512f8f', '2026-22', '40eb84b0-06e5-4d8e-9db5-12cff25f2d62', 'PEST', 'Cockroach Control', 'NOT_STARTED', 'MEDIUM', NULL, NULL, '[]', '2026-04-11 00:00:00', NULL, '2026-04-11 00:00:00', NULL, NULL, '2026-04-01 20:55:37', '2026-04-01 20:55:37', NULL, NULL, 'e7a4124c-5e36-40c0-a3fd-414edd162d67', '122', NULL, NULL, '8a631b2f-650c-4874-90f4-af1161c2666c', NULL, 'dd174504-4520-4e94-8d2a-5ee8f47c10da'),
('344b9d82-c233-4b1d-abc3-f9c381b6f218', '2026-41', '3f7d8bd4-7fb8-4f2e-95b2-1fa9840a6dfe', 'PEST', 'Mosquito Control', 'NOT_STARTED', 'MEDIUM', NULL, NULL, '[]', '2026-04-16 00:00:00', NULL, '2026-04-16 00:00:00', NULL, NULL, '2026-04-01 20:58:23', '2026-04-01 20:58:23', NULL, NULL, 'e7a4124c-5e36-40c0-a3fd-414edd162d67', '122', NULL, NULL, '8a631b2f-650c-4874-90f4-af1161c2666c', NULL, 'dd174504-4520-4e94-8d2a-5ee8f47c10da'),
('353a988b-f5e3-4cb5-934a-d36c6afe6a88', '2026-8', 'f4aae54b-0c7c-4d8c-b67e-fda044965ee5', 'BOTH', 'Cockroach Control', 'NOT_STARTED', 'MEDIUM', 120, NULL, '[121]', '2026-04-14 00:00:00', NULL, '2026-04-14 00:00:00', NULL, NULL, '2026-04-01 17:49:09', '2026-04-01 18:18:54', NULL, NULL, '98d129ca-2e27-49ac-874a-1fb4272c9b09', '1', NULL, NULL, 'ab287c39-3d93-40b3-840d-3f0576f59122', NULL, '12e69a76-2c18-11f1-9615-72ed8d604cd2'),
('38d08a5f-8683-43c2-875c-e27a4958752f', '2026-49', '3f7d8bd4-7fb8-4f2e-95b2-1fa9840a6dfe', 'PEST', 'Mosquito Control', 'NOT_STARTED', 'MEDIUM', NULL, NULL, '[]', '2026-04-25 00:00:00', NULL, '2026-04-25 00:00:00', NULL, NULL, '2026-04-01 20:58:23', '2026-04-01 20:58:23', NULL, NULL, 'e7a4124c-5e36-40c0-a3fd-414edd162d67', '122', NULL, NULL, '8a631b2f-650c-4874-90f4-af1161c2666c', NULL, 'dd174504-4520-4e94-8d2a-5ee8f47c10da'),
('40649193-7739-4564-a7fa-b86107a0112b', '2026-16', '26258cc4-5be7-4f5a-8ed9-178727ce8f0c', 'BOTH', 'Bed Bug Control', 'NOT_STARTED', 'MEDIUM', 120, NULL, '[121]', NULL, NULL, '2026-04-02 00:00:00', NULL, NULL, '2026-04-01 19:00:57', '2026-04-01 19:23:35', NULL, NULL, '98d129ca-2e27-49ac-874a-1fb4272c9b09', '1', NULL, NULL, 'ab287c39-3d93-40b3-840d-3f0576f59122', NULL, '12e69a76-2c18-11f1-9615-72ed8d604cd2'),
('412271c5-7e0e-4cfa-95a3-d70919e7609d', '2026-59', '3f7d8bd4-7fb8-4f2e-95b2-1fa9840a6dfe', 'PEST', 'Mosquito Control', 'NOT_STARTED', 'MEDIUM', 125, NULL, '[123]', '2026-05-02 00:00:00', NULL, '2026-05-02 00:00:00', NULL, NULL, '2026-04-03 12:54:45', '2026-04-03 12:54:45', NULL, NULL, 'e7a4124c-5e36-40c0-a3fd-414edd162d67', '122', NULL, NULL, '8a631b2f-650c-4874-90f4-af1161c2666c', NULL, 'dd174504-4520-4e94-8d2a-5ee8f47c10da'),
('42da5535-4317-4298-b85c-1d8879d0c79d', '2026-4', 'f4aae54b-0c7c-4d8c-b67e-fda044965ee5', 'BOTH', 'Cockroach Control', 'NOT_STARTED', 'MEDIUM', 120, NULL, '[121]', '2026-04-06 00:00:00', NULL, '2026-04-06 00:00:00', NULL, NULL, '2026-04-01 17:49:09', '2026-04-01 18:18:54', NULL, NULL, '98d129ca-2e27-49ac-874a-1fb4272c9b09', '1', NULL, NULL, 'ab287c39-3d93-40b3-840d-3f0576f59122', NULL, '12e69a76-2c18-11f1-9615-72ed8d604cd2'),
('454f167b-ecb2-48f4-8428-7c2d07d7c506', '2026-40', '3f7d8bd4-7fb8-4f2e-95b2-1fa9840a6dfe', 'PEST', 'Mosquito Control', 'NOT_STARTED', 'MEDIUM', NULL, NULL, '[]', '2026-04-15 00:00:00', NULL, '2026-04-15 00:00:00', NULL, NULL, '2026-04-01 20:58:23', '2026-04-01 20:58:23', NULL, NULL, 'e7a4124c-5e36-40c0-a3fd-414edd162d67', '122', NULL, NULL, '8a631b2f-650c-4874-90f4-af1161c2666c', NULL, 'dd174504-4520-4e94-8d2a-5ee8f47c10da'),
('52b4a9a1-5e88-4bce-ad35-736e53cc8686', '2026-58', '40eb84b0-06e5-4d8e-9db5-12cff25f2d62', 'PEST', 'Rodent Control', 'NOT_STARTED', 'MEDIUM', NULL, NULL, '[]', '2026-05-02 00:00:00', NULL, '2026-05-02 00:00:00', NULL, NULL, '2026-04-03 12:54:45', '2026-04-03 12:54:45', NULL, NULL, 'e7a4124c-5e36-40c0-a3fd-414edd162d67', '122', NULL, NULL, '8a631b2f-650c-4874-90f4-af1161c2666c', NULL, 'dd174504-4520-4e94-8d2a-5ee8f47c10da'),
('52cbc631-50c2-44fc-ba1e-b1731e433c06', '2026-47', '3f7d8bd4-7fb8-4f2e-95b2-1fa9840a6dfe', 'PEST', 'Mosquito Control', 'NOT_STARTED', 'MEDIUM', NULL, NULL, '[]', '2026-04-23 00:00:00', NULL, '2026-04-23 00:00:00', NULL, NULL, '2026-04-01 20:58:23', '2026-04-01 20:58:23', NULL, NULL, 'e7a4124c-5e36-40c0-a3fd-414edd162d67', '122', NULL, NULL, '8a631b2f-650c-4874-90f4-af1161c2666c', NULL, 'dd174504-4520-4e94-8d2a-5ee8f47c10da'),
('53fc1eb9-1d59-4161-801d-53c3898cfecb', '2026-31', '3f7d8bd4-7fb8-4f2e-95b2-1fa9840a6dfe', 'PEST', 'Mosquito Control', 'NOT_STARTED', 'MEDIUM', NULL, NULL, '[]', '2026-04-04 00:00:00', NULL, '2026-04-04 00:00:00', NULL, NULL, '2026-04-01 20:58:23', '2026-04-01 20:58:23', NULL, NULL, 'e7a4124c-5e36-40c0-a3fd-414edd162d67', '122', NULL, NULL, '8a631b2f-650c-4874-90f4-af1161c2666c', NULL, 'dd174504-4520-4e94-8d2a-5ee8f47c10da'),
('55b92e2e-4af5-4a18-84e9-a2e83d7919d8', '2026-33', '3f7d8bd4-7fb8-4f2e-95b2-1fa9840a6dfe', 'PEST', 'Mosquito Control', 'NOT_STARTED', 'MEDIUM', NULL, NULL, '[]', '2026-04-06 00:00:00', NULL, '2026-04-06 00:00:00', NULL, NULL, '2026-04-01 20:58:23', '2026-04-01 20:58:23', NULL, NULL, 'e7a4124c-5e36-40c0-a3fd-414edd162d67', '122', NULL, NULL, '8a631b2f-650c-4874-90f4-af1161c2666c', NULL, 'dd174504-4520-4e94-8d2a-5ee8f47c10da'),
('5969ff3b-27c9-4ae3-8d2b-3f6e03151886', '2026-53', '3f7d8bd4-7fb8-4f2e-95b2-1fa9840a6dfe', 'PEST', 'Mosquito Control', 'NOT_STARTED', 'MEDIUM', NULL, NULL, '[]', '2026-04-30 00:00:00', NULL, '2026-04-30 00:00:00', NULL, NULL, '2026-04-01 20:58:23', '2026-04-01 20:58:23', NULL, NULL, 'e7a4124c-5e36-40c0-a3fd-414edd162d67', '122', NULL, NULL, '8a631b2f-650c-4874-90f4-af1161c2666c', NULL, 'dd174504-4520-4e94-8d2a-5ee8f47c10da'),
('62af8c34-0877-4e3c-aa1a-2023b9a53b0a', '2026-3', 'f4aae54b-0c7c-4d8c-b67e-fda044965ee5', 'BOTH', 'Cockroach Control', 'NOT_STARTED', 'MEDIUM', NULL, NULL, '[121]', '2026-04-05 00:00:00', NULL, '2026-04-05 00:00:00', NULL, NULL, '2026-04-01 17:49:09', '2026-04-01 17:49:09', NULL, NULL, '98d129ca-2e27-49ac-874a-1fb4272c9b09', '1', NULL, NULL, 'ab287c39-3d93-40b3-840d-3f0576f59122', NULL, '12e69a76-2c18-11f1-9615-72ed8d604cd2'),
('65a2a132-b0fb-40d7-a3e1-784652a2a47f', '2026-15', '091d720b-737d-4d54-a181-7f55f0df9a22', 'BOTH', 'Bed Bug Control', 'NOT_STARTED', 'MEDIUM', 120, NULL, '[121]', NULL, NULL, '2026-04-01 00:00:00', NULL, NULL, '2026-04-01 18:58:38', '2026-04-01 18:58:38', NULL, NULL, '98d129ca-2e27-49ac-874a-1fb4272c9b09', '1', NULL, NULL, 'ab287c39-3d93-40b3-840d-3f0576f59122', NULL, '12e69a76-2c18-11f1-9615-72ed8d604cd2'),
('69deee0c-0c0a-487b-ab78-11482213d251', '2026-2', 'f4aae54b-0c7c-4d8c-b67e-fda044965ee5', 'BOTH', 'Cockroach Control', 'NOT_STARTED', 'MEDIUM', 120, NULL, '[121]', NULL, NULL, '2026-03-31 00:00:00', NULL, NULL, '2026-04-01 17:49:09', '2026-04-01 18:59:24', NULL, NULL, '98d129ca-2e27-49ac-874a-1fb4272c9b09', '1', NULL, NULL, 'ab287c39-3d93-40b3-840d-3f0576f59122', NULL, '12e69a76-2c18-11f1-9615-72ed8d604cd2'),
('6a5a91f5-501e-42be-9d5b-f070f26c76d8', '2026-57', '40eb84b0-06e5-4d8e-9db5-12cff25f2d62', 'PEST', 'Cockroach Control', 'NOT_STARTED', 'MEDIUM', NULL, NULL, '[]', '2026-05-02 00:00:00', NULL, '2026-05-02 00:00:00', NULL, NULL, '2026-04-03 12:54:45', '2026-04-03 12:54:45', NULL, NULL, 'e7a4124c-5e36-40c0-a3fd-414edd162d67', '122', NULL, NULL, '8a631b2f-650c-4874-90f4-af1161c2666c', NULL, 'dd174504-4520-4e94-8d2a-5ee8f47c10da'),
('6bd9c58d-e971-43a0-afd8-16a3788aa5eb', '2026-39', '3f7d8bd4-7fb8-4f2e-95b2-1fa9840a6dfe', 'PEST', 'Mosquito Control', 'NOT_STARTED', 'MEDIUM', NULL, NULL, '[]', '2026-04-13 00:00:00', NULL, '2026-04-13 00:00:00', NULL, NULL, '2026-04-01 20:58:23', '2026-04-01 20:58:23', NULL, NULL, 'e7a4124c-5e36-40c0-a3fd-414edd162d67', '122', NULL, NULL, '8a631b2f-650c-4874-90f4-af1161c2666c', NULL, 'dd174504-4520-4e94-8d2a-5ee8f47c10da'),
('75a14ba3-4e76-4a27-85c9-9854adcfc46b', '2026-12', 'f4aae54b-0c7c-4d8c-b67e-fda044965ee5', 'BOTH', 'Cockroach Control', 'NOT_STARTED', 'MEDIUM', 120, NULL, '[121]', '2026-04-26 00:00:00', NULL, '2026-04-26 00:00:00', NULL, NULL, '2026-04-01 17:49:09', '2026-04-01 18:18:54', NULL, NULL, '98d129ca-2e27-49ac-874a-1fb4272c9b09', '1', NULL, NULL, 'ab287c39-3d93-40b3-840d-3f0576f59122', NULL, '12e69a76-2c18-11f1-9615-72ed8d604cd2'),
('76bc8884-e249-421e-8ee9-7cb75213959c', '2026-24', '40eb84b0-06e5-4d8e-9db5-12cff25f2d62', 'PEST', 'Cockroach Control', 'NOT_STARTED', 'MEDIUM', NULL, NULL, '[]', '2026-04-18 00:00:00', NULL, '2026-04-18 00:00:00', NULL, NULL, '2026-04-01 20:55:37', '2026-04-01 20:55:37', NULL, NULL, 'e7a4124c-5e36-40c0-a3fd-414edd162d67', '122', NULL, NULL, '8a631b2f-650c-4874-90f4-af1161c2666c', NULL, 'dd174504-4520-4e94-8d2a-5ee8f47c10da'),
('77839c24-4b17-49e2-82c1-9ab6cd2ecb39', '2026-35', '3f7d8bd4-7fb8-4f2e-95b2-1fa9840a6dfe', 'PEST', 'Mosquito Control', 'NOT_STARTED', 'MEDIUM', NULL, NULL, '[]', '2026-04-09 00:00:00', NULL, '2026-04-09 00:00:00', NULL, NULL, '2026-04-01 20:58:23', '2026-04-01 20:58:23', NULL, NULL, 'e7a4124c-5e36-40c0-a3fd-414edd162d67', '122', NULL, NULL, '8a631b2f-650c-4874-90f4-af1161c2666c', NULL, 'dd174504-4520-4e94-8d2a-5ee8f47c10da'),
('847acfae-92f7-49ad-90ae-811dc01e2661', '2026-7', 'f4aae54b-0c7c-4d8c-b67e-fda044965ee5', 'BOTH', 'Cockroach Control', 'NOT_STARTED', 'MEDIUM', 120, NULL, '[121]', '2026-04-13 00:00:00', NULL, '2026-04-13 00:00:00', NULL, NULL, '2026-04-01 17:49:09', '2026-04-01 18:18:54', NULL, NULL, '98d129ca-2e27-49ac-874a-1fb4272c9b09', '1', NULL, NULL, 'ab287c39-3d93-40b3-840d-3f0576f59122', NULL, '12e69a76-2c18-11f1-9615-72ed8d604cd2'),
('89aa566d-7bbf-4a7e-812c-32a4bd64034d', '2026-38', '3f7d8bd4-7fb8-4f2e-95b2-1fa9840a6dfe', 'PEST', 'Mosquito Control', 'NOT_STARTED', 'MEDIUM', NULL, NULL, '[]', '2026-04-12 00:00:00', NULL, '2026-04-12 00:00:00', NULL, NULL, '2026-04-01 20:58:23', '2026-04-01 20:58:23', NULL, NULL, 'e7a4124c-5e36-40c0-a3fd-414edd162d67', '122', NULL, NULL, '8a631b2f-650c-4874-90f4-af1161c2666c', NULL, 'dd174504-4520-4e94-8d2a-5ee8f47c10da'),
('8d9e954a-09d2-4381-86b2-1ae1a64ead26', '2026-25', '40eb84b0-06e5-4d8e-9db5-12cff25f2d62', 'PEST', 'Rodent Control', 'NOT_STARTED', 'MEDIUM', NULL, NULL, '[]', '2026-04-18 00:00:00', NULL, '2026-04-18 00:00:00', NULL, NULL, '2026-04-01 20:55:37', '2026-04-01 20:55:37', NULL, NULL, 'e7a4124c-5e36-40c0-a3fd-414edd162d67', '122', NULL, NULL, '8a631b2f-650c-4874-90f4-af1161c2666c', NULL, 'dd174504-4520-4e94-8d2a-5ee8f47c10da'),
('8decea11-2fdd-4c80-a91c-48fb3f972276', '2026-34', '3f7d8bd4-7fb8-4f2e-95b2-1fa9840a6dfe', 'PEST', 'Mosquito Control', 'NOT_STARTED', 'MEDIUM', NULL, NULL, '[]', '2026-04-08 00:00:00', NULL, '2026-04-08 00:00:00', NULL, NULL, '2026-04-01 20:58:23', '2026-04-01 20:58:23', NULL, NULL, 'e7a4124c-5e36-40c0-a3fd-414edd162d67', '122', NULL, NULL, '8a631b2f-650c-4874-90f4-af1161c2666c', NULL, 'dd174504-4520-4e94-8d2a-5ee8f47c10da'),
('8e1922c2-a52a-4c25-b5ab-e06863a4590c', '2026-52', '3f7d8bd4-7fb8-4f2e-95b2-1fa9840a6dfe', 'PEST', 'Mosquito Control', 'NOT_STARTED', 'MEDIUM', NULL, NULL, '[]', '2026-04-29 00:00:00', NULL, '2026-04-29 00:00:00', NULL, NULL, '2026-04-01 20:58:23', '2026-04-01 20:58:23', NULL, NULL, 'e7a4124c-5e36-40c0-a3fd-414edd162d67', '122', NULL, NULL, '8a631b2f-650c-4874-90f4-af1161c2666c', NULL, 'dd174504-4520-4e94-8d2a-5ee8f47c10da'),
('988ddd5f-0d28-4a90-a1fc-0f738fc11912', '2026-44', '3f7d8bd4-7fb8-4f2e-95b2-1fa9840a6dfe', 'PEST', 'Mosquito Control', 'NOT_STARTED', 'MEDIUM', NULL, NULL, '[]', '2026-04-19 00:00:00', NULL, '2026-04-19 00:00:00', NULL, NULL, '2026-04-01 20:58:23', '2026-04-01 20:58:23', NULL, NULL, 'e7a4124c-5e36-40c0-a3fd-414edd162d67', '122', NULL, NULL, '8a631b2f-650c-4874-90f4-af1161c2666c', NULL, 'dd174504-4520-4e94-8d2a-5ee8f47c10da'),
('98cf7212-efa4-4fce-82dd-98686837b949', '2026-28', '3f7d8bd4-7fb8-4f2e-95b2-1fa9840a6dfe', 'PEST', 'Mosquito Control', 'CREATED', 'MEDIUM', NULL, NULL, '[]', NULL, NULL, '2026-04-01 00:00:00', NULL, NULL, '2026-04-01 20:58:23', '2026-04-01 20:58:23', NULL, NULL, 'e7a4124c-5e36-40c0-a3fd-414edd162d67', '122', NULL, NULL, '8a631b2f-650c-4874-90f4-af1161c2666c', 'Goa Central, Goa, Goa', 'dd174504-4520-4e94-8d2a-5ee8f47c10da'),
('9bce7fcb-ac71-4306-b2a3-16edb882eddd', '2026-9', 'f4aae54b-0c7c-4d8c-b67e-fda044965ee5', 'BOTH', 'Cockroach Control', 'NOT_STARTED', 'MEDIUM', 120, NULL, '[121]', '2026-04-19 00:00:00', NULL, '2026-04-19 00:00:00', NULL, NULL, '2026-04-01 17:49:09', '2026-04-01 18:18:54', NULL, NULL, '98d129ca-2e27-49ac-874a-1fb4272c9b09', '1', NULL, NULL, 'ab287c39-3d93-40b3-840d-3f0576f59122', NULL, '12e69a76-2c18-11f1-9615-72ed8d604cd2'),
('a18764fa-4910-423d-b17b-aa93a56623e2', '2026-10', 'f4aae54b-0c7c-4d8c-b67e-fda044965ee5', 'BOTH', 'Cockroach Control', 'NOT_STARTED', 'MEDIUM', 120, NULL, '[121]', '2026-04-20 00:00:00', NULL, '2026-04-20 00:00:00', NULL, NULL, '2026-04-01 17:49:09', '2026-04-01 18:18:54', NULL, NULL, '98d129ca-2e27-49ac-874a-1fb4272c9b09', '1', NULL, NULL, 'ab287c39-3d93-40b3-840d-3f0576f59122', NULL, '12e69a76-2c18-11f1-9615-72ed8d604cd2'),
('a7c8cb6b-f781-4e37-8390-7e86a1553fc0', '2026-13', 'f4aae54b-0c7c-4d8c-b67e-fda044965ee5', 'BOTH', 'Cockroach Control', 'NOT_STARTED', 'MEDIUM', 120, NULL, '[121]', '2026-04-27 00:00:00', NULL, '2026-04-27 00:00:00', NULL, NULL, '2026-04-01 17:49:09', '2026-04-01 18:18:54', NULL, NULL, '98d129ca-2e27-49ac-874a-1fb4272c9b09', '1', NULL, NULL, 'ab287c39-3d93-40b3-840d-3f0576f59122', NULL, '12e69a76-2c18-11f1-9615-72ed8d604cd2'),
('a9810a94-00ae-41a5-8a57-a1ec04bd9094', '2026-27', '40eb84b0-06e5-4d8e-9db5-12cff25f2d62', 'PEST', 'Rodent Control', 'NOT_STARTED', 'MEDIUM', NULL, NULL, '[]', '2026-04-25 00:00:00', NULL, '2026-04-25 00:00:00', NULL, NULL, '2026-04-01 20:55:37', '2026-04-01 20:55:37', NULL, NULL, 'e7a4124c-5e36-40c0-a3fd-414edd162d67', '122', NULL, NULL, '8a631b2f-650c-4874-90f4-af1161c2666c', NULL, 'dd174504-4520-4e94-8d2a-5ee8f47c10da'),
('a9a6386a-10a0-42d1-9142-b999549e97ec', '2026-60', '3f7d8bd4-7fb8-4f2e-95b2-1fa9840a6dfe', 'PEST', 'Mosquito Control', 'NOT_STARTED', 'MEDIUM', 125, NULL, '[123]', '2026-05-03 00:00:00', NULL, '2026-05-03 00:00:00', NULL, NULL, '2026-04-03 12:54:45', '2026-04-03 12:54:45', NULL, NULL, 'e7a4124c-5e36-40c0-a3fd-414edd162d67', '122', NULL, NULL, '8a631b2f-650c-4874-90f4-af1161c2666c', NULL, 'dd174504-4520-4e94-8d2a-5ee8f47c10da'),
('b0eb7a33-aeeb-4223-b67c-c014186d1919', '2026-6', 'f4aae54b-0c7c-4d8c-b67e-fda044965ee5', 'BOTH', 'Cockroach Control', 'NOT_STARTED', 'MEDIUM', 120, NULL, '[121]', '2026-04-12 00:00:00', NULL, '2026-04-12 00:00:00', NULL, NULL, '2026-04-01 17:49:09', '2026-04-01 18:18:54', NULL, NULL, '98d129ca-2e27-49ac-874a-1fb4272c9b09', '1', NULL, NULL, 'ab287c39-3d93-40b3-840d-3f0576f59122', NULL, '12e69a76-2c18-11f1-9615-72ed8d604cd2'),
('b53096a3-76ff-47ec-8117-e556c81ae477', '2026-17', 'bc0e69f0-3211-42e0-9098-6ad335cc7e3e', 'BOTH', 'Sofa Cleaning', 'NOT_STARTED', 'MEDIUM', 120, NULL, '[121]', NULL, NULL, '2026-04-01 00:00:00', NULL, NULL, '2026-04-01 19:27:29', '2026-04-01 19:27:29', NULL, NULL, '98d129ca-2e27-49ac-874a-1fb4272c9b09', '1', NULL, NULL, 'ab287c39-3d93-40b3-840d-3f0576f59122', NULL, '12e69a76-2c18-11f1-9615-72ed8d604cd2'),
('b94b2ec0-42e0-4bf1-9f9a-c84c52fcd5f2', '2026-29', '3f7d8bd4-7fb8-4f2e-95b2-1fa9840a6dfe', 'PEST', 'Mosquito Control', 'NOT_STARTED', 'MEDIUM', NULL, NULL, '[]', '2026-04-02 00:00:00', NULL, '2026-04-02 00:00:00', NULL, NULL, '2026-04-01 20:58:23', '2026-04-01 20:58:23', NULL, NULL, 'e7a4124c-5e36-40c0-a3fd-414edd162d67', '122', NULL, NULL, '8a631b2f-650c-4874-90f4-af1161c2666c', NULL, 'dd174504-4520-4e94-8d2a-5ee8f47c10da'),
('bcdd5ead-3635-4861-b4ef-fdd60d14bfa7', '2026-18', '40eb84b0-06e5-4d8e-9db5-12cff25f2d62', 'PEST', 'Cockroach Control', 'CREATED', 'MEDIUM', NULL, NULL, '[]', NULL, NULL, '2026-04-01 00:00:00', NULL, NULL, '2026-04-01 20:55:37', '2026-04-01 20:55:37', NULL, NULL, 'e7a4124c-5e36-40c0-a3fd-414edd162d67', '122', NULL, NULL, '8a631b2f-650c-4874-90f4-af1161c2666c', 'Goa Central, Goa, Goa', 'dd174504-4520-4e94-8d2a-5ee8f47c10da'),
('be357b34-e85a-498f-8dac-08a806097650', '2026-51', '3f7d8bd4-7fb8-4f2e-95b2-1fa9840a6dfe', 'PEST', 'Mosquito Control', 'NOT_STARTED', 'MEDIUM', NULL, NULL, '[]', '2026-04-27 00:00:00', NULL, '2026-04-27 00:00:00', NULL, NULL, '2026-04-01 20:58:23', '2026-04-01 20:58:23', NULL, NULL, 'e7a4124c-5e36-40c0-a3fd-414edd162d67', '122', NULL, NULL, '8a631b2f-650c-4874-90f4-af1161c2666c', NULL, 'dd174504-4520-4e94-8d2a-5ee8f47c10da'),
('be658861-f4df-425e-b03c-90d731facbfb', '2026-20', '40eb84b0-06e5-4d8e-9db5-12cff25f2d62', 'PEST', 'Cockroach Control', 'NOT_STARTED', 'MEDIUM', NULL, NULL, '[]', '2026-04-04 00:00:00', NULL, '2026-04-04 00:00:00', NULL, NULL, '2026-04-01 20:55:37', '2026-04-01 20:55:37', NULL, NULL, 'e7a4124c-5e36-40c0-a3fd-414edd162d67', '122', NULL, NULL, '8a631b2f-650c-4874-90f4-af1161c2666c', NULL, 'dd174504-4520-4e94-8d2a-5ee8f47c10da'),
('c2387a5c-4039-41bc-8beb-eb6311cbe113', '2026-45', '3f7d8bd4-7fb8-4f2e-95b2-1fa9840a6dfe', 'PEST', 'Mosquito Control', 'NOT_STARTED', 'MEDIUM', NULL, NULL, '[]', '2026-04-20 00:00:00', NULL, '2026-04-20 00:00:00', NULL, NULL, '2026-04-01 20:58:23', '2026-04-01 20:58:23', NULL, NULL, 'e7a4124c-5e36-40c0-a3fd-414edd162d67', '122', NULL, NULL, '8a631b2f-650c-4874-90f4-af1161c2666c', NULL, 'dd174504-4520-4e94-8d2a-5ee8f47c10da'),
('c3627256-319e-46e5-942e-6c8555744f4b', '2026-32', '3f7d8bd4-7fb8-4f2e-95b2-1fa9840a6dfe', 'PEST', 'Mosquito Control', 'NOT_STARTED', 'MEDIUM', NULL, NULL, '[]', '2026-04-05 00:00:00', NULL, '2026-04-05 00:00:00', NULL, NULL, '2026-04-01 20:58:23', '2026-04-01 20:58:23', NULL, NULL, 'e7a4124c-5e36-40c0-a3fd-414edd162d67', '122', NULL, NULL, '8a631b2f-650c-4874-90f4-af1161c2666c', NULL, 'dd174504-4520-4e94-8d2a-5ee8f47c10da'),
('c3f92a8d-44b7-49d8-99b9-90b6b37a0ab1', '2026-61', '3f7d8bd4-7fb8-4f2e-95b2-1fa9840a6dfe', 'PEST', 'Mosquito Control', 'NOT_STARTED', 'MEDIUM', 125, NULL, '[123]', '2026-05-04 00:00:00', NULL, '2026-05-04 00:00:00', NULL, NULL, '2026-04-04 12:12:31', '2026-04-04 12:12:31', NULL, NULL, 'e7a4124c-5e36-40c0-a3fd-414edd162d67', '122', NULL, NULL, '8a631b2f-650c-4874-90f4-af1161c2666c', NULL, 'dd174504-4520-4e94-8d2a-5ee8f47c10da'),
('c99e7d6d-504d-4ecf-9992-0bfcfe1854ac', '2026-62', '3f7d8bd4-7fb8-4f2e-95b2-1fa9840a6dfe', 'PEST', 'Mosquito Control', 'NOT_STARTED', 'MEDIUM', 125, NULL, '[123]', '2026-05-06 00:00:00', NULL, '2026-05-06 00:00:00', NULL, NULL, '2026-04-06 11:34:02', '2026-04-06 11:34:02', NULL, NULL, 'e7a4124c-5e36-40c0-a3fd-414edd162d67', '122', NULL, NULL, '8a631b2f-650c-4874-90f4-af1161c2666c', NULL, 'dd174504-4520-4e94-8d2a-5ee8f47c10da'),
('cb1dc988-1eda-4b07-8df1-4673d6fc979a', '2026-23', '40eb84b0-06e5-4d8e-9db5-12cff25f2d62', 'PEST', 'Rodent Control', 'NOT_STARTED', 'MEDIUM', NULL, NULL, '[]', '2026-04-11 00:00:00', NULL, '2026-04-11 00:00:00', NULL, NULL, '2026-04-01 20:55:37', '2026-04-01 20:55:37', NULL, NULL, 'e7a4124c-5e36-40c0-a3fd-414edd162d67', '122', NULL, NULL, '8a631b2f-650c-4874-90f4-af1161c2666c', NULL, 'dd174504-4520-4e94-8d2a-5ee8f47c10da'),
('d17cad35-b1ed-43f2-9751-8bec6973983b', '2026-5', 'f4aae54b-0c7c-4d8c-b67e-fda044965ee5', 'BOTH', 'Cockroach Control', 'NOT_STARTED', 'MEDIUM', 120, NULL, '[121]', '2026-04-07 00:00:00', NULL, '2026-04-07 00:00:00', NULL, NULL, '2026-04-01 17:49:09', '2026-04-01 18:18:54', NULL, NULL, '98d129ca-2e27-49ac-874a-1fb4272c9b09', '1', NULL, NULL, 'ab287c39-3d93-40b3-840d-3f0576f59122', NULL, '12e69a76-2c18-11f1-9615-72ed8d604cd2'),
('ee95b06d-cd25-484b-838e-5a3fd0191308', '2026-37', '3f7d8bd4-7fb8-4f2e-95b2-1fa9840a6dfe', 'PEST', 'Mosquito Control', 'NOT_STARTED', 'MEDIUM', NULL, NULL, '[]', '2026-04-11 00:00:00', NULL, '2026-04-11 00:00:00', NULL, NULL, '2026-04-01 20:58:23', '2026-04-01 20:58:23', NULL, NULL, 'e7a4124c-5e36-40c0-a3fd-414edd162d67', '122', NULL, NULL, '8a631b2f-650c-4874-90f4-af1161c2666c', NULL, 'dd174504-4520-4e94-8d2a-5ee8f47c10da'),
('fe985cb9-5b6c-421e-a06d-2dc21834a05d', '2026-46', '3f7d8bd4-7fb8-4f2e-95b2-1fa9840a6dfe', 'PEST', 'Mosquito Control', 'NOT_STARTED', 'MEDIUM', NULL, NULL, '[]', '2026-04-22 00:00:00', NULL, '2026-04-22 00:00:00', NULL, NULL, '2026-04-01 20:58:23', '2026-04-01 20:58:23', NULL, NULL, 'e7a4124c-5e36-40c0-a3fd-414edd162d67', '122', NULL, NULL, '8a631b2f-650c-4874-90f4-af1161c2666c', NULL, 'dd174504-4520-4e94-8d2a-5ee8f47c10da'),
('feb1894f-dfbd-4a39-b4ee-7612a8665389', '2026-30', '3f7d8bd4-7fb8-4f2e-95b2-1fa9840a6dfe', 'PEST', 'Mosquito Control', 'NOT_STARTED', 'MEDIUM', 125, NULL, '[123]', '2026-04-03 00:00:00', NULL, '2026-04-03 00:00:00', NULL, NULL, '2026-04-01 20:58:23', '2026-04-03 12:19:44', NULL, NULL, 'e7a4124c-5e36-40c0-a3fd-414edd162d67', '122', NULL, NULL, '8a631b2f-650c-4874-90f4-af1161c2666c', NULL, 'dd174504-4520-4e94-8d2a-5ee8f47c10da'),
('fedb6f12-eff0-4a04-b1e4-6cad3741d072', '2026-14', 'f4aae54b-0c7c-4d8c-b67e-fda044965ee5', 'BOTH', 'Cockroach Control', 'NOT_STARTED', 'MEDIUM', 120, NULL, '[121]', '2026-04-28 00:00:00', NULL, '2026-04-28 00:00:00', NULL, NULL, '2026-04-01 17:49:09', '2026-04-01 18:18:54', NULL, NULL, '98d129ca-2e27-49ac-874a-1fb4272c9b09', '1', NULL, NULL, 'ab287c39-3d93-40b3-840d-3f0576f59122', NULL, '12e69a76-2c18-11f1-9615-72ed8d604cd2');

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
  `created_at` datetime NOT NULL
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
('02feac06-5fa9-44a0-9297-1acc4dfea289', 'c3627256-319e-46e5-942e-6c8555744f4b', 'AUTO_CREATED_RECURRING_VISIT', 'Recurring visit auto-created for 2026-04-05', NULL, '2026-04-01 20:58:23', '122', 0),
('03219fe0-036a-48a1-8443-525c3cf55d73', 'ee95b06d-cd25-484b-838e-5a3fd0191308', 'AUTO_CREATED_RECURRING_VISIT', 'Recurring visit auto-created for 2026-04-11', NULL, '2026-04-01 20:58:23', '122', 0),
('046a20e8-1ce4-4a2c-85f4-2feff3f19014', '6bd9c58d-e971-43a0-afd8-16a3788aa5eb', 'AUTO_CREATED_RECURRING_VISIT', 'Recurring visit auto-created for 2026-04-13', NULL, '2026-04-01 20:58:23', '122', 0),
('04b36a85-5f81-4840-8f66-0e799146fc90', '0dbe0dc3-a06c-4854-a5ed-f1b722e2dc25', 'AUTO_CREATED_RECURRING_VISIT', 'Recurring visit auto-created for 2026-04-26', NULL, '2026-04-01 20:58:23', '122', 0),
('0d1600f1-26bb-48fc-aa14-f44d551e974f', '75a14ba3-4e76-4a27-85c9-9854adcfc46b', 'AUTO_CREATED_RECURRING_VISIT', 'Recurring visit auto-created for 2026-04-26', NULL, '2026-04-01 17:49:09', '1', 0),
('10105747-c033-46fd-895a-87a81bbaac82', '52b4a9a1-5e88-4bce-ad35-736e53cc8686', 'AUTO_CREATED_RECURRING_VISIT', 'Recurring visit auto-created for 2026-05-02', NULL, '2026-04-03 12:54:45', '122', 0),
('1117f952-ea85-4d4f-95da-b71cee69853d', 'cb1dc988-1eda-4b07-8df1-4673d6fc979a', 'AUTO_CREATED_RECURRING_VISIT', 'Recurring visit auto-created for 2026-04-11', NULL, '2026-04-01 20:55:37', '122', 0),
('130a04d9-e389-4937-9046-0df68befa815', '62af8c34-0877-4e3c-aa1a-2023b9a53b0a', 'AUTO_CREATED_RECURRING_VISIT', 'Recurring visit auto-created for 2026-04-05', NULL, '2026-04-01 17:49:09', '1', 0),
('15a87d39-4437-44d5-8dbd-60da2f6fd473', '42da5535-4317-4298-b85c-1d8879d0c79d', 'AUTO_CREATED_RECURRING_VISIT', 'Recurring visit auto-created for 2026-04-06', NULL, '2026-04-01 17:49:09', '1', 0),
('188a9494-c49b-428c-8b0f-af18e998f0ef', '65a2a132-b0fb-40d7-a3e1-784652a2a47f', 'CREATED', 'Job created', NULL, '2026-04-01 18:58:38', '1', 0),
('1ad097b3-b58a-43aa-a600-6928c123181b', '69deee0c-0c0a-487b-ab78-11482213d251', 'COMMENT', 'Ticket raised: test - test', NULL, '2026-04-06 11:49:27', '126', 1),
('22992309-5ba8-45c6-b6a9-9d063e22a8df', 'd17cad35-b1ed-43f2-9751-8bec6973983b', 'AUTO_CREATED_RECURRING_VISIT', 'Recurring visit auto-created for 2026-04-07', NULL, '2026-04-01 17:49:09', '1', 0),
('29d0ff0f-208c-46e4-8308-8065604c77fb', '412271c5-7e0e-4cfa-95a3-d70919e7609d', 'AUTO_CREATED_RECURRING_VISIT', 'Recurring visit auto-created for 2026-05-02', NULL, '2026-04-03 12:54:45', '122', 0),
('2e7c94a8-362a-4e11-90d9-52306171a48b', '42da5535-4317-4298-b85c-1d8879d0c79d', 'ASSIGNED', 'Assignment updated via scope', '{\"scope\": \"future\", \"supervisorId\": 120, \"updatedCount\": 11, \"technicianIds\": []}', '2026-04-01 18:18:54', '1', 1),
('31d7bd3a-5a08-4639-a0ab-ee8a3c5c8636', 'fe985cb9-5b6c-421e-a06d-2dc21834a05d', 'AUTO_CREATED_RECURRING_VISIT', 'Recurring visit auto-created for 2026-04-22', NULL, '2026-04-01 20:58:23', '122', 0),
('32205372-e821-4be3-892f-fe6d2e9ff2a1', '140460d9-7aed-4cfe-9822-69bfc88c9eb4', 'AUTO_CREATED_RECURRING_VISIT', 'Recurring visit auto-created for 2026-04-04', NULL, '2026-04-01 20:55:37', '122', 0),
('34a66b6e-4ddc-4993-8001-e2b16b41430e', '260a87d0-2cc7-4a27-a293-264f99512f8f', 'AUTO_CREATED_RECURRING_VISIT', 'Recurring visit auto-created for 2026-04-11', NULL, '2026-04-01 20:55:37', '122', 0),
('3be0dc85-abc7-4c4c-bea4-07eac5febb19', '40649193-7739-4564-a7fa-b86107a0112b', 'ASSIGNED', 'Assignment updated via scope', '{\"scope\": \"current\", \"supervisorId\": 120, \"updatedCount\": 1, \"technicianIds\": [121]}', '2026-04-01 19:01:08', '1', 1),
('3d271492-5f29-4e2c-94ae-b1a3466d6b2b', 'feb1894f-dfbd-4a39-b4ee-7612a8665389', 'ASSIGNED', 'Assignment updated via scope', '{\"scope\": \"current\", \"supervisorId\": 125, \"updatedCount\": 1, \"technicianIds\": [123]}', '2026-04-03 12:19:44', '1', 1),
('3e6aa457-ad09-4095-94b6-e4c4c3049601', '1ea824c2-e8c5-4a59-9214-d2ab8b6cd8aa', 'AUTO_CREATED_RECURRING_VISIT', 'Recurring visit auto-created for 2026-04-25', NULL, '2026-04-01 20:55:37', '122', 0),
('43332741-783a-4bb7-ac43-401628bb0665', '353a988b-f5e3-4cb5-934a-d36c6afe6a88', 'AUTO_CREATED_RECURRING_VISIT', 'Recurring visit auto-created for 2026-04-14', NULL, '2026-04-01 17:49:09', '1', 0),
('45ee7826-fe18-4324-bcbf-9ef7f1f09578', '76bc8884-e249-421e-8ee9-7cb75213959c', 'AUTO_CREATED_RECURRING_VISIT', 'Recurring visit auto-created for 2026-04-18', NULL, '2026-04-01 20:55:37', '122', 0),
('48d5e2e6-7a1e-4a68-9125-0c3f673f37cf', 'a18764fa-4910-423d-b17b-aa93a56623e2', 'AUTO_CREATED_RECURRING_VISIT', 'Recurring visit auto-created for 2026-04-20', NULL, '2026-04-01 17:49:09', '1', 0),
('50b567ae-164d-4a34-b126-54b480401106', '6a5a91f5-501e-42be-9d5b-f070f26c76d8', 'AUTO_CREATED_RECURRING_VISIT', 'Recurring visit auto-created for 2026-05-02', NULL, '2026-04-03 12:54:45', '122', 0),
('51928dfb-2970-4b24-9af8-27120d73e34a', '9bce7fcb-ac71-4306-b2a3-16edb882eddd', 'AUTO_CREATED_RECURRING_VISIT', 'Recurring visit auto-created for 2026-04-19', NULL, '2026-04-01 17:49:09', '1', 0),
('5bfb80d0-d668-4af1-92b1-383b3b525a91', '53fc1eb9-1d59-4161-801d-53c3898cfecb', 'AUTO_CREATED_RECURRING_VISIT', 'Recurring visit auto-created for 2026-04-04', NULL, '2026-04-01 20:58:23', '122', 0),
('5e2173d6-9df2-4e47-84b2-889f3b7f1d7b', '344b9d82-c233-4b1d-abc3-f9c381b6f218', 'AUTO_CREATED_RECURRING_VISIT', 'Recurring visit auto-created for 2026-04-16', NULL, '2026-04-01 20:58:23', '122', 0),
('67346578-bb38-4a9f-9280-d3895e6af097', 'a9810a94-00ae-41a5-8a57-a1ec04bd9094', 'AUTO_CREATED_RECURRING_VISIT', 'Recurring visit auto-created for 2026-04-25', NULL, '2026-04-01 20:55:37', '122', 0),
('6874220f-c5de-42a7-b759-15aefc424bc1', '2312683c-65c1-49df-a0c1-5dc157696a5e', 'AUTO_CREATED_RECURRING_VISIT', 'Recurring visit auto-created for 2026-04-17', NULL, '2026-04-01 20:58:23', '122', 0),
('6895101f-db61-430f-85b5-496a81457e06', '8decea11-2fdd-4c80-a91c-48fb3f972276', 'AUTO_CREATED_RECURRING_VISIT', 'Recurring visit auto-created for 2026-04-08', NULL, '2026-04-01 20:58:23', '122', 0),
('6b62779c-dfce-41a5-b556-57a7bd1e8163', '13272a0d-e6a8-4ebe-96df-412f8719b5db', 'AUTO_CREATED_RECURRING_VISIT', 'Recurring visit auto-created for 2026-04-10', NULL, '2026-04-01 20:58:23', '122', 0),
('75fe2906-77c0-4d94-8cef-6b9ab9d6ee8f', '89aa566d-7bbf-4a7e-812c-32a4bd64034d', 'AUTO_CREATED_RECURRING_VISIT', 'Recurring visit auto-created for 2026-04-12', NULL, '2026-04-01 20:58:23', '122', 0),
('7a52cdf1-f928-49bd-9353-462ab28cbb4b', 'bcdd5ead-3635-4861-b4ef-fdd60d14bfa7', 'CREATED', 'Job created', NULL, '2026-04-01 20:55:37', '122', 0),
('7d2a4671-0548-4f80-b67c-c495c9f1c69a', 'be357b34-e85a-498f-8dac-08a806097650', 'AUTO_CREATED_RECURRING_VISIT', 'Recurring visit auto-created for 2026-04-27', NULL, '2026-04-01 20:58:23', '122', 0),
('7e246553-3fd8-4c28-9422-bd28b5e597eb', 'b94b2ec0-42e0-4bf1-9f9a-c84c52fcd5f2', 'AUTO_CREATED_RECURRING_VISIT', 'Recurring visit auto-created for 2026-04-02', NULL, '2026-04-01 20:58:23', '122', 0),
('8636cc95-169e-4313-9f8e-d58df9864c43', '088a331b-9b09-4f77-b17e-097842201175', 'CREATED', 'Job created', NULL, '2026-04-03 10:27:56', '1', 0),
('87f1c12f-4dfd-4cfe-a263-6de3b86e89ba', 'b53096a3-76ff-47ec-8117-e556c81ae477', 'CREATED', 'Job created', NULL, '2026-04-01 19:27:29', '1', 0),
('8992ffee-3057-4254-9139-de1f2161ba53', '05bcc5c0-d5e7-42d6-b2e9-bb8b3dfe1a0b', 'ASSIGNED', 'Assignment updated via scope', '{\"scope\": \"future\", \"supervisorId\": 120, \"updatedCount\": 3, \"technicianIds\": []}', '2026-04-01 18:14:28', '1', 1),
('8ca9d5d7-5ef8-457d-88a4-e48ce7a32a94', 'fedb6f12-eff0-4a04-b1e4-6cad3741d072', 'AUTO_CREATED_RECURRING_VISIT', 'Recurring visit auto-created for 2026-04-28', NULL, '2026-04-01 17:49:09', '1', 0),
('8cc82f1b-99c8-4e0a-bf6d-1020dc9eae37', '77839c24-4b17-49e2-82c1-9ab6cd2ecb39', 'AUTO_CREATED_RECURRING_VISIT', 'Recurring visit auto-created for 2026-04-09', NULL, '2026-04-01 20:58:23', '122', 0),
('9100a35d-96a9-4b38-b808-c5c05c6d44b0', '52cbc631-50c2-44fc-ba1e-b1731e433c06', 'AUTO_CREATED_RECURRING_VISIT', 'Recurring visit auto-created for 2026-04-23', NULL, '2026-04-01 20:58:23', '122', 0),
('91847f31-0dfc-42a5-8ddc-404e4aacaff1', '55b92e2e-4af5-4a18-84e9-a2e83d7919d8', 'AUTO_CREATED_RECURRING_VISIT', 'Recurring visit auto-created for 2026-04-06', NULL, '2026-04-01 20:58:23', '122', 0),
('9c06d335-21f3-4cce-9f10-aeaa0c6a6922', 'be658861-f4df-425e-b03c-90d731facbfb', 'AUTO_CREATED_RECURRING_VISIT', 'Recurring visit auto-created for 2026-04-04', NULL, '2026-04-01 20:55:37', '122', 0),
('9ce924c3-70b8-427d-8452-0b65d52f4571', '05bcc5c0-d5e7-42d6-b2e9-bb8b3dfe1a0b', 'AUTO_CREATED_RECURRING_VISIT', 'Recurring visit auto-created for 2026-04-21', NULL, '2026-04-01 17:49:09', '1', 0),
('9dc02850-4e1a-43a6-bf98-f32595e9b7c7', 'feb1894f-dfbd-4a39-b4ee-7612a8665389', 'COMMENT', 'test', NULL, '2026-04-03 14:06:32', '125', 0),
('9f4d4012-51a3-44d6-a4ae-b172c0152798', '223e90ee-06a1-4f32-a2f3-492bdf5c9e56', 'AUTO_CREATED_RECURRING_VISIT', 'Recurring visit auto-created for 2026-04-24', NULL, '2026-04-01 20:58:23', '122', 0),
('9f980254-1d40-4237-ba24-be16afd7f5c5', 'a7c8cb6b-f781-4e37-8390-7e86a1553fc0', 'AUTO_CREATED_RECURRING_VISIT', 'Recurring visit auto-created for 2026-04-27', NULL, '2026-04-01 17:49:09', '1', 0),
('a20615d7-a471-4216-875e-ef7831870bf0', 'c2387a5c-4039-41bc-8beb-eb6311cbe113', 'AUTO_CREATED_RECURRING_VISIT', 'Recurring visit auto-created for 2026-04-20', NULL, '2026-04-01 20:58:23', '122', 0),
('a914efe1-e505-4f15-b405-4ffc1118a5a3', '38d08a5f-8683-43c2-875c-e27a4958752f', 'AUTO_CREATED_RECURRING_VISIT', 'Recurring visit auto-created for 2026-04-25', NULL, '2026-04-01 20:58:23', '122', 0),
('aa13a8ce-63a6-4c7e-9970-8dcc7a74694a', '454f167b-ecb2-48f4-8428-7c2d07d7c506', 'AUTO_CREATED_RECURRING_VISIT', 'Recurring visit auto-created for 2026-04-15', NULL, '2026-04-01 20:58:23', '122', 0),
('ada97b3e-067f-41c5-890b-66ea28f59288', 'b0eb7a33-aeeb-4223-b67c-c014186d1919', 'AUTO_CREATED_RECURRING_VISIT', 'Recurring visit auto-created for 2026-04-12', NULL, '2026-04-01 17:49:09', '1', 0),
('aeb8c887-d69f-49b8-902c-87d5823d9ad4', 'c99e7d6d-504d-4ecf-9992-0bfcfe1854ac', 'AUTO_CREATED_RECURRING_VISIT', 'Recurring visit auto-created for 2026-05-06', NULL, '2026-04-06 11:34:02', '122', 0),
('af996bf3-8609-44d5-96af-0042c46b9a89', '05bcc5c0-d5e7-42d6-b2e9-bb8b3dfe1a0b', 'ASSIGNED', 'Assignment updated via scope', '{\"scope\": \"current\", \"supervisorId\": 120, \"updatedCount\": 1, \"technicianIds\": [121]}', '2026-04-01 18:37:29', '1', 1),
('b9815f16-c8f7-4aeb-ada3-ba5e798c358c', '12ea4f4f-7526-4801-90a2-edd2bd6dfc5f', 'AUTO_CREATED_RECURRING_VISIT', 'Recurring visit auto-created for 2026-04-18', NULL, '2026-04-01 20:58:23', '122', 0),
('c0a9455e-9697-48a4-ad35-c5af9f1d0020', '42da5535-4317-4298-b85c-1d8879d0c79d', 'ASSIGNED', 'Assignment updated via scope', '{\"scope\": \"future\", \"supervisorId\": 120, \"updatedCount\": 10, \"technicianIds\": []}', '2026-04-01 18:17:54', '1', 1),
('c9b6efc0-3d48-4f84-a15b-b6e030184b2c', '847acfae-92f7-49ad-90ae-811dc01e2661', 'AUTO_CREATED_RECURRING_VISIT', 'Recurring visit auto-created for 2026-04-13', NULL, '2026-04-01 17:49:09', '1', 0),
('ca9503d3-6faa-484f-a22d-bbac071b83e9', '69deee0c-0c0a-487b-ab78-11482213d251', 'ASSIGNED', 'Assignment updated via scope', '{\"scope\": \"current\", \"supervisorId\": 120, \"updatedCount\": 1, \"technicianIds\": [121]}', '2026-04-01 18:59:24', '1', 1),
('cc721038-de59-4733-9b5b-103a79bd0552', '40649193-7739-4564-a7fa-b86107a0112b', 'CREATED', 'Job created', NULL, '2026-04-01 19:00:57', '1', 0),
('d1d971ff-9945-47de-beb1-783aa5f58ee6', '69deee0c-0c0a-487b-ab78-11482213d251', 'CREATED', 'Job created', NULL, '2026-04-01 17:49:09', '1', 0),
('d5ed8f9f-6915-409a-a1a3-ad9a6135a8a3', '988ddd5f-0d28-4a90-a1fc-0f738fc11912', 'AUTO_CREATED_RECURRING_VISIT', 'Recurring visit auto-created for 2026-04-19', NULL, '2026-04-01 20:58:23', '122', 0),
('d78e92e6-a039-4ced-8eaf-7a32c0566cad', 'c3f92a8d-44b7-49d8-99b9-90b6b37a0ab1', 'AUTO_CREATED_RECURRING_VISIT', 'Recurring visit auto-created for 2026-05-04', NULL, '2026-04-04 12:12:31', '122', 0),
('dc177a92-f3b3-4f6a-b105-d29c249b5676', '14f31df9-5a77-4e7f-a33f-d43c7402378c', 'CREATED', 'Job created', NULL, '2026-04-03 11:01:06', '1', 0),
('ddf2893d-8ca0-4f4a-9589-fdf27a5ea4de', '5969ff3b-27c9-4ae3-8d2b-3f6e03151886', 'AUTO_CREATED_RECURRING_VISIT', 'Recurring visit auto-created for 2026-04-30', NULL, '2026-04-01 20:58:23', '122', 0),
('dfef243c-ca0a-4525-be27-6a6c985c7ec4', '0883db18-3350-4fb8-8af8-77bebd1506f8', 'CREATED', 'Job created', NULL, '2026-04-01 20:55:37', '122', 0),
('e11e8997-5c8e-48ab-ba1f-d31eec1d24b5', '353a988b-f5e3-4cb5-934a-d36c6afe6a88', 'ASSIGNED', 'Assignment updated via scope', '{\"scope\": \"future\", \"supervisorId\": 120, \"updatedCount\": 6, \"technicianIds\": []}', '2026-04-01 18:14:55', '1', 1),
('ef274fbb-4364-4f17-9017-92bd0e162c06', '8e1922c2-a52a-4c25-b5ab-e06863a4590c', 'AUTO_CREATED_RECURRING_VISIT', 'Recurring visit auto-created for 2026-04-29', NULL, '2026-04-01 20:58:23', '122', 0),
('ef884c72-75f1-47df-820e-a6be1b7ae66d', '5d1316be-8525-45ce-9288-0ee0b1804f62', 'CREATED', 'Job created', NULL, '2026-04-01 17:20:15', '1', 0),
('f0e35154-3131-4552-9625-7196617436e9', '98cf7212-efa4-4fce-82dd-98686837b949', 'CREATED', 'Job created', NULL, '2026-04-01 20:58:23', '122', 0),
('f1d2e40b-d9a4-4d6e-acdb-093b9d835c1e', '1896e665-389f-4d53-b0db-b5e8317a39a2', 'AUTO_CREATED_RECURRING_VISIT', 'Recurring visit auto-created for 2026-05-01', NULL, '2026-04-01 20:58:23', '122', 0),
('f24c5046-7074-4f11-a49b-21f779d14856', '40649193-7739-4564-a7fa-b86107a0112b', 'ASSIGNED', 'Assignment updated via scope', '{\"scope\": \"current\", \"supervisorId\": 120, \"updatedCount\": 1, \"technicianIds\": [121]}', '2026-04-01 19:23:35', '1', 1),
('f3bebde0-5537-4946-84e9-5b902174ec74', 'feb1894f-dfbd-4a39-b4ee-7612a8665389', 'AUTO_CREATED_RECURRING_VISIT', 'Recurring visit auto-created for 2026-04-03', NULL, '2026-04-01 20:58:23', '122', 0),
('f443e33e-20a0-4e92-86e1-5fd2bd7da139', '353a988b-f5e3-4cb5-934a-d36c6afe6a88', 'ASSIGNED', 'Assignment updated via scope', '{\"scope\": \"current\", \"supervisorId\": 120, \"updatedCount\": 1, \"technicianIds\": []}', '2026-04-01 18:15:51', '1', 1),
('f49d8bac-a8a8-4248-a29a-c0ac37049a92', '65a2a132-b0fb-40d7-a3e1-784652a2a47f', 'COMMENT', 'test', NULL, '2026-04-01 19:31:20', '121', 0),
('f60a6929-a518-49f1-807a-9acb1346fd06', 'a9a6386a-10a0-42d1-9142-b999549e97ec', 'AUTO_CREATED_RECURRING_VISIT', 'Recurring visit auto-created for 2026-05-03', NULL, '2026-04-03 12:54:45', '122', 0),
('ff41cacc-0400-4e1b-9fed-8a6009785d05', '8d9e954a-09d2-4381-86b2-1ae1a64ead26', 'AUTO_CREATED_RECURRING_VISIT', 'Recurring visit auto-created for 2026-04-18', NULL, '2026-04-01 20:55:37', '122', 0);

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

--
-- Dumping data for table `job_tickets`
--

INSERT INTO `job_tickets` (`id`, `subject`, `status`, `priority`, `created_by_user_id`, `created_at`, `updated_at`) VALUES
('07a8fa5e-25e6-4f66-964f-66093b6ea1d7', 'Test 2', 'OPEN', 'LOW', 126, '2026-04-06 11:38:02', '2026-04-06 11:38:02'),
('0bac24e5-1697-46a4-b5f6-958b4b4fee9f', 'test with Img', 'OPEN', 'LOW', 126, '2026-04-06 11:38:32', '2026-04-06 12:51:02'),
('43cf1907-9b57-4677-a816-b54f87842a00', 'test', 'OPEN', 'LOW', 126, '2026-04-06 11:49:27', '2026-04-06 11:49:27'),
('73727d65-28ba-4fbc-8b64-82ae7ec38c86', 'test 4', 'OPEN', 'LOW', 126, '2026-04-06 12:25:16', '2026-04-06 12:25:16');

-- --------------------------------------------------------

--
-- Table structure for table `job_ticket_links`
--

CREATE TABLE `job_ticket_links` (
  `id` char(36) NOT NULL,
  `ticket_id` char(36) NOT NULL,
  `job_id` char(36) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `job_ticket_links`
--

INSERT INTO `job_ticket_links` (`id`, `ticket_id`, `job_id`) VALUES
('169c7100-68b4-4ef2-9147-ac8e50705767', '43cf1907-9b57-4677-a816-b54f87842a00', '69deee0c-0c0a-487b-ab78-11482213d251');

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

--
-- Dumping data for table `job_ticket_messages`
--

INSERT INTO `job_ticket_messages` (`id`, `ticket_id`, `message`, `created_by_user_id`, `created_at`, `attachment_key`) VALUES
('16ef80f7-a326-4abe-bb80-f25bdc693254', '73727d65-28ba-4fbc-8b64-82ae7ec38c86', 'test 4', 126, '2026-04-06 12:25:16', NULL),
('173bb004-5b5f-4555-bfe0-286e711ebacf', '0bac24e5-1697-46a4-b5f6-958b4b4fee9f', 'Test With Img', 126, '2026-04-06 11:38:32', NULL),
('24c4d893-e906-4b96-acc7-eef581d14028', '07a8fa5e-25e6-4f66-964f-66093b6ea1d7', 'TEst123', 126, '2026-04-06 11:38:02', NULL),
('891f7132-a10b-4009-aaf2-0f0060775ae3', '0bac24e5-1697-46a4-b5f6-958b4b4fee9f', 'test', 126, '2026-04-06 12:51:02', NULL),
('c635fe74-9473-4d54-b644-fdfeb8e85275', '43cf1907-9b57-4677-a816-b54f87842a00', 'test', 126, '2026-04-06 11:49:27', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `job_visits`
--

CREATE TABLE `job_visits` (
  `id` char(36) NOT NULL,
  `job_id` char(36) NOT NULL,
  `visit_number` int NOT NULL,
  `scheduled_date` datetime DEFAULT NULL,
  `status` enum('SCHEDULED','IN_PROGRESS','AWAITING_APPROVAL','COMPLETED','CANCELED') NOT NULL DEFAULT 'SCHEDULED',
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
('114a6aa0-babf-4c77-ad74-7fa88db4811e', '14f31df9-5a77-4e7f-a33f-d43c7402378c', 1, '2026-04-04 00:00:00', 'SCHEDULED', NULL, NULL, NULL, '1', '2026-04-03 11:01:06', '2026-04-03 11:01:06'),
('13d0b7f0-6bbe-4fb4-b482-db6dcbefc73d', '0883db18-3350-4fb8-8af8-77bebd1506f8', 1, '2026-04-01 00:00:00', 'SCHEDULED', NULL, NULL, NULL, '122', '2026-04-01 20:55:37', '2026-04-01 20:55:37'),
('198287cd-e78d-4b75-b18e-d3a59c2aadac', 'bcdd5ead-3635-4861-b4ef-fdd60d14bfa7', 1, '2026-04-01 00:00:00', 'SCHEDULED', NULL, NULL, NULL, '122', '2026-04-01 20:55:37', '2026-04-01 20:55:37'),
('4507294f-0dea-4121-a90f-a172d5946751', '98cf7212-efa4-4fce-82dd-98686837b949', 1, '2026-04-01 00:00:00', 'SCHEDULED', NULL, NULL, NULL, '122', '2026-04-01 20:58:23', '2026-04-01 20:58:23'),
('545c11ad-7b8c-4fde-a796-fab0f57ce4d9', '65a2a132-b0fb-40d7-a3e1-784652a2a47f', 1, '2026-04-01 00:00:00', 'SCHEDULED', NULL, NULL, NULL, '1', '2026-04-01 18:58:38', '2026-04-01 18:58:38'),
('6e633b83-fc00-4d41-8bec-40507a904f3f', 'b53096a3-76ff-47ec-8117-e556c81ae477', 1, '2026-04-01 00:00:00', 'SCHEDULED', NULL, NULL, NULL, '1', '2026-04-01 19:27:29', '2026-04-01 19:27:29'),
('d9ac18a0-388a-4143-8f63-1a4f61d2693b', '40649193-7739-4564-a7fa-b86107a0112b', 1, '2026-04-02 00:00:00', 'SCHEDULED', NULL, NULL, NULL, '1', '2026-04-01 19:00:57', '2026-04-01 19:00:57'),
('e560e001-66b6-4bab-b8b6-b272797ab631', '69deee0c-0c0a-487b-ab78-11482213d251', 1, '2026-03-31 00:00:00', 'SCHEDULED', NULL, NULL, NULL, '1', '2026-04-01 17:49:09', '2026-04-01 17:49:09'),
('f7c895bb-246c-4e2a-a83f-05714a822e81', '088a331b-9b09-4f77-b17e-097842201175', 1, '2026-04-04 00:00:00', 'SCHEDULED', NULL, NULL, NULL, '1', '2026-04-03 10:27:56', '2026-04-03 10:27:56');

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
  `last_generated_until` date DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `recurring_rules`
--

INSERT INTO `recurring_rules` (`id`, `booking_id`, `supervisor_id`, `team`, `frequency`, `interval_value`, `day_of_week`, `week_of_month`, `days_of_week`, `day_of_month`, `start_date`, `end_date`, `last_generated_until`) VALUES
('11fee551-311a-4666-83e4-e38d40dd0d10', '40eb84b0-06e5-4d8e-9db5-12cff25f2d62', NULL, '[]', 'WEEKLY', 1, 6, NULL, '[6]', NULL, '2026-04-01', '2027-03-31', '2026-05-02'),
('1b6853cf-43a6-4372-be83-3ffaba27680b', '3f7d8bd4-7fb8-4f2e-95b2-1fa9840a6dfe', 125, '[123]', 'WEEKLY', 1, 0, NULL, '[0, 1, 3, 4, 5, 6]', NULL, '2026-04-01', '2027-03-31', '2026-05-06'),
('f500047a-8b9e-4d28-ab03-552599a46f4b', 'f4aae54b-0c7c-4d8c-b67e-fda044965ee5', 120, '[121]', 'WEEKLY', 1, 0, NULL, '[0, 1, 2]', NULL, '2026-03-31', '2026-04-30', '2026-04-28');

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
('job_code', 62);

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

--
-- Dumping data for table `sites`
--

INSERT INTO `sites` (`id`, `company_id`, `branch_id`, `address`, `city`, `state`, `is_active`, `created_at`, `updated_at`, `name`) VALUES
('8a631b2f-650c-4874-90f4-af1161c2666c', 'bc5a93ba-5f0c-4cfd-864a-c57b1c4e7f27', 'dd174504-4520-4e94-8d2a-5ee8f47c10da', 'Goa Central', 'Goa', 'Goa', 1, '2026-04-01 20:50:39', '2026-04-03 15:22:43', 'Panjim'),
('ab287c39-3d93-40b3-840d-3f0576f59122', 'b0f17486-efdb-4857-8b4d-7fee10ecb412', '12e69a76-2c18-11f1-9615-72ed8d604cd2', '2, A Building,', 'Bangalore', 'Karnatraka', 1, '2026-04-01 16:59:23', '2026-04-04 15:59:19', 'Hebbal');

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

--
-- Dumping data for table `supervisor_technicians`
--

INSERT INTO `supervisor_technicians` (`id`, `supervisor_id`, `technician_id`, `created_at`) VALUES
('8818c4bf-2ddd-11f1-a2fc-8ea8c7cd1e61', 125, 124, '2026-04-01 15:14:51'),
('8818e4ba-2ddd-11f1-a2fc-8ea8c7cd1e61', 125, 123, '2026-04-01 15:14:51'),
('b2ad1f0a-2dcb-11f1-8165-1250cb9c56af', 120, 121, '2026-04-01 13:07:12');

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

--
-- Dumping data for table `ticket_attachments`
--

INSERT INTO `ticket_attachments` (`id`, `ticket_id`, `message_id`, `object_key`, `created_at`) VALUES
('6ba1d84c-a239-4dde-92c6-fdb00cbfb24a', '73727d65-28ba-4fbc-8b64-82ae7ec38c86', '16ef80f7-a326-4abe-bb80-f25bdc693254', 'tickets/1775458516018_Infinite Atelier Structure Horizontal@2x.png', '2026-04-06 12:25:16'),
('80bb28cc-4cf5-45d2-a6a0-9f454e27ef57', '73727d65-28ba-4fbc-8b64-82ae7ec38c86', '16ef80f7-a326-4abe-bb80-f25bdc693254', 'tickets/1775458516034_Infinite Atelier@2x.png', '2026-04-06 12:25:16'),
('9964b5bf-55ae-4c2f-8e50-b78e64161272', '73727d65-28ba-4fbc-8b64-82ae7ec38c86', '16ef80f7-a326-4abe-bb80-f25bdc693254', 'tickets/1775458516037_Logo@2x.png', '2026-04-06 12:25:16');

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
(1, 'Admin User', 'admin@psops.com', '9999999999', '$2b$10$jokhppcJvUiUJW5YWQAD9eJu5rc5xjkay2hhbTkyiIeDbpBjS8ph6', 'admin', 1, '2025-12-13 11:32:47', '2026-03-31 13:20:44', NULL, NULL, NULL, NULL, '12e69a76-2c18-11f1-9615-72ed8d604cd2'),
(120, 'Abhi', 'chandan@psops.com', 'test', '$2b$10$8RfiD3f233PliGOz1iqTvemvnCL1Pll9LCCfy1HAMXlHw0lbOMt7S', 'branch_admin', 1, '2026-04-01 12:30:33', '2026-04-04 11:12:45', NULL, NULL, NULL, NULL, '12e69a76-2c18-11f1-9615-72ed8d604cd2'),
(121, 'Test Tech', 'testuser7@pspos.com', '8874141454', '$2b$10$YK82lAr5dKKQZ.sQxLvPCeQdZSbHuDXVj2JsQ0Kgn03EaDTOG0UUe', 'technician', 1, '2026-04-01 13:06:55', '2026-04-03 11:58:15', NULL, NULL, NULL, NULL, '12e69a76-2c18-11f1-9615-72ed8d604cd2'),
(122, 'Ravianna', 'Ravianna@psgindia.co.in', '8884442601', '$2b$10$OyanTgI8WuHN5/2KszVJc.t7MzYM5TxUdH2S4QhmuvK.x51538gdK', 'branch_admin', 1, '2026-04-01 15:08:23', '2026-04-01 15:09:05', NULL, NULL, NULL, NULL, 'dd174504-4520-4e94-8d2a-5ee8f47c10da'),
(123, 'Praveengoa', 'praveengoa@psgindia.co.in', '8884442602', '$2b$10$KMH3keGBCO5hQiDUCzAeQOUhHHKPEgeQAGwQOSjWRm91bru7Km1n.', 'technician', 1, '2026-04-01 15:10:51', '2026-04-01 15:14:13', NULL, NULL, NULL, NULL, 'dd174504-4520-4e94-8d2a-5ee8f47c10da'),
(124, 'Lakshmagoa', 'lakshmangoa@psgindia.co.in', '8884442603', '$2b$10$ZDPDJSH/dxsJ5hgLsowQF.9e6pb8BBDJbTwebfWe/lyHLc/VO.iqm', 'technician', 1, '2026-04-01 15:11:57', '2026-04-01 15:14:06', NULL, NULL, NULL, NULL, 'dd174504-4520-4e94-8d2a-5ee8f47c10da'),
(125, 'Rajangoa', 'rajangoa@psgindia.co.in', '8884442604', '$2b$10$adekRnc4wLfQTaiVKk6UXeHxb7rhNrdhzYhqSD421ccFfFvnQYKPe', 'supervisor', 1, '2026-04-01 15:12:52', '2026-04-03 08:34:33', NULL, NULL, NULL, NULL, 'dd174504-4520-4e94-8d2a-5ee8f47c10da'),
(126, 'TEst contact 1', 'testcontact1@gemail.con', '9987474787', '$2b$10$zGS0k10L2UEpAaXfYZl16OT/M3GkqtbdNYuhrwV1BpyGglLuIX5GW', 'client', 1, '2026-04-04 09:00:31', '2026-04-04 09:01:28', '98d129ca-2e27-49ac-874a-1fb4272c9b09', 'ACTIVE', NULL, NULL, '12e69a76-2c18-11f1-9615-72ed8d604cd2');

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
('04ef829b-5597-42d1-9d4c-5b7a66701a46', '545c11ad-7b8c-4fde-a796-fab0f57ce4d9', 121, '2026-04-01 13:28:38'),
('f83fa509-6e57-43d2-9ea5-3ce7a11b7b90', '6e633b83-fc00-4d41-8bec-40507a904f3f', 121, '2026-04-01 13:57:29');

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
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=47;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=127;

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

-- Restructure companies table into Group -> Company -> Site hierarchy

-- 1) Rename existing companies table to sites
RENAME TABLE companies TO sites;

-- 2) Prepare sites table
ALTER TABLE sites
  ADD COLUMN company_id CHAR(36) NULL AFTER id;

-- Preserve old company name for migration, and rename site column
ALTER TABLE sites
  CHANGE COLUMN name company_name_legacy VARCHAR(255) NULL,
  CHANGE COLUMN site name VARCHAR(255) NULL;

-- 3) Create groups table
CREATE TABLE `groups` (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_groups_name (name)
);

-- 4) Create companies table (legal entities)
CREATE TABLE companies (
  id CHAR(36) PRIMARY KEY,
  group_id CHAR(36) NULL,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(64) NULL,
  gst_number VARCHAR(64) NULL,
  type ENUM('CORPORATE','INDIVIDUAL','RWA') NULL,
  is_active TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_companies_group_id (group_id),
  CONSTRAINT fk_companies_group
    FOREIGN KEY (group_id) REFERENCES `groups`(id)
);

-- 5) Seed groups from legacy company names
INSERT INTO `groups` (id, name, created_at)
SELECT UUID(), t.company_name_legacy, NOW()
FROM (
  SELECT DISTINCT company_name_legacy
  FROM sites
  WHERE company_name_legacy IS NOT NULL AND company_name_legacy <> ''
) t;

-- 6) Seed companies from legacy data
INSERT INTO companies (id, group_id, name, code, gst_number, type, is_active, created_at)
SELECT UUID(), g.id, s.company_name_legacy, s.code, s.gst_number, s.type, IFNULL(s.is_active, 1), NOW()
FROM (
  SELECT DISTINCT company_name_legacy, code, gst_number, type, is_active
  FROM sites
) s
JOIN `groups` g ON g.name = s.company_name_legacy;

-- 7) Link sites to companies
UPDATE sites s
JOIN companies c
  ON c.name = s.company_name_legacy
 AND (c.code <=> s.code)
 AND (c.gst_number <=> s.gst_number)
SET s.company_id = c.id;

-- 8) Normalize site name
UPDATE sites
SET name = 'Main'
WHERE name IS NULL OR name = '';

-- 9) Index + uniqueness for sites
CREATE INDEX idx_sites_company_id ON sites (company_id);
CREATE UNIQUE INDEX uniq_sites_company_name ON sites (company_id, name);

-- 10) Drop legacy columns from sites
ALTER TABLE sites
  DROP COLUMN company_name_legacy,
  DROP COLUMN code,
  DROP COLUMN gst_number,
  DROP COLUMN type;

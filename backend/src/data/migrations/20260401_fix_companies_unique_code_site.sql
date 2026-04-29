-- Allow same company code across multiple sites by enforcing uniqueness on (code, site)

SET @schema_name = DATABASE();

-- Drop any UNIQUE index that is only on companies(code)
SET @code_only_index = (
  SELECT INDEX_NAME
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = 'companies'
    AND NON_UNIQUE = 0
  GROUP BY INDEX_NAME
  HAVING SUM(CASE WHEN COLUMN_NAME = 'code' THEN 1 ELSE 0 END) = 1
     AND COUNT(*) = 1
  LIMIT 1
);

SET @drop_sql = IF(
  @code_only_index IS NULL,
  'SELECT 1',
  CONCAT('ALTER TABLE companies DROP INDEX `', @code_only_index, '`')
);

PREPARE stmt FROM @drop_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add UNIQUE index on (code, site) if missing
SET @code_site_index = (
  SELECT INDEX_NAME
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = 'companies'
  GROUP BY INDEX_NAME
  HAVING SUM(CASE WHEN COLUMN_NAME = 'code' THEN 1 ELSE 0 END) = 1
     AND SUM(CASE WHEN COLUMN_NAME = 'site' THEN 1 ELSE 0 END) = 1
     AND COUNT(*) = 2
     AND MAX(NON_UNIQUE) = 0
  LIMIT 1
);

SET @add_sql = IF(
  @code_site_index IS NULL,
  'ALTER TABLE companies ADD UNIQUE INDEX uniq_companies_code_site (code, site)',
  'SELECT 1'
);

PREPARE stmt2 FROM @add_sql;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

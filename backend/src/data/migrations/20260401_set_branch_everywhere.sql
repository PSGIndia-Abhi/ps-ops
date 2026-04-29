-- Force all users and jobs to a single branch (per request)

UPDATE users
SET branch_id = '12e69a76-2c18-11f1-9615-72ed8d604cd2';

UPDATE jobs
SET branch_id = '12e69a76-2c18-11f1-9615-72ed8d604cd2';

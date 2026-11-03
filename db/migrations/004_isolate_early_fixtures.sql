-- Preserve early synthetic development fixtures without presenting them as partner work.
-- All subsequent automated tests use the separate rent2go_test database.
ALTER TABLE app_actor ADD COLUMN is_test_fixture boolean NOT NULL DEFAULT false;
UPDATE app_actor SET is_test_fixture=true
WHERE name IN ('Integration fixture','Regression fixture','Pagination fixture')
  AND email LIKE '%@example.test';

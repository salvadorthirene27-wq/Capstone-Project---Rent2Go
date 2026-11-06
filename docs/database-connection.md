# Local database connection

Use `npm run db:check` to check the configured restricted runtime connection. `npm run db:check -- --test` checks the isolated test database with the same restricted role; `--direct` checks the direct hostname. The command verifies the existing project/role/target, performs one read-only query and prints safe status information without credentials or raw provider errors.

On7 November2026 the previously failing native connection succeeded again with the existing URL and credentials. The exact earlier network fault is not established. A successful current connection is not evidence that the timeout was caused by the user, a password, a schema problem or a specific provider incident. The application retains node-postgres, original data and authorization boundaries; there is no silent transport fallback or automatic transaction replay.

If the command fails, retain its safe category/code, then compare the existing endpoint state and service-side access before changing configuration. Do not reset the database, rotate working credentials or provision another project simply because a connection timed out. After access returns, verify database-backed pages and authenticated workflows before reporting recovery.

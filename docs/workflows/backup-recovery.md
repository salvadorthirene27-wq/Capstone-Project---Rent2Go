# Private logical backup and isolated recovery

Use the configured new project only. `MIGRATION_DATABASE_URL` must identify the designated `rent2go_owner`, endpoint and `rent2go` source database. Direct verified TLS connections are required. The source guard refuses the former project, the test database, another endpoint and the runtime role. Use PostgreSQL client binaries matching the source major version; the workstation uses portable official EDB PostgreSQL17.11 clients without installing a Windows service or changing PATH.

## Export

Run from the application directory with absolute paths:

```powershell
npm run backup:export -- --tools C:/PATH/TO/POSTGRESQL/bin --folder C:/PRIVATE/OUTSIDE/REPOSITORY/new-package
```

The folder must be new and outside this repository. The exporter keeps one read-only repeatable-read database snapshot and passes its exported snapshot to `pg_dump`. It includes the application and managed-auth schemas, not merely the app rows. The private manifest stores exact sorted-row SHA256 fingerprints and row counts for every non-system table. It copies every non-fixture file referenced by the reviewed file-table mappings, checking byte length and the original saved hash. An unknown upload table, conflicting object references or corrupt/missing retained bytes stops the export instead of producing a successful manifest.

Fixture-marked actors deliberately have non-operational evidence placeholders. Their database records remain in the archive, while their placeholder object bytes are counted separately as excluded. Normal sample accounts and real users are not excluded. Both current and historical retained files are covered. The exporter does not dispatch email, call OCR, modify a policy, move funds or delete data.

The custom-format database archive includes sensitive managed-auth records and provider configuration stored in the database. Keep the entire package private and outside Git. Roles/passwords, environment secrets, external provider configuration that lives outside the database, and a live provider endpoint are separate recovery dependencies. The tool supplies trusted public CA certificates to libpq and keeps hostname/certificate verification enabled. Child-process passwords are passed through the process environment rather than command-line arguments. Raw export/restore diagnostics stay in the private package.

## Isolated restore verification

```powershell
npm run backup:verify-restore -- --tools C:/PATH/TO/POSTGRESQL/bin --folder C:/PRIVATE/OUTSIDE/REPOSITORY/existing-package
```

This verifies the archive and file hashes before creating a separate randomly named `rent2go_restore_YYYYMMDD_*` database on the same branch. It never restores over `rent2go`, `rent2go_test`, an existing database, or the current bucket. Public connection access is revoked on the new database. A failed attempt remains preserved; a subsequent attempt uses a fresh target. A package already carrying a successful verification is refused rather than creating another duplicate silently. No cleanup drops are automated.

The restore uses `--no-owner` and a single transaction with exit-on-error. The original archive remains unchanged. Only provider-owned `cloud_admin` DEFAULT ACL entries are commented out in a private restore catalog, since the ordinary Neon owner cannot alter that provider role's defaults. Ordinary object ACLs and every other owner's catalog entries remain selected. This is an explicit provider portability boundary; those original provider defaults remain in the backup. Role membership and source permissions are never expanded to bypass the restriction. Provider-managed ownership/defaults and external Auth endpoint cutover remain operator/provider steps for a real failover.

After restoration, every table's exact row-text hash and count must match the snapshot manifest, including managed-auth users, credentials, sessions and configuration. The runtime role's schema, table, column and function permissions must also match the source. File bytes are restored into a separate folder with the original keys and verified again. A successful private verification report records the actual isolated database, counts and this scope. This verifies logical data and file-byte recovery; it does not claim a completed live provider or bucket cutover. To perform a real recovery, first arrange the provider-specific ownership/defaults, deploy the saved configuration/credentials privately, restore objects to the designated bucket under the same keys, and verify sign-in, private-file access, holds, reports and notification settings before routing users there.

## Evidence and limits

The earlier application JSONL checkpoints remain useful application-only exports; they are not substitutes for this package. The local run uses the same branch and existing roles to avoid buying a plan or deleting snapshots to free a branch slot. The primary/test database names, running site and current storage bucket stay unchanged. No time ledger or private backup is committed.

Official references: [Neon backup with pg_dump](https://neon.com/docs/manage/backup-pg-dump), [Neon logical migration and ownership](https://neon.com/docs/import/migrate-from-postgres), [PostgreSQL pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html), and [official Windows client distributions](https://www.postgresql.org/download/windows/). Neon's [branch restore documentation](https://neon.com/docs/postgres/backup-restore/branch-restore) explains that database timeline restoration includes managed-auth data and does not restore object storage.

Observed8 November2026: the private package contains148 tables/2527 rows including9 managed-auth tables and51 checked objects;2 fixture placeholder objects are separately excluded. The isolated restore matched every recorded table and object fingerprint and1524 runtime-access entries. The unchanged archive retains2 provider-owned default-ACL entries that are isolated from the drill catalog. The first rejected transactional attempt was preserved, and the corrected verification used a fresh target. No existing data was reset to make the check pass. External service cutover was not exercised. Final425 unit/interface/route cases and TypeScript pass;6 cases specifically cover recovery target/path/row-hash/catalog safety.

A subsequent actual repeat-refusal check preserved the verification hash and kept the isolated database count at2 (the first rolled-back attempt and the successful clone). No duplicate database was created by the refused rerun.

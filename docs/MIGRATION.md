# Migration and release runbook

## Current boundary

Repository inspection found an empty public repository. The supplied Supabase project was absent from both connected account project lists; direct connector inspection returned permission denied. The already authenticated Chrome dashboard did allow a read-only SQL inspection of the exact project. It returned `tables: []`, `users: 0`, `buckets: []`; installed extensions were plpgsql, pg_stat_statements, uuid-ossp, pgcrypto and supabase_vault. No existing application data was found. `pg_cron` was not installed. No hosted migration, import or release has occurred. Applying grants/RLS through Windows UI awaits the confirmation required by the computer-use workflow. Real manager/member email identities are pending. Never paste a privileged key in chat.

## Inspect before applying

Use the exact project ref `mkhzwcuwirivrnrnrxoo`. Confirm owner, region, Postgres version, Auth configuration and data API settings. Read tables/columns/policies/functions/storage buckets, existing migrations, publication tables, advisors and available extensions. Check for conflicts with every `stc_*` object and the `stc_private` schema. Take and verify a backup using the project's supported backup/export tools. An unexpected name collision must stop the rollout.

The initial migration adds namespaced tables and private helpers. It does not drop/rename existing tables or delete data. It explicitly grants only required Data API permissions, enables RLS on every new public table, and grants no anonymous table access. Private buckets are separate from any old files. Publication changes add our tables without replacing the existing publication. Apply in a development/staging environment first; record its project ref and migration checksum.

The file was generated with the pinned Supabase CLI `migration new`. Review it, use authenticated MCP migration tooling or the documented CLI migration workflow, and record its application in migration history. Do not paste the script repeatedly into a live database. Full Supabase local services require Docker; this workspace instead verified SQL using PGlite Postgres with explicit Auth/Storage stand-ins. Publication delivery, Storage API behavior and platform advisors still require hosted verification.

## Trusted account bootstrap

Create/invite real users from Supabase Auth administration. Then, in an authenticated operator SQL session, insert their verified UUIDs into `public.stc_members` with the intended display name and role. No email or UUID has been invented by the implementation. The first manager is explicitly provisioned, never inferred from signup order or user-editable metadata. Browsers have no membership insert/update permission. Add the three team members only after verifying actual account identities and mapping historical labels. Revoke/disable memberships directly through trusted administration.

## First import

Extract the original workbook using the pinned Python dependency. The delivered private package contains the original bytes, archive JSON and reconciliation manifest. Sign in as the manager, upload both files in Historical archive, and wait for the atomic import to finish. Verify the batch SHA, five tabs, 317 rows and 38 candidate groups against the manifest. Repeat the import to verify no new batch/rows. Verify source cells, annotations, links, dates and source status labels. Do not promote every historical row automatically. Record decisions before creating current tasks.

## Scheduler

After verifying `pg_cron` support and existing `cron.job` entries, execute `supabase/operations/activate_scheduler.sql` as the trusted scheduler owner. This is deliberately separate from the base migration. Browser roles cannot execute the private digest function. The job runs hourly; deadline notices deduplicate by task/date, and the first run after 18:00 Cairo stores the daily cumulative status snapshot. The chosen 18:00 cutoff is an initial operational default. Adjust only with the team's agreed schedule. No email/Slack/WhatsApp is sent. Inspect cron run history and verify two consecutive runs do not duplicate notices/reports.

## Hosted acceptance gates

- Run two genuine member sessions and a manager session. A member cannot read another member's task/comments/files/events, insert tasks, change deadlines/assignees/roles, approve work or invoke the scheduler/import/promotion.
- Create/assign → member starts → Tomorrow preserves deadline → attach private file/comment → submit with note → manager receives live notification → request changes → resubmit → approve. Assert audit actors/timestamps and lock behavior.
- Verify optimistic concurrent updates fail cleanly, not silently overwrite. Confirm deactivated users lose row/file access, and verify platform token revocation for departing users.
- Test signed URLs expire; registered files cannot be overwritten/deleted by browser roles; failed metadata registration can clean up only the caller's unregistered object.
- Verify original download hash, archive replay, failed-batch rollback, row counts and provenance links.
- Verify Realtime row visibility, reconnection/polling, deadline job, saved snapshots, CSV export, RTL/LTR and mobile.
- Run security/performance advisors and fix findings. Check existing data counts against backup. Record all results.

## Vercel release

Select the intended Vercel account/team/project after the gates above pass. Configure only the two `NEXT_PUBLIC_SUPABASE_*` values from `.env.example`. Configure the intended domain in Supabase Auth URL settings. Pin the deployment to the tested Git commit, create and check a preview, then release production only after genuine hosted acceptance passes. Any privileged future integration credential must use server-only environment storage and must not use a `NEXT_PUBLIC_` prefix. The current app requires none.

## Recovery

Before activation, stop the rollout on any failed gate. After activation, disable the named cron job, roll back the app to its prior deployment and revoke application access if needed. Preserve new task/audit/archive data. Never run a down migration that drops evidence. Restore from a verified backup only through a separately reviewed recovery procedure with reconciliation of any post-backup work. This initial release does not automatically merge its development branch or deploy production.

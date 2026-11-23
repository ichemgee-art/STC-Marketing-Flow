# STC Marketing Flow

مساحة عمل لفريق STC: إسناد المهام، التنفيذ، التسليم للمراجعة، الاعتماد أو طلب تعديلات. عربي/إنجليزي مع RTL/LTR، واللوجو الأصلي بألوان navy `#253A55` وgold `#F3B820` والأبيض.

Next.js App Router + React + TypeScript + Supabase Auth/Postgres/RLS/Storage/Realtime. This repository started empty; no previous source files were replaced.

## Run

Requires Node 24 and pnpm 11.25.0.

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

The environment template contains only the supplied public project URL and publishable key. No privileged credential is required by the web application. There is no service-role client or public signup flow. The operator provisions Auth users and trusted membership records before first login.

```sh
pnpm typecheck
pnpm test
pnpm test:db
pnpm build
python -m pip install -r scripts/requirements.txt
python -m unittest discover -s tests -p 'test_*.py'
```

## Workflow

Managers assign a task to an active team member. Members see only their own tasks. Work moves through To Do, In Progress or Tomorrow, then Waiting for Review. A manager may approve a submission or request changes with a review note. Approved tasks and submissions awaiting review are locked. Tomorrow changes the Cairo planned work date, preserving the original deadline. Updates use an optimistic version check.

Task notes are append-only. Private attachments use signed downloads and remain immutable once registered. Task events record the actor, timestamp, previous row and new row. Database triggers generate assignment, submission and review notifications. Realtime refreshes tasks and notifications, with a one-minute polling fallback. Reports include status totals, overdue work and CSV export with spreadsheet-formula escaping. The calendar lists planned/due dates. The optional trusted hourly job generates deduplicated deadline notifications and daily snapshots after 18:00 Cairo.

## Historical import

The original workbook and extracted rows are **private data**, excluded from Git. No customer/team source rows are shipped in the public frontend bundle. Use the private import package delivered separately, or extract your own copy:

```sh
python scripts/extract_archive.py "STC Calendar.xlsx" private-import
```

A manager uploads `original.xlsx` and `archive.json` in Historical archive. The browser verifies the original file SHA-256; Storage preserves the original bytes and the transactional import checks source coordinates and row totals. Replaying the same file is a no-op. See [the mapping](docs/HISTORICAL_MAPPING.md) and [the migration/release runbook](docs/MIGRATION.md).

## Release status

Code builds and local Postgres security tests pass. Browser contract tests use explicit fixtures, not live accounts. The exact project `mkhzwcuwirivrnrnrxoo` was inspected through the already authenticated Chrome dashboard: public tables, Auth users and Storage buckets were all empty. Both connector accounts still lacked API access. **Hosted migration, account bootstrap, real Auth/Storage/Realtime checks, initial import, cron activation and production release remain pending.** The UI migration requires action-time confirmation under the computer-use workflow. Real team email identities are also required before account mapping. Do not deploy a working-looking login page as a completed system before those gates pass.

No production deployment or database modification has been performed by this initial implementation.

Reference documentation: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage policies](https://supabase.com/docs/guides/storage/security/access-control), [Realtime](https://supabase.com/docs/guides/realtime/postgres-changes), [Next.js](https://nextjs.org/docs/app/getting-started/installation).

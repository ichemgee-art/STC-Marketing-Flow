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

## Hosted environment — verified 2026-11-23

- **GitHub:** The complete Next.js application is already on the `main` branch. The development branch contains identical application files; merging divergent histories is unnecessary.
- **Supabase project:** `mkhzwcuwirivrnrnrxoo` — 4 linked Auth/member accounts (Nardine: manager; Gerges, Esraa, Fatma: members).
- **Database:** All 10 `stc_*` tables exist and have RLS enabled. Realtime publication includes tasks, notifications, comments, and attachments. The two Storage buckets are private.
- **Scheduler:** `stc-marketing-digest` is active; runs at minute 5 each hour.
- **History:** Original `STC Calendar.xlsx` is already in private `stc-history` Storage under SHA-256 `ca89dbd42d705b53abd5a56a30b2a5a804e5ffe28a8d38f76234db73e5751a78/original.xlsx`. **The 317 rows from five worksheets have NOT been inserted**: `stc_import_batches = 0`, `stc_archive_rows = 0`. Do not create artificial current tasks from old records.
- **Migration tracking:** Database objects were installed by a previous operator, but the connected Supabase migration history tool reports no tracked migrations. Do not rerun the initial `CREATE TABLE` migration against this live project; reconcile state safely before future schema changes.
- **Security review:** RLS is enabled. Supabase reports leaked-password protection disabled; enable it in Auth settings. Performance advisors recommend supplemental FK indexes and RLS auth-call optimization before scale.
- **Deployment:** A Vercel project has not yet been created. An earlier project/deployment API attempt returned 403 from the selected Vercel team. Use an account/team with permission to create projects; never invent a deployed URL.

## Deploy the `main` branch to Vercel

1. Open Vercel → Add New → Project, select the **`ichemgee-art/STC-Marketing-Flow`** GitHub repository and select `main` as the production branch.
2. Framework: **Next.js**, root directory: repository root, Node.js **24.x**. Use the committed `pnpm-lock.yaml`; package manager is `pnpm@11.25.0`.
3. Configure these **public** environment variables for Production and Preview:
   - `NEXT_PUBLIC_SUPABASE_URL=https://mkhzwcuwirivrnrnrxoo.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = the publishable key in `.env.example`
4. Run the first build, inspect Vercel build logs, and confirm the deployment reaches READY. Add the deployed origin to Supabase Auth URL configuration/redirect allowlist as needed for the chosen sign-in flow.
5. Sign in with real Nardine/Gerges/Esraa/Fatma credentials and validate each permission and the Waiting for Review → Approved/Changes Requested workflow.
6. Complete the historical import: from the manager's Historical archive screen, select the exact original `STC Calendar.xlsx` and its generated `archive.json`. The UI checks the file hash, and the import is idempotent. Verify **317 archived rows**, across Tasks (127), Fatma2 (47), Girgis (39), Esraa (55), Fatma (49), then re-run to verify no duplicates. The original file has already been uploaded, so no need to re-upload the same bytes manually.
7. Check private downloads, Realtime, browser/mobile, scheduler, and access isolation before announcing production readiness.

**Do not commit** workbook/employee data, the private extracted `archive.json`, service-role tokens, passwords, or `.env.local` to this public repository. See [migration and validation checklist](docs/MIGRATION.md) for detailed test gates.

Reference documentation: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage policies](https://supabase.com/docs/guides/storage/security/access-control), [Realtime](https://supabase.com/docs/guides/realtime/postgres-changes), [Next.js](https://nextjs.org/docs/app/getting-started/installation).
